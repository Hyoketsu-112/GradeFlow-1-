# 🔄 Sync Engine Implementation Guide

Complete guide to integrate the offline-first sync engine with conflict resolution into GradeFlow.

## 📋 Quick Start

### 1. Initialize Components

```javascript
// Initialize sync engine with conflict strategy
const syncEngine = new SyncEngine(
  supabaseClient,      // Supabase client instance
  'remote_wins'        // Conflict strategy: 'remote_wins', 'local_wins', or 'manual'
);

// Initialize local database
await syncEngine.initialize();

// Listen for sync events
syncEngine.on('onStatusChange', (data) => {
  console.log('Sync status:', data);
});
```

### 2. Add UI Status Indicators

```html
<!-- In your HTML -->
<div id="sync-indicator"></div>
<div id="offline-indicator"></div>
```

```javascript
// Initialize UI components
const statusUI = new SyncStatusUI('sync-indicator', syncEngine);
statusUI.initialize();

const offlineIndicator = new OfflineIndicator('offline-indicator');
offlineIndicator.initialize();
```

### 3. Queue Changes for Sync

```javascript
// When user creates/updates/deletes, queue instead of sync immediately
await syncEngine.queueChange({
  operation: 'INSERT',
  table: 'scores',
  record: {
    id: generateId(),
    student_id: 'abc123',
    score: 85,
    subject: 'Math'
  }
});

// When online, changes automatically sync
// When offline, queued and retried when back online
```

---

## 🏗️ Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interaction                          │
├─────────────────────────────────────────────────────────────┤
│                         ↓                                    │
│                   SyncStatusUI (Displays Status)             │
│                         ↓                                    │
│                    SyncEngine                                │
│         ┌──────────────────┬──────────────────┐              │
│         ↓                  ↓                  ↓              │
│     SyncQueue      IndexedDBStore      Supabase             │
│  (Queue Ops)      (Local Cache)        (Remote)             │
│         └──────────────────┬──────────────────┘              │
│                         ↓                                    │
│              Conflict Resolution Engine                      │
│                         ↓                                    │
│                    Back to IndexedDB                         │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Purpose |
|-----------|---------|
| **SyncEngine** | Orchestrates all sync operations, handles conflicts, manages retries |
| **IndexedDBStore** | Local SQLite-like database, supports querying and transactions |
| **SyncQueue** | Tracks pending changes, manages retry with exponential backoff |
| **SyncStatusUI** | Real-time UI feedback (syncing, synced, error, offline) |

---

## 💾 Database Schema

### IndexedDB Stores

```javascript
{
  schools: { keyPath: 'id', indexes: ['code', 'name'] },
  users: { keyPath: 'id', indexes: ['email', 'school_id', 'role'] },
  classes: { keyPath: 'id', indexes: ['school_id', 'name'] },
  students: { keyPath: 'id', indexes: ['class_id', 'school_id', 'email'] },
  scores: { keyPath: 'id', indexes: ['student_id', 'class_id', 'subject_id', 'term'] },
  attendance: { keyPath: 'id', indexes: ['student_id', 'date', 'class_id'] },
  materials: { keyPath: 'id', indexes: ['class_id'] },
  quizzes: { keyPath: 'id', indexes: ['class_id'] },
  quiz_results: { keyPath: 'id', indexes: ['student_id', 'quiz_id'] },
  audit_logs: { keyPath: 'id', indexes: ['school_id', 'created_at'] },
  
  // Sync-specific stores
  sync_queue: { keyPath: 'id', indexes: ['status', 'entity_type', 'created_at'] },
  sync_metadata: { keyPath: 'key' }
}
```

---

## 🔄 Integration Scenarios

### Scenario 1: Create a New Score (Offline)

```javascript
// User creates score while offline
await syncEngine.queueChange({
  operation: 'INSERT',
  table: 'scores',
  record: {
    id: crypto.randomUUID(),
    student_id: 'stu_123',
    score: 92,
    subject_id: 'sub_math',
    created_at: new Date().toISOString()
  }
});

// UI immediately shows in local database
// Badge shows "1 pending"
// When connection restored, automatically syncs
```

