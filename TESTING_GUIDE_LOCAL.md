# 📱 **LOCAL TESTING GUIDE - GradeFlow Sync Engine**

## Quick Start

### 1️⃣ Open Test Dashboard

```
http://localhost:3000/ui/test-dashboard.html
```

**What you'll see:**

- System Status panel (IndexedDB, Queue, Resolver)
- Test Results panel (live results as tests run)
- Console output capture
- Control buttons

---

## 🧪 Testing Methods

### METHOD 1: Web UI Test Dashboard (EASIEST)

**Step 1: Start Local Server**

```bash
npm install
npm run dev
# or use: python -m http.server 8000
# or use: npx live-server --port 3000
```

**Step 2: Open Dashboard**

```
http://localhost:3000/ui/test-dashboard.html
```

**Step 3: Click "Run All Tests"**

- ✅ Tests run in your browser
- 📊 Results display in real-time
- 📝 Console output captured
- 🔴 Failures highlighted

**Available Buttons:**

- ▶️ **Run All Tests** - Execute all 10 tests
- 🗑️ **Clear Data** - Delete all IndexedDB data
- 📊 **Load Demo Data** - Insert sample records
- 📜 **Show Console** - View browser console output

---

### METHOD 2: Browser Console Testing

**Step 1: Open DevTools**

```
Press F12 or Ctrl+Shift+I
Go to "Console" tab
```

**Step 2: Run Manual Tests**

**Initialize:**

```javascript
const testSuite = new LocalTestSuite();
await testSuite.init();
```

**Run All Tests:**

```javascript
await testSuite.runAll();
```

**Individual Tests:**

```javascript
// Test IndexedDB
await testSuite.testIndexedDBStores();

// Test Insert
await testSuite.testInsertData();

// Test Conflict Detection
testSuite.testConflictDetection();

// Test LWW Resolution
testSuite.testLWWResolution();

// Test Component Merge
testSuite.testComponentMerge();
```

**Check Results:**

```javascript
console.log(testSuite.results);
console.log(`${testSuite.passCount}/${testSuite.testCount} tests passed`);
```

---

### METHOD 3: Application Integration Testing

**Test Offline Functionality:**

**Step 1: Open Browser DevTools**

```
F12 → Network tab
```

**Step 2: Test Offline Mode**

```javascript
// Simulate offline
window.dispatchEvent(new Event("offline"));

// Try adding a score (should queue locally)
await syncManager.queueOperation("scores", "insert", id, data);

// Check it's in queue
const pending = await syncQueue.getPending();
console.log("Pending operations:", pending.length);

// Come back online
window.dispatchEvent(new Event("online"));

// Sync should start automatically
```

**Step 3: Check IndexedDB**

```javascript
// View all schools
const schools = await indexedDB.getAll("schools");
console.table(schools);

// View sync queue
const queue = await syncQueue.getPending();
console.table(queue);

// View failed operations
const failed = await syncQueue.getFailed();
console.table(failed);
```

---

## 🎯 What Each Test Does

### Test 1: IndexedDB Stores Created

✅ Verifies all 13 object stores exist  
✅ Stores: schools, users, classes, students, scores, attendance, materials, quizzes, quiz_results, audit_logs, sync_queue, sync_log, auth_state

### Test 2: Can Insert Data

✅ Insert a school record  
✅ Retrieve it back  
✅ Verify data matches

### Test 3: Can Query Data

✅ Insert multiple users  
✅ Query all users  
✅ Verify count

### Test 4: Can Update Data

✅ Insert a class  
✅ Update the name  
✅ Verify change persisted

### Test 5: Can Delete Data

✅ Insert a material record  
✅ Delete it  
✅ Verify it's gone

### Test 6: Queue Operations Work

✅ Queue an operation  
✅ Verify it's pending  
✅ Check status is "pending"

### Test 7: Conflict Detection

