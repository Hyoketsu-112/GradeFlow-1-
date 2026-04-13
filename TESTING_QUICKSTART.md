🚀 **QUICK START - Local Testing**
===================================

## 30-Second Setup

### 1. Start Server
```bash
npm run dev
# or: python -m http.server 8000
# or: npx live-server --port 3000
```

### 2. Open Test Dashboard
```
http://localhost:3000/ui/test-dashboard.html
```

### 3. Click "Run All Tests" 🎯
- ✅ 10 tests execute
- 📊 Results display in real-time
- 🔴 Failures highlighted in red
- ✅ Passes shown in green

---

## What You'll Test

### ✅ IndexedDB (Offline Cache)
- Store creation (13 stores)
- Insert operations
- Query operations
- Update operations
- Delete operations

### ✅ Sync Queue (Operation Tracking)
- Queue management
- Pending operation tracking
- Status transitions

### ✅ Conflict Resolution
- Conflict detection (timestamp compare)
- Last-Write-Wins (LWW) resolution
- Component merge (scores - take best of each)

### ✅ Exponential Backoff
- Retry delay calculation
- 1s → 2s → 4s → ... → 1h sequence

---

## Test Options in Dashboard

| Button | What It Does |
|--------|--------------|
| ▶️ Run All Tests | Execute 10 comprehensive tests |
| 🗑️ Clear Data | Delete all local IndexedDB data |
| 📊 Load Demo Data | Insert sample schools/users/classes |
| 📜 Show Console | View captured browser output |

---

## Expected Results

### ✅ All Tests Pass (Ideal)
```
✅ [1] IndexedDB Stores Created
✅ [2] Can Insert Data
✅ [3] Can Query Data
✅ [4] Can Update Data
✅ [5] Can Delete Data
✅ [6] Queue Operations Work
✅ [7] Conflict Detection Works
✅ [8] LWW Resolution Works
✅ [9] Component Merge Works
✅ [10] Backoff Calculation Works

📊 Summary
Total: 10 tests
Passed: 10 ✅
Failed: 0

🎉 ALL TESTS PASSED!
```

---

## Alternative: Browser Console Testing

### In DevTools Console (F12)

**Run all tests:**
```javascript
await runLocalTests()
```

**Manual step-by-step:**
```javascript
// Initialize
const suite = new LocalTestSuite();
await suite.init();

// Run specific test
await suite.testIndexedDBStores();
await suite.testInsertData();
await suite.testConflictDetection();

// Check results
console.log(suite.results);
```

---

## Troubleshooting

### ❌ "SyncIndexedDB not loaded"
**Solution**: Wait for scripts to load (check console)

### ❌ "Database locked"
**Solution**: 
1. Open DevTools → Application → IndexedDB
2. Right-click "gradeflow-test" → Delete
3. Refresh page

### ❌ "Tests taking too long"
**Solution**: This is normal for first run - IndexedDB setup takes time

### ❌ Seeing errors in console
**Solution**: 
1. Check that Supabase files are in correct paths
2. Verify sync files are loading
3. Clear browser cache

---

## What's Being Tested?

All Week 19-20 components:

✅ **sync-indexeddb.js** (IndexedDB cache)
- 13 object stores created
- CRUD operations working
- Data persistence verified

✅ **sync-queue.js** (Operation queue)
- Queue entry creation
- Status tracking
- Pending retrieval

✅ **sync-conflict-resolver.js** (Conflict resolution)
- Timestamp detection
- LWW logic
- Component merge strategy

✅ **Exponential Backoff** (Retry logic)
- Delay calculation
- Sequence verification (1s to 1h)

---

## Next: Integration Testing

Once local tests pass, test with Supabase:

```javascript
// Requires Supabase credentials
const syncManager = new SyncManager(supabase, db, queue, resolver);
await syncManager.performSync();
```

---

## Performance Expectations

- ⚡ All 10 tests complete in: **2-5 seconds**
- 📊 Demo data loads: **<100ms**
- 💾 IndexedDB inserts: **<1ms each**

---

## Files Involved

📂 **Core Sync Engine:**
- sync-indexeddb.js
- sync-queue.js
- sync-conflict-resolver.js
- sync-manager.js

🧪 **Testing:**
- ui/test-suite-local.js (test code)
- ui/test-dashboard.html (test UI)
- TESTING_GUIDE_LOCAL.md (full guide)

📖 **Documentation:**
- TESTING_GUIDE_LOCAL.md (this & more)
- WEEK_19_20_COMPLETE.md (overview)

---

## Status Indicators

**System Status Panel Shows:**
- ✅ IndexedDB: Supported / Not Supported
- ✅ Sync Components: Loaded / Loading / Failed
- ✅ System: Ready / Error

**Test Results Show:**
- 🟢 Green = Test passed
- 🔴 Red = Test failed
- Progress bar = Completion %

---

## Console Output

Tests capture all console output:

```
🧪 GradeFlow Sync Engine - LOCAL TESTING SUITE
============================================================
Testing Week 19-20 Offline-First Implementation

✅ Test environment initialized

[1] IndexedDB Stores Created... ✅ PASS
[2] Can Insert Data... ✅ PASS
[3] Can Query Data... ✅ PASS
...

🎉 ALL TESTS PASSED!
✅ IndexedDB working
✅ Sync queue working
✅ Conflict resolution working
✅ Ready for integration testing!
```

---

## Ready?

1. Start server: `npm run dev`
2. Open dashboard: `http://localhost:3000/ui/test-dashboard.html`
3. Click "Run All Tests" ▶️
4. Watch tests execute ⏳
5. See results 📊

**Expect: All 10 tests pass ✅**

---

**Questions? Check**: TESTING_GUIDE_LOCAL.md for detailed instructions