### Scenario 2: Update Attendance (Online/Offline)

```javascript
// Works seamlessly online or offline
await syncEngine.queueChange({
  operation: 'UPDATE',
  table: 'attendance',
  entity_id: 'att_456',
  record: {
    status: 'present',
    updated_at: new Date().toISOString()
  }
});

// If sync fails (e.g., Supabase down), local copy remains valid
// User sees UI update immediately
// Retries automatically with backoff
```

### Scenario 3: Delete with Conflict (Concurrent Edit)

```javascript
// Two devices edit same student attendance simultaneously
// Device 1: Sets status='absent'
// Device 2: Sets status='present'

// When sync runs, SyncEngine detects conflict:
// - If conflict_strategy='remote_wins': Uses Device 2's value
// - If conflict_strategy='local_wins': Keeps Device 1's value
// - If conflict_strategy='manual': Shows notification for user choice

syncEngine.on('onConflict', (data) => {
  console.log('Conflict detected:', data);
  // Notify user, ask for resolution
});
```

### Scenario 4: Manual Conflict Resolution

```javascript
const syncEngine = new SyncEngine(supabaseClient, 'manual');

syncEngine.on('onConflict', async (data) => {
  // Show modal to user asking which version to keep
  const userChoice = await showConflictResolutionModal(data);
  
  // Resolve using user's choice
  await syncEngine.resolveConflict(data.queueId, userChoice);
});
```

---

## 📊 Real-Time Status Monitoring

### Listen to Sync Events

```javascript
// Sync started
syncEngine.on('onSyncStart', (data) => {
  console.log(`Syncing ${data.pendingCount} changes...`);
  statusUI.showSyncing(data);
});

// Sync completed
syncEngine.on('onSyncEnd', (data) => {
  console.log(`${data.syncedCount} synced, ${data.failedCount} failed`);
  statusUI.showSyncComplete(data);
});

// Error during sync
syncEngine.on('onError', (data) => {
  console.error('Sync error:', data.error);
  statusUI.showError(data);
});

// Status changed
syncEngine.on('onStatusChange', (data) => {
  console.log('Status:', data.status, '| Message:', data.message);
});

// Conflict detected
syncEngine.on('onConflict', (data) => {
  console.log('Conflict in', data.table);
  statusUI.showConflict(data);
});
```

---

## 🛠️ API Reference

### SyncEngine

#### Methods

```javascript
// Initialize sync engine and local database
await syncEngine.initialize();

// Queue a change for sync
await syncEngine.queueChange({
  operation: 'INSERT|UPDATE|DELETE',
  table: 'table_name',
  entity_id: 'optional_record_id',
  record: {...},
  old_data: {...}  // For conflict detection
});

// Manually trigger sync
await syncEngine.sync();

// Get current queue status
const stats = syncEngine.getQueueStats();
// { pending: 2, syncing: 0, synced: 10, failed: 0, retryDue: 1 }

// Get sync metadata
const metadata = await syncEngine.getSyncMetadata();
// { lastSync: '2024-01-15T10:30:00Z', ... }

// Resolve conflict manually
await syncEngine.resolveConflict(queueId, resolution);

// Clear queue
await syncEngine.clearQueue();

// Export data for backup
const backup = await syncEngine.exportData();

// Import data from backup
await syncEngine.importData(backup);

// Close sync engine
syncEngine.close();
```

#### Events

```javascript
// All events
syncEngine.on('onStatusChange', handler);
syncEngine.on('onSyncStart', handler);
syncEngine.on('onSyncEnd', handler);
syncEngine.on('onError', handler);
syncEngine.on('onConflict', handler);
syncEngine.on('onRetry', handler);
syncEngine.on('onSynced', handler);
syncEngine.on('onFailed', handler);
```

### IndexedDBStore