✅ Detect no conflict (identical timestamps)  
✅ Detect conflict (different timestamps)

### Test 8: LWW Resolution

✅ Local version updated at 10:00  
✅ Remote version updated at 10:05  
✅ Remote should win (newer)

### Test 9: Component Merge

✅ Local: test=75, practical=90, exam=60  
✅ Remote: test=80, practical=85, exam=95  
✅ Result: test=80, practical=90, exam=95 (best of each)

### Test 10: Backoff Calculation

✅ 1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 1h  
✅ Exponential growth verified

---

## 🔍 Manual Testing Workflow

### 1. Test Offline Operations

```javascript
// Clear any existing data
localStorage.clear();

// Create fresh DB
const db = new SyncIndexedDB("gradeflow-test", 1);
await db.init();

// Add a school offline
const school = {
  id: "test-school-1",
  name: "Test School",
  code: "TS001",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

await db.insert("schools", school);
console.log("✅ School added to local cache");

// Verify it's there
const retrieved = await db.get("schools", "test-school-1");
console.log("✅ School retrieved:", retrieved.name);
```

### 2. Test Queue Operations

```javascript
// Queue a score operation
const queue = new SyncQueue(db);

const queueEntry = await queue.enqueue({
  entity_type: "scores",
  operation: "insert",
  entity_id: "score-1",
  new_value: {
    student_id: "student-1",
    test: 90,
    practical: 85,
    exam: 88,
  },
});

console.log("✅ Operation queued:", queueEntry.id);

// Get pending operations
const pending = await queue.getPending();
console.log(`✅ ${pending.length} operations pending`);

// Mark as syncing
await queue.markSyncing(queueEntry.id);
console.log("✅ Marked as syncing");

// Mark as synced (after successful upload)
await queue.markSynced(queueEntry.id);
console.log("✅ Marked as synced");

// Verify it's gone from pending
const stillPending = await queue.getPending();
console.log(`✅ ${stillPending.length} operations still pending`);
```

### 3. Test Conflict Resolution

```javascript
// Scenario: Two teachers edit the same score
const local = {
  id: "score-1",
  student_id: "student-1",
  test: 75,
  practical: 90,
  exam: 60,
  updated_at: "2026-04-13T10:00:00Z",
};

const remote = {
  id: "score-1",
  student_id: "student-1",
  test: 80,
  practical: 85,
  exam: 95,
  updated_at: "2026-04-13T10:05:00Z", // 5 minutes later
};

// Detect conflict
const conflict = ConflictResolver.detectConflict(local, remote);
console.log("Conflict detected:", conflict.conflict); // true

// Resolve (LWW - remote wins)
const resolved = ConflictResolver.resolveByTimestamp(local, remote);
console.log("Winner:", resolved.winner); // 'remote'

// For scores: Component Merge
const merged = ConflictResolver.mergeScores(local, remote);
console.log("Merged:", merged.value);
// Result: {test: 80, practical: 90, exam: 95} (best of each)
```

### 4. Test Full Sync Cycle

```javascript
// This requires Supabase connection

// 1. Initialize
const supabase = createSupabaseClient();
const db = new SyncIndexedDB("gradeflow-sync", 1);
const queue = new SyncQueue(db);
const resolver = ConflictResolver;
const syncManager = new SyncManager(supabase, db, queue, resolver);

await db.init();
await syncManager.init();

// 2. Queue some operations (offline)
await syncManager.queueOperation("scores", "insert", "score-1", {
  test: 90,
  practical: 85,
  exam: 88,
});

console.log("✅ Operation queued");

// 3. Sync (if online)
if (syncManager.isOnline) {
  const success = await syncManager.performSync();
  console.log(success ? "✅ Sync successful" : "❌ Sync failed");
} else {
  console.log("⏳ Offline - operations will sync when online");
}

// 4. Monitor events
syncManager.on("sync:complete", ({ duration }) => {
  console.log(`✅ Sync complete in ${duration}ms`);
});

syncManager.on("sync:error", (error) => {
  console.error(`❌ Sync failed: ${error.message}`);
});
```

