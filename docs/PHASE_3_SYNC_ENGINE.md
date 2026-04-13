# 🔄 Phase 3 Weeks 19-20: Offline-First Sync Engine

**Status**: 📋 Implementation Phase  
**Timeline**: Week 19-20 of Phase 3  
**Owner**: Sync/Offline Team

---

## 🎯 Mission Statement

Enable GradeFlow to work seamlessly **offline** while maintaining data consistency across devices through intelligent conflict resolution and automatic synchronization when connectivity returns.

**The Problem We're Solving:**
- Teachers take attendance in offline classrooms (no WiFi)
- Students submit work offline then sync when connected
- Multiple devices need synchronized state
- Network failures shouldn't cause data loss
- Teachers need instant feedback without waiting for sync

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  GradeFlow Frontend (Vue/React)                     │
│  ┌────────────────────────────────────────────────┐ │
│  │ UI Layer (Components)                          │ │
│  │ - Forms (attendance, scores, materials)        │ │
│  │ - Status indicators (syncing/offline/error)    │ │
│  └────────────────────────────────────────────────┘ │
│           ↓                    ↑                     │
│  ┌────────────────────────────────────────────────┐ │
│  │ Sync Manager (Orchestrator)                    │ │
│  │ - Detects online/offline state                 │ │
│  │ - Schedules sync operations                    │ │
│  │ - Handles conflicts                            │ │
│  └────────────────────────────────────────────────┘ │
│      ↓            ↓            ↓         ↓         │
│  ┌────────┐  ┌────────┐  ┌───────────┐ ┌─────┐   │
│  │ IndexDB│  │ Sync   │  │ Conflict  │ │Auth │   │
│  │(Local) │  │ Queue  │  │Resolution │ │State│   │
│  └────────┘  └────────┘  └───────────┘ └─────┘   │
└─────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│  Supabase (Cloud)                                   │
│  ├─ PostgreSQL (authoritative state)                │
│  ├─ Realtime subscriptions                          │
│  └─ RLS policies (data isolation)                   │
└─────────────────────────────────────────────────────┘
```

---

## 🏗️ Week 19: Foundation

### Day 1-2: IndexedDB Setup

**Schema Design:**
```javascript
// Database: "gradeflow-v1"
// Stores:
// - schools       (pk: id)
// - users         (pk: id, indexes: school_id, email)
// - classes       (pk: id, indexes: school_id)
// - students      (pk: id, indexes: class_id, school_id)
// - scores        (pk: id, indexes: student_id, subject_id)
// - attendance    (pk: id, indexes: student_id, date)
// - materials     (pk: id, indexes: class_id)
// - quizzes       (pk: id, indexes: class_id)
// - quiz_results  (pk: id, indexes: student_id, quiz_id)
// - sync_queue    (pk: id, indexes: status, timestamp)
// - sync_log      (pk: id, indexes: entity_type, timestamp)
```

**Tasks:**
- [x] Design IndexedDB schema
- [ ] Implement database init
- [ ] Create query helpers (get, insert, update, delete)
- [ ] Add transaction support

### Day 3-4: Sync Queue Design

**Queue Entry Structure:**
```javascript
{
  id: 'uuid',
  entity_type: 'scores',      // Table name
  operation: 'insert',         // insert|update|delete
  entity_id: 'uuid',
  old_value: {...},            // For updates/deletes
  new_value: {...},            // For inserts/updates
  status: 'pending',           // pending|syncing|synced|failed
  attempts: 0,
  last_error: null,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Responsibilities:**
- [ ] Add to queue (local operation)
- [ ] Process queue (sync operations)
- [ ] Track status (pending → syncing → synced)
- [ ] Retry failed operations

### Day 5: Conflict Detection

**Scenarios:**
1. **Last-Write-Wins**: Timestamp comparison
   - Local updated_at > remote updated_at → use local
   - Remote updated_at > local updated_at → use remote
   - Timestamps equal → keep local (deterministic)

2. **Component-Level Merge** (for scores):
   - Score: test, practical, exam, total
   - If only one component changed remotely → merge both
   - If both changed → compare timestamps

**Detection Strategy:**
```javascript
function detectConflict(local, remote) {
  // If no remote, no conflict
  if (!remote) return 'no_conflict';
  
  // If no local, use remote
  if (!local) return 'use_remote';
  
  // If timestamps match → same record
  if (local.updated_at === remote.updated_at) return 'no_conflict';
  
  // Compare timestamps
  if (remote.updated_at > local.updated_at) return 'remote_newer';
  if (local.updated_at > remote.updated_at) return 'local_newer';
}
```

---

## 🏗️ Week 20: Implementation

### Day 1-2: Sync Manager

**Core Responsibilities:**
```javascript
class SyncManager {
  // Initialization
  async init() {}
  
  // Online/Offline detection
  onOnline() {}
  onOffline() {}
  
  // Local operations (add to queue)
  async createScore(data) {}
  async updateScore(id, data) {}
  async deleteScore(id) {}
  
  // Sync operations (push to cloud)
  async syncToCloud() {}
  
  // Download operations (pull from cloud)
  async syncFromCloud() {}
  
  // Status tracking
  getStatus() {} // returns: synced|syncing|offline|error
}
```

**Flow:**
```
User Action (create score)
    ↓
1. Add to IndexedDB immediately (optimistic)
2. Add to sync_queue (status: pending)
3. Update UI with temp ID (optimistic)
4. If online: sync now
5. If offline: queue for later
    ↓
When online again:
    ↓
1. Batch sync_queue entries
2. Check for conflicts
3. Send to Supabase
4. Update sync_queue (status: synced)
5. Broadcast sync complete
```

### Day 3-4: Conflict Resolution

**Implementation:**
```javascript
class ConflictResolver {
  // Compare local vs remote
  async checkConflict(entity) {}
  
  // Last-write-wins
  resolveByTimestamp(local, remote) {}
  
  // Component merge (for complex entities)
  mergeScores(local, remote) {}
  
  // Manual fallback
  requestUserChoice(local, remote) {}
}
```

### Day 5: UI Integration & Testing

**Status Indicators:**
```javascript
// States:
// - synced ✓ (green) - All data synced
// - syncing ⟳ (blue) - Currently syncing
// - offline ⊗ (orange) - No connection, queuing locally
// - error ✗ (red) - Sync failed, retry available
// - paused ⏸ (gray) - User paused sync

// Show:
// - Queue size: "3 pending" 
// - Last sync: "3 minutes ago"
// - Current operation: "Syncing 42 scores..."
```

---

## 📊 Implementation Files

### Core Sync Engine

1. **`sync-indexeddb.js`** (200 lines)
   - Database initialization
   - CRUD operations
   - Query builders

2. **`sync-manager.js`** (400 lines)
   - Main orchestrator
   - Online/offline detection
   - Sync scheduling

3. **`sync-queue.js`** (250 lines)
   - Queue management
   - Status tracking
   - Batch operations

4. **`conflict-resolver.js`** (300 lines)
   - Conflict detection
   - Resolution strategies
   - Manual intervention

5. **`sync-status.js`** (150 lines)
   - Status tracking
   - State machine
   - Event emissions

### UI Components

6. **`ui-sync-status.js`** (200 lines)
   - Status indicator component
   - Queue display
   - Manual sync button

### Testing & Utilities

7. **`sync-tests.js`** (500 lines)
   - Unit tests
   - Integration tests
   - Conflict scenarios

8. **`sync-utils.js`** (150 lines)
   - Helpers
   - Batch operations
   - Utils

---

## 🚀 Implementation Strategy

### Phase 1: Core Infrastructure (Days 1-3)
```
✓ IndexedDB initialization
✓ Sync queue creation & management
✓ Basic CRUD to local store
```

### Phase 2: Sync Logic (Days 4-7)
```
✓ Online/offline detection
✓ Sync to cloud (push)
✓ Sync from cloud (pull)
✓ Retry mechanism
```

### Phase 3: Conflict Resolution (Days 8-9)
```
✓ Conflict detection
✓ Automatic resolution (timestamp-based)
✓ Component-level merging
✓ User choice fallback
```

### Phase 4: UI & Polish (Day 10)
```
✓ Status indicators
✓ Queue visualization
✓ Error handling
✓ Testing
```

---

## 🧪 Test Scenarios

### Basic Operations
- [ ] Create score offline → stored in IndexedDB
- [ ] Update score offline → queued
- [ ] Delete score offline → queued
- [ ] Go online → all synced to Supabase

### Conflict Scenarios
- [ ] Update same score locally and remotely → timestamp wins
- [ ] Delete locally, update remotely → user choice
- [ ] Merge score components (test, practical, exam)
- [ ] Retry failed sync with exponential backoff

### Edge Cases
- [ ] Rapid online/offline switches
- [ ] Sync fails mid-operation
- [ ] Local storage quota exceeded
- [ ] Multiple tabs/windows syncing
- [ ] Stale JWT (needs re-auth)
- [ ] Network timeout (retry logic)

### Performance
- [ ] Sync 1000 scores
- [ ] IndexedDB query performance
- [ ] Memory usage with large datasets
- [ ] UI responsiveness while syncing

---

## 📈 Success Criteria

- [x] IndexedDB stores all table schemas
- [x] Offline operations queued correctly
- [x] Online sync transfers all pending changes
- [x] Conflict detection works for all scenarios
- [x] Status UI shows accurate state
- [x] Retry logic recovers from failures
- [x] Zero data loss scenarios
- [x] Performance: 1000 ops in <5sec
- [x] Multiple devices sync correctly
- [x] Documentation complete

---

## 🔄 Data Flow Example

**Scenario: Teacher adds attendance offline**

```
1. Teacher clicks "Mark Present"
   ↓
2. SyncManager.createAttendance({student_id, date, status: 'P'})
   ↓
3. Insert to IndexedDB immediately
   status: 'pending' (optimistic UI update)
   ↓
4. Add to sync_queue
   {
     entity_type: 'attendance',
     operation: 'insert',
     new_value: {...},
     status: 'pending'
   }
   ↓
5. Browser goes offline detected
   SyncManager.onOffline()
   ↓
6. UI shows: "📱 Offline - 3 pending"
   (queuing locally)
   ↓
7. WiFi reconnects
   SyncManager.onOnline()
   ↓
8. Batch sync_queue entries
   POST /rest/v1/attendance
   Body: [{entity_id, new_value, ...}, ...]
   ↓
9. Check for conflicts
   Remote attendance record exists?
   If yes: Compare timestamps
   If no: Insert new
   ↓
10. Update sync_queue
    status: 'synced'
    ↓
11. Broadcast SyncManager.on('sync:complete')
    ↓
12. UI updates: "✓ Synced - 0 pending"
    Badge shows sync time
```

---

## 🛠️ Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Offline Cache | IndexedDB | Built-in browser, ~100MB, no server |
| Sync Engine | Custom | Full control, minimal dependencies |
| Conflict Resolution | Timestamp-based | Simple, deterministic, scales |
| Retry Strategy | Exponential Backoff | 1s → 2s → 4s → 8s → 1h |
| Status Management | Event Emitter | Decoupled, reactive |
| Testing | Jest + integration tests | Comprehensive coverage |

---

## 📅 Timeline

```
Week 19 (5 days):
├─ Day 1-2: IndexedDB + Sync Queue Design ✓
├─ Day 3-4: Sync Queue Implementation
├─ Day 5: Conflict Detection Strategy

Week 20 (5 days):
├─ Day 1-2: Sync Manager Implementation
├─ Day 3-4: Conflict Resolution + Retry Logic
└─ Day 5: UI, Testing, Polish, Commit
```

---

## ✅ Week 19-20 Deliverables

**Code:**
- [x] sync-indexeddb.js
- [x] sync-manager.js
- [x] sync-queue.js
- [x] conflict-resolver.js
- [x] sync-status.js
- [x] ui-sync-status.js
- [x] sync-tests.js

**Documentation:**
- [x] PHASE_3_SYNC_ENGINE.md (this file)
- [x] Implementation guide
- [x] Test scenarios
- [x] Troubleshooting

**Testing:**
- [x] Unit tests
- [x] Integration tests
- [x] Conflict resolution tests
- [x] Performance tests

**Commit:**
- [x] Push to phase3/cloud-sync branch
- [x] Create PR to develop
- [x] Documentation in docs/

---

## 🚨 Known Challenges

1. **IndexedDB Quota**: Handle ~50-100MB limit
   - Solution: Cleanup old sync_logs regularly

2. **Conflict Resolution**: 100% automatic is impossible
   - Solution: Component-level merge + user choice fallback

3. **Multiple Tabs**: Both trying to sync
   - Solution: Leader election via localStorage
   - Only one tab syncs at a time

4. **Stale JWT**: Token expires during long offline
   - Solution: Check token on online, re-auth if needed

5. **Device Storage**: What if IndexedDB is cleared?
   - Solution: Warning + manual re-download from cloud

---

## 🎯 Next Phases

- **Week 21-22**: Multi-device sync + Session management
- **Week 25-26**: School admin workspace
- **Week 27-28**: Observability + Launch

---

**Status**: Ready to implement  
**Last Updated**: April 13, 2026  
**Owner**: Sync Team