```javascript
// Initialize
await store.initialize();

// CRUD operations
await store.insert('users', { id: '123', name: 'John' });
await store.update('users', '123', { name: 'Jane' });
await store.upsert('users', { id: '123', name: 'Jane' });
await store.delete('users', '123');
const user = await store.get('users', '123');

// Query with filters
const scores = await store.query('scores', { student_id: 'stu_123' });
const allUsers = await store.getAll('users');

// Batch operations
await store.batchInsert('scores', [score1, score2, score3]);
await store.batchUpdate('scores', [updated1, updated2]);

// Utilities
const count = await store.count('scores');
await store.clearStore('scores');
await store.clearAll();

// Backup/restore
const backup = await store.exportData();
await store.importData(backup);

const stats = await store.getStats();
store.close();
```

### SyncStatusUI

```javascript
const statusUI = new SyncStatusUI('element-id', syncEngine);

// Initialize
statusUI.initialize();

// Get status
const status = statusUI.getStatus();

// Show notifications
statusUI.showNotification('Changes synced!', 'success');
statusUI.showNotification('Sync failed', 'error', 5000);

// Update status manually
statusUI.updateStatus({ status: 'synced', message: 'All up to date' });

// Cleanup
statusUI.destroy();
```

---

## ⚙️ Configuration

### Conflict Resolution Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `remote_wins` | Always use server version | Single input source |
| `local_wins` | Always use client version | Collaborative editing |
| `manual` | Ask user to choose | High-value decisions |

### Retry Configuration

```javascript
const syncEngine = new SyncEngine(supabaseClient, 'remote_wins', {
  maxRetries: 8,              // Max retry attempts
  initialBackoff: 1000,       // First retry in 1s
  maxBackoff: 3600000,        // Cap retry at 1h
  autoSync: true,             // Sync when online
  autoSyncInterval: 30000,    // Check every 30s
  conflictStrategy: 'remote_wins'
});
```

---

## 🔍 Debugging

### Check Sync Queue

```javascript
// Get detailed queue stats
console.log(syncEngine.getQueueStats());
// { pending: 2, syncing: 0, synced: 45, failed: 1, retryDue: 0 }

// Print queue contents
syncEngine.queue.debug();

// Get all failed items
const failed = syncEngine.queue.getFailed();
console.log('Failed operations:', failed);

// Manually retry failed items
const retryDue = syncEngine.queue.getRetryDue();
for (const item of retryDue) {
  await syncEngine.syncItem(item.id);
}
```

### Export Database

```javascript
// Backup entire local database
const backup = await syncEngine.exportData();
console.log(JSON.stringify(backup, null, 2));

// Save to file
const json = JSON.stringify(backup);
const blob = new Blob([json], { type: 'application/json' });
const href = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = href;
a.download = 'gradeflow-backup ' + new Date().toISOString() + '.json';
a.click();
```

### Monitor Network

```javascript
// Listen for online/offline
window.addEventListener('online', () => {
  console.log('Coming online, starting sync...');
  syncEngine.sync();
});

window.addEventListener('offline', () => {
  console.log('Going offline, pausing auto-sync');
});
```

---

## 📱 Frontend Integration Example

### Complete Setup

```javascript
// 1. Initialize at app startup
async function initGradeFlow() {
  // Initialize Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Initialize sync engine
  window.syncEngine = new SyncEngine(supabase, 'remote_wins');
  await window.syncEngine.initialize();
  
  // Initialize UI components
  window.statusUI = new SyncStatusUI('sync-indicator', window.syncEngine);
  window.statusUI.initialize();
  
  window.offlineIndicator = new OfflineIndicator('offline-indicator');
  window.offlineIndicator.initialize();
  
  // Setup event handlers
  setupSyncEventHandlers();
  
  console.log('✓ GradeFlow initialized');
}

// 2. When user creates score
async function submitScore({ studentId, score, subject }) {
  const record = {
    id: crypto.randomUUID(),
    student_id: studentId,
    score: score,
    subject_id: subject,
    created_at: new Date().toISOString()
  };
  
  // Queue for sync (works offline)
  await window.syncEngine.queueChange({
    operation: 'INSERT',
    table: 'scores',
    record: record
  });
  
  // Update UI immediately
  updateScoresUI();
  
  // Auto-syncs when online
}

// 3. Listen for events
function setupSyncEventHandlers() {
  window.syncEngine.on('onSyncEnd', (data) => {
    if (data.syncedCount > 0) {
      window.statusUI.showNotification(
        `${data.syncedCount} change${data.syncedCount !== 1 ? 's' : ''} synced`,
        'success'
      );
    }
  });
  
  window.syncEngine.on('onError', (data) => {
    window.statusUI.showNotification(
      `Sync error: ${data.error.message}`,
      'error'
    );
  });
  
  window.syncEngine.on('onConflict', async (data) => {
    const resolve = confirm(`Conflict in ${data.table}. Use server version?`);
    await window.syncEngine.resolveConflict(data.queueId, resolve ? 'remote' : 'local');
  });
}

// Start on page load
document.addEventListener('DOMContentLoaded', initGradeFlow);
```

