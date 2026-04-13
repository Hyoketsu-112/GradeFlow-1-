# 🔄 Phase 3 Offline-First Sync Strategy (Weeks 19-20)

**Status**: 📋 Design Phase  
**Timeline**: Week 19-20 of Phase 3  
**Owner**: Sync/Backend Team

---

## 🎯 Objective

Build a **resilient offline-first sync engine** that:

- ✅ Works fully offline with local IndexedDB
- ✅ Syncs to Supabase when online
- ✅ Resolves conflicts automatically
- ✅ Shows clear sync status to users
- ✅ Retries failed syncs with backoff

---

## 📐 Architecture

```
┌─────────────────────────────────────────┐
│         GradeFlow Frontend              │
│  (Vanilla JS + Service Worker)          │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Local IndexedDB Cache           │   │
│  │ (Classes, Students, Scores)      │   │
│  └──────────────────────────────────┘   │
│           ↕ (sync)                      │
│  ┌──────────────────────────────────┐   │
│  │  Sync Engine                     │   │
│  │ - Queue & track changes          │   │
│  │ - Conflict resolution            │   │
│  │ - Retry logic                    │   │
│  └──────────────────────────────────┘   │
│           ↕ (upload/download)           │
└─────────────────────────────────────────┘
            ↓ (HTTPS)
       Supabase API
       PostgreSQL
```

---

## 🗂️ Local Storage Strategy

### IndexedDB Schema

```javascript
// Open or create database
const db = await openDatabase("gradeflow", 1, {
  // Object stores for each entity
  users: { keyPath: "id" },
  classes: { keyPath: "id", indexes: ["school_id"] },
  students: { keyPath: "id", indexes: ["class_id"] },
  scores: { keyPath: "id", indexes: ["student_id", "subject_id"] },
  attendance: { keyPath: "id", indexes: ["student_id", "date"] },
  materials: { keyPath: "id", indexes: ["class_id"] },
  quizzes: { keyPath: "id", indexes: ["class_id"] },

  // Sync tracking
  sync_queue: {
    keyPath: "id",
    indexes: ["entity_type", "status", "created_at"],
  },
  sync_metadata: { keyPath: "id" },
});
```

### Sync Queue Table

Track all pending changes for sync:

```javascript
{
  id: 'sync_123',
  entity_type: 'scores',     // 'students', 'scores', 'attendance', etc.
  entity_id: 'student_uuid',   // ID of changed entity
  operation: 'create',         // 'create', 'update', 'delete'
  payload: {...},              // Changed data
  status: 'pending',           // 'pending', 'syncing', 'synced', 'failed'
  error: null,                 // Error message if failed
  retry_count: 0,
  created_at: 1681234567,      // Timestamp
  synced_at: null
}
```

---

## 🔄 Sync Flow

### When Online → Sync

```
1. Network returns online
   ↓
2. Check sync_queue for pending items
   ↓
3. For each pending item:
   a. Mark as 'syncing'
   b. Push to Supabase
   c. On success: Mark as 'synced' + record timestamp
   d. On error: Increment retry_count, mark as 'failed'
   ↓
4. Retry failed items with exponential backoff
   ↓
5. Show sync status: "Synced: 45/50 items"
```

### Conflict Resolution

**Strategy**: Last-write-wins (LWW) with timestamp comparison

```javascript
// On sync conflict:
const local = { value: 85, updated_at: 1681234567 };
const remote = { value: 90, updated_at: 1681234568 };

if (remote.updated_at > local.updated_at) {
  // Remote is newer, use it
  useRemote(remote);
} else {
  // Local is newer, keep it and queue for re-sync
  useLocal(local);
  addToSyncQueue("update", local);
}
```

**For Scores specifically**:

- Each score component (test, prac, exam) has `updated_at`
- Merges by component (doesn't overwrite whole record)
- Example: If test changed remotely and practical changed locally, merge both

```javascript
// Merge scores
const merged = {
  ...remote,
  test:
    local.test_updated_at > remote.test_updated_at ? local.test : remote.test,
  practical:
    local.prac_updated_at > remote.prac_updated_at
      ? local.practical
      : remote.practical,
  exam:
    local.exam_updated_at > remote.exam_updated_at ? local.exam : remote.exam,
};
```

---

## 📱 Sync Status UI

### Status Indicator

```html
<!-- In sidebar/header -->
<div id="syncStatus" class="sync-badge">
  <span class="sync-badge__icon">○</span>
  <span class="sync-badge__text">Syncing...</span>
</div>
```

### States

```javascript
// Online, all synced
{ status: 'synced', icon: '✓', color: 'green', msg: 'All synced' }

// Syncing in progress
{ status: 'syncing', icon: '⟳', color: 'blue', msg: 'Syncing...' }

// Offline (queued)
{ status: 'offline', icon: '○', color: 'gray', msg: 'Offline - changes queued' }

// Sync error
{ status: 'error', icon: '⚠', color: 'red', msg: 'Sync failed - will retry' }

// Manually paused
{ status: 'paused', icon: '⏸', color: 'orange', msg: 'Sync paused' }
```

### Detailed Panel (Settings)

```
Sync Status Dashboard:
├─ Overall Status: ✓ All synced
├─ Last Sync: 2 minutes ago
├─ Pending Changes: 0
├─ Failed: 0
├─ Network: Online
└─ Actions: [Manual Sync] [Pause] [Settings]
```

---

## 🔁 Retry Logic

### Exponential Backoff

```javascript
const backoffDelays = [
  1000, // 1 second
  2000, // 2 seconds
  4000, // 4 seconds
  8000, // 8 seconds
  16000, // 16 seconds
  60000, // 1 minute
  300000, // 5 minutes
  3600000, // 1 hour
];

function getRetryDelay(retryCount) {
  return backoffDelays[Math.min(retryCount, backoffDelays.length - 1)];
}
```

### Max Retries

- Max 8 retries = ~2 hours total
- After that, item marked as "stalled"
- User can manually retry from sync dashboard

---

## 🔐 Offline Data Isolation

### Per-User Sync

- Each user has own IndexedDB partition
- Only syncs their school's data
- RLS policies enforced server-side

### Clearing Sync Queue

```javascript
// When user logs out
async function logOut() {
  // Option 1: Clear local cache (fresh on next login)
  await db.clear("sync_queue");

  // Option 2: Keep local cache (restore on next login)
  // - User can work offline, sync when back online
}
```

---

## 📊 Sync Metrics to Track

```javascript
// For monitoring and debugging
const syncMetrics = {
  totalChanges: 1245, // All-time
  syncedChanges: 1200, // Successfully synced
  pendingChanges: 12, // Queued
  failedChanges: 33, // Need retry
  syncDuration: 2340, // ms
  conflictsResolved: 5, // Auto-resolved
  manualRetries: 2, // User-initiated
  lastSyncAt: 1681234567,
  networkLatency: 145, // ms to Supabase
};
```

---

## 🧪 Testing Strategy (Week 20)

- [ ] Unit tests for sync engine
- [ ] Conflict resolution scenarios
- [ ] Retry logic with mocked network failures
- [ ] Offline → Online transitions
- [ ] Multiple edits from different devices
- [ ] Large data syncs (1000+ records)
- [ ] Network throttling scenarios
- [ ] IndexedDB full/quota exceeded

---

## 📋 Week 19-20 Checklist

- [ ] Design IndexedDB schema
- [ ] Implement sync queue mechanism
- [ ] Build push (to Supabase) logic
- [ ] Build pull (from Supabase) logic
- [ ] Implement conflict resolution
- [ ] Build sync status UI
- [ ] Implement retry logic with backoff
- [ ] Add sync metrics/diagnostics
- [ ] Create sync dashboard view
- [ ] Write comprehensive tests
- [ ] Document for next phase

---

## 📚 References

- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Offline-First Architecture](https://offlinefirst.org/)
- [CouchDB Sync Protocol](https://docs.couchdb.org/en/stable/replication/protocol.html)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)

**Status**: 📋 Ready for implementation  
**Owner**: Sync Team  
**Last Updated**: April 13, 2026
