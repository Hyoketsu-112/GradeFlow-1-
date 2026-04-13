/**
 * 🧪 LOCAL TESTING SUITE FOR GRADEFLOW SYNC ENGINE
 * 
 * Run in browser console during development
 * Tests all Week 19-20 components against local IndexedDB + mock Supabase
 */

// ============================================================================
// TEST SETUP & INITIALIZATION
// ============================================================================

class LocalTestSuite {
  constructor() {
    this.results = [];
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.db = null;
    this.syncManager = null;
    this.syncQueue = null;
    this.conflictResolver = null;
  }

  /**
   * Initialize test environment
   */
  async init() {
    console.clear();
    console.log("🧪 GradeFlow Sync Engine - LOCAL TESTING SUITE");
    console.log("=" .repeat(60));
    console.log("Testing Week 19-20 Offline-First Implementation\n");

    try {
      // Initialize components (assume they're already loaded in window)
      this.db = new SyncIndexedDB("gradeflow-test", 1);
      this.syncQueue = new SyncQueue(this.db);
      this.conflictResolver = ConflictResolver;

      await this.db.init();
      console.log("✅ Test environment initialized\n");

      return true;
    } catch (error) {
      console.error("❌ Failed to init test environment:", error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAll() {
    const tests = [
      {
        name: "IndexedDB Stores Created",
        fn: () => this.testIndexedDBStores(),
      },
      {
        name: "Can Insert Data",
        fn: () => this.testInsertData(),
      },
      {
        name: "Can Query Data",
        fn: () => this.testQueryData(),
      },
      {
        name: "Can Update Data",
        fn: () => this.testUpdateData(),
      },
      {
        name: "Can Delete Data",
        fn: () => this.testDeleteData(),
      },
      {
        name: "Queue Operations Work",
        fn: () => this.testQueueOperations(),
      },
      {
        name: "Conflict Detection Works",
        fn: () => this.testConflictDetection(),
      },
      {
        name: "LWW Resolution Works",
        fn: () => this.testLWWResolution(),
      },
      {
        name: "Component Merge Works",
        fn: () => this.testComponentMerge(),
      },
      {
        name: "Backoff Calculation Works",
        fn: () => this.testBackoffCalculation(),
      },
    ];

    for (const test of tests) {
      await this.runTest(test);
    }

    this.printSummary();
  }

  /**
   * Run individual test
   */
  async runTest(test) {
    this.testCount++;
    process.stdout.write(`[${this.testCount}] ${test.name}... `);

    try {
      await test.fn();
      console.log("✅ PASS");
      this.passCount++;
      this.results.push({ test: test.name, status: "PASS" });
    } catch (error) {
      console.log(`❌ FAIL`);
      console.log(`     → ${error.message}\n`);
      this.failCount++;
      this.results.push({ test: test.name, status: "FAIL", error: error.message });
    }
  }

  // ========================================================================
  // INDEXEDDB TESTS
  // ========================================================================

  testIndexedDBStores() {
    if (!this.db.db) {
      throw new Error("IndexedDB database not initialized");
    }

    const expected = [
      "schools",
      "users",
      "classes",
      "students",
      "scores",
      "attendance",
      "materials",
      "quizzes",
      "quiz_results",
      "audit_logs",
      "sync_queue",
      "sync_log",
      "auth_state",
    ];

    const stores = Array.from(this.db.db.objectStoreNames);

    if (stores.length === 0) {
      throw new Error("No object stores created");
    }

    for (const store of expected) {
      if (!stores.includes(store)) {
        throw new Error(`Missing store: ${store}`);
      }
    }
  }

  async testInsertData() {
    const testData = {
      id: `test-school-${Date.now()}`,
      name: "Test School",
      code: "TS001",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.insert("schools", testData);

    const retrieved = await this.db.get("schools", testData.id);
    if (!retrieved) {
      throw new Error("Data not found after insert");
    }
    if (retrieved.name !== testData.name) {
      throw new Error("Retrieved data doesn't match inserted data");
    }
  }

  async testQueryData() {
    // Insert multiple records
    const data1 = {
      id: "user-1",
      name: "Alice",
      school_id: "school-1",
      created_at: new Date().toISOString(),
    };

    const data2 = {
      id: "user-2",
      name: "Bob",
      school_id: "school-1",
      created_at: new Date().toISOString(),
    };

    await this.db.insert("users", data1);
    await this.db.insert("users", data2);

    const all = await this.db.getAll("users");
    if (all.length < 2) {
      throw new Error(`Expected at least 2 users, got ${all.length}`);
    }
  }

  async testUpdateData() {
    const original = {
      id: "class-1",
      name: "Class 1A",
      grade_level: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.insert("classes", original);

    const updated = {
      ...original,
      name: "Class 1B Updated",
      updated_at: new Date().toISOString(),
    };

    await this.db.insert("classes", updated); // IndexedDB upserts on same key

    const retrieved = await this.db.get("classes", "class-1");
    if (retrieved.name !== "Class 1B Updated") {
      throw new Error("Update failed - name not changed");
    }
  }

  async testDeleteData() {
    const testData = {
      id: "to-delete-1",
      name: "Will be deleted",
      created_at: new Date().toISOString(),
    };

    await this.db.insert("materials", testData);

    await this.db.delete("materials", "to-delete-1");

    const retrieved = await this.db.get("materials", "to-delete-1");
    if (retrieved) {
      throw new Error("Delete failed - data still exists");
    }
  }

  // ========================================================================
  // QUEUE TESTS
  // ========================================================================

  async testQueueOperations() {
    const operation = {
      entity_type: "scores",
      operation: "insert",
      entity_id: "score-1",
      new_value: { test: 90, practical: 85, exam: 88 },
    };

    const queued = await this.syncQueue.enqueue(operation);

    if (!queued.id) {
      throw new Error("Queue entry has no ID");
    }

    if (queued.status !== "pending") {
      throw new Error(`Expected status 'pending', got ${queued.status}`);
    }

    const pending = await this.syncQueue.getPending();
    if (pending.length === 0) {
      throw new Error("Queued operation not found in pending list");
    }
  }

  // ========================================================================
  // CONFLICT RESOLUTION TESTS
  // ========================================================================

  testConflictDetection() {
    const local = {
      id: "rec-1",
      name: "Local",
      updated_at: "2026-04-13T10:00:00Z",
    };

    const remote = {
      id: "rec-1",
      name: "Remote",
      updated_at: "2026-04-13T10:00:00Z",
    };

    const result = this.conflictResolver.detectConflict(local, remote);

    if (result.conflict) {
      throw new Error("Should not detect conflict with identical timestamps");
    }

    // Test actual conflict
    const conflictRemote = {
      ...remote,
      updated_at: "2026-04-13T10:05:00Z",
    };

    const conflictResult = this.conflictResolver.detectConflict(local, conflictRemote);
    if (!conflictResult.conflict) {
      throw new Error("Should detect conflict with different timestamps");
    }
  }

  testLWWResolution() {
    const local = {
      id: "user-1",
      name: "Alice",
      updated_at: "2026-04-13T10:00:00Z",
    };

    const remote = {
      id: "user-1",
      name: "Alice Updated",
      updated_at: "2026-04-13T10:05:00Z",
    };

    const result = this.conflictResolver.resolveByTimestamp(local, remote);

    if (result.winner !== "remote") {
      throw new Error(`Expected remote to win, got ${result.winner}`);
    }

    if (result.value.name !== "Alice Updated") {
      throw new Error("Remote value not selected in resolution");
    }
  }

  testComponentMerge() {
    const local = {
      id: "score-1",
      test: 75,
      practical: 90,
      exam: 60,
      updated_at: "2026-04-13T10:00:00Z",
    };

    const remote = {
      id: "score-1",
      test: 80,
      practical: 85,
      exam: 95,
      updated_at: "2026-04-13T10:00:00Z", // Same time
    };

    const result = this.conflictResolver.mergeScores(local, remote);

    if (!result.merged) {
      throw new Error("Merge failed");
    }

    const merged = result.value;

    if (merged.test !== 80) {
      throw new Error(`Expected test=80, got ${merged.test}`);
    }
    if (merged.practical !== 90) {
      throw new Error(`Expected practical=90, got ${merged.practical}`);
    }
    if (merged.exam !== 95) {
      throw new Error(`Expected exam=95, got ${merged.exam}`);
    }
  }

  testBackoffCalculation() {
    // Note: You'll need to create a test SyncManager or test this separately
    // For now, we'll test the math directly

    const calculateBackoff = (attemptNumber) => {
      const baseDelay = 1000;
      const maxDelay = 3600000;
      const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
      return delay;
    };

    const delays = [];
    for (let i = 0; i < 9; i++) {
      delays.push(calculateBackoff(i));
    }

    const expected = [
      1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 3600000,
    ];

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] !== expected[i]) {
        throw new Error(
          `Backoff[${i}]: expected ${expected[i]}ms, got ${delays[i]}ms`
        );
      }
    }
  }

  // ========================================================================
  // SUMMARY & REPORTING
  // ========================================================================

  printSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST RESULTS");
    console.log("=".repeat(60) + "\n");

    this.results.forEach((result, index) => {
      const icon = result.status === "PASS" ? "✅" : "❌";
      console.log(`  ${icon} [${index + 1}] ${result.test}`);
      if (result.error) {
        console.log(`       └─ ${result.error}`);
      }
    });

    console.log("\n" + "-".repeat(60));
    console.log(`Total Tests:  ${this.testCount}`);
    console.log(`Passed:       ${this.passCount} ✅`);
    console.log(`Failed:       ${this.failCount} ❌`);
    console.log("=" .repeat(60) + "\n");

    if (this.failCount === 0) {
      console.log("🎉 ALL TESTS PASSED!\n");
      console.log("✅ IndexedDB working");
      console.log("✅ Sync queue working");
      console.log("✅ Conflict resolution working");
      console.log("✅ Ready for integration testing!\n");
    } else {
      console.log(`⚠️  ${this.failCount} TEST(S) FAILED\n`);
      console.log("Review errors above and check:");
      console.log("- Supabase connection");
      console.log("- IndexedDB browser support");
      console.log("- Module loading\n");
    }

    return this.failCount === 0;
  }
}

// ============================================================================
// RUN TESTS
// ============================================================================

// Create and run test suite
const testSuite = new LocalTestSuite();

// Run in browser console:
// (async () => {
//   await testSuite.init();
//   await testSuite.runAll();
// })();

// Or programmatically
async function runLocalTests() {
  const suite = new LocalTestSuite();
  const initialized = await suite.init();

  if (!initialized) {
    console.error("❌ Failed to initialize test suite");
    return false;
  }

  await suite.runAll();
  return suite.failCount === 0;
}

// Export for use
if (typeof window !== "undefined") {
  window.LocalTestSuite = LocalTestSuite;
  window.runLocalTests = runLocalTests;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LocalTestSuite, runLocalTests };
}