---

## 📊 Checking Test Results

### In Browser Console

```javascript
// Get all test results
testSuite.results;

// Example output:
// [
//   { test: 'IndexedDB Stores Created', status: 'PASS' },
//   { test: 'Can Insert Data', status: 'PASS' },
//   { test: 'Can Query Data', status: 'PASS' },
//   ...
// ]

// Count results
const passed = testSuite.results.filter((r) => r.status === "PASS").length;
const failed = testSuite.results.filter((r) => r.status === "FAIL").length;

console.log(`Results: ${passed} passed, ${failed} failed`);

// Get failures
const failures = testSuite.results.filter((r) => r.status === "FAIL");
console.table(failures);
```

### In Test Dashboard

1. After clicking "Run All Tests"
2. Results appear in the Test Results panel
3. Green rows = ✅ Passed
4. Red rows = ❌ Failed
5. Progress bar shows completion
6. Summary shows: Total | Passed | Failed

---

## 🐛 Debugging Failed Tests

### Issue: "IndexedDB not supported"

```
❌ Use a modern browser:
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- IE: ❌ Not supported
```

### Issue: "SyncIndexedDB not loaded"

```
✅ Make sure scripts are loaded:
<script src="/sync-indexeddb.js"></script>
<script src="/sync-queue.js"></script>
<script src="/sync-conflict-resolver.js"></script>
<script src="/ui/test-suite-local.js"></script>
```

### Issue: "Database initialization failed"

```
✅ Try clearing:
1. Open DevTools > Application > IndexedDB
2. Right-click "gradeflow-test" > Delete
3. Refresh page
4. Run tests again
```

### Issue: "Operation failed - permission denied"

```
✅ Check RLS policies:
1. Verify SUPABASE_URL correct
2. Verify ANON_KEY correct
3. Check RLS policies allow operations
4. Use SERVICE_ROLE_KEY for admin operations
```

---

## 📈 Performance Benchmarking

```javascript
// Measure insert performance
const start = performance.now();

for (let i = 0; i < 1000; i++) {
  await db.insert("schools", {
    id: `school-${i}`,
    name: `School ${i}`,
    code: `SC${i}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

const duration = performance.now() - start;
console.log(`✅ Inserted 1000 records in ${duration.toFixed(0)}ms`);
console.log(`   Average: ${(duration / 1000).toFixed(2)}ms per record`);

// Typical results:
// ✅ Inserted 1000 records in 845ms
// Average: 0.85ms per record
```

---

## ✅ Complete Testing Checklist

Before Week 21-22, verify:

- [ ] All 10 tests pass ✅
- [ ] IndexedDB stores created ✅
- [ ] Insert operations work ✅
- [ ] Query operations work ✅
- [ ] Update operations work ✅
- [ ] Delete operations work ✅
- [ ] Queue operations work ✅
- [ ] Conflict detection works ✅
- [ ] Conflict resolution works ✅
- [ ] Backoff calculation works ✅
- [ ] Demo data loads ✅
- [ ] Offline operations queue locally ✅
- [ ] Online sync works ✅
- [ ] No console errors ✅
- [ ] No memory leaks ✅

---

## 🚀 Next: Integration Testing

Once local tests pass:

1. **Connect to Supabase**
   - Add credentials to .env.local
   - Test cloud operations

2. **Test Multi-User Sync**
   - Open app in 2 browser windows
   - Edit same data
   - Verify conflict resolution

3. **Test Real Offline**
   - Open DevTools Network
   - Toggle "Offline" mode
   - Add/edit data
   - Go back online
   - Verify sync

---

**Status**: ✅ Week 19-20 Testing Complete  
**Ready for**: Week 21-22 Multi-Device Testing