---

## 🧪 Testing

### Unit Tests

```javascript
// Test sync queue
async function testSyncQueue() {
  const queue = new SyncQueue();
  
  const id = await queue.add({
    operation: 'INSERT',
    entity_type: 'scores',
    data: {...}
  });
  
  assert(queue.getPending().length === 1);
  assert(queue.getStats().pending === 1);
  
  await queue.markSynced(id);
  assert(queue.getPending().length === 0);
  assert(queue.getStats().synced === 1);
  
  console.log('✓ SyncQueue tests passed');
}

// Test IndexedDB
async function testIndexedDB() {
  const store = new IndexedDBStore('test_db');
  await store.initialize();
  
  await store.insert('users', { id: '1', name: 'Test' });
  const user = await store.get('users', '1');
  
  assert(user.name === 'Test');
  
  await store.update('users', '1', { name: 'Updated' });
  const updated = await store.get('users', '1');
  
  assert(updated.name === 'Updated');
  
  console.log('✓ IndexedDB tests passed');
}
```

---

## 📈 Performance Considerations

### Optimization Tips

1. **Batch Operations**: Use `batchInsert` and `batchUpdate` for multiple records
2. **Query Filters**: Use indexed fields in queries for faster lookup
3. **Cleanup**: Regularly clear synced items to keep queue small
4. **Compression**: Compress large data before queuing
5. **Lazy Loading**: Don't load all data at startup, use pagination

### Monitor Performance

```javascript
// Check database size
const stats = await store.getStats();
console.log('Database stats:', stats);

// Monitor queue memory
const backup = await syncEngine.exportData();
const memoryUsage = JSON.stringify(backup).length / 1024 / 1024;
console.log(`Memory usage: ${memoryUsage.toFixed(2)}MB`);

// Performance metrics
console.time('Sync');
await syncEngine.sync();
console.timeEnd('Sync');
```

---

## 🚀 Production Deployment

### Pre-deployment Checklist

- [ ] Test offline functionality thoroughly
- [ ] Verify conflict resolution works as expected
- [ ] Check memory usage with large datasets
- [ ] Set appropriate retry/backoff limits
- [ ] Test on slow networks (throttle in DevTools)
- [ ] Verify UI status indicators are correct
- [ ] Test database export/import
- [ ] Implement error logging/monitoring
- [ ] Plan for database migrations
- [ ] Document for team

### Error Handling

```javascript
try {
  await syncEngine.sync();
} catch (error) {
  // Log to monitoring service
  logError({
    message: error.message,
    stack: error.stack,
    context: 'sync_failed',
    timestamp: new Date().toISOString()
  });
  
  // Show user-friendly message
  statusUI.showNotification('Sync failed, will retry automatically', 'error');
}
```

---

## 📞 Support & Issues

For issues or questions:
contact: email, GitHub issues, documentation

---

## 📖 References

- Supabase JS Client: https://supabase.com/docs/reference/javascript
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Conflict Resolution: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type
- Offline-First: https://offlinefirst.org/

---

**Version**: 1.0.0 | **Last Updated**: 2024
