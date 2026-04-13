/**
 * 📊 Week 19-20 Sync Engine - Usage Guide
 * 
 * Complete working example of how to use the offline-first sync system
 */

// ============================================================================
// 1. INITIALIZATION
// ============================================================================

// Setup Supabase client
const supabase = createSupabaseClient({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_ANON_KEY,
});

// Initialize sync components
const indexedDB = new SyncIndexedDB("gradeflow-v1", 1);
const syncQueue = new SyncQueue(indexedDB);
const conflictResolver = new ConflictResolver();
const syncManager = new SyncManager(supabase, indexedDB, syncQueue, conflictResolver);

// Initialize all components
await indexedDB.init();
const manager = await syncManager.init();

console.log("✅ Sync engine ready!");

// ============================================================================
// 2. MONITORING SYNC STATUS
// ============================================================================

// Listen to sync events
syncManager.on("sync:start", () => {
  console.log("🔄 Sync started...");
  updateUI({ status: "syncing", icon: "⏳" });
});

syncManager.on("sync:complete", ({ duration }) => {
  console.log(`✅ Sync complete in ${duration}ms`);
  updateUI({ status: "synced", icon: "✅", message: "All data synced" });
});

syncManager.on("sync:error", (error) => {
  console.error("❌ Sync error:", error);
  updateUI({ status: "error", icon: "⚠️", message: error.message });
});

syncManager.on("sync:progress", ({ synced, failed }) => {
  console.log(`📊 Progress: ${synced} synced, ${failed} failed`);
});

syncManager.on("status:online", () => {
  console.log("🟢 Connected - resuming sync");
  updateUI({ status: "online", icon: "🟢" });
});

syncManager.on("status:offline", () => {
  console.log("🔴 Disconnected - offline mode");
  updateUI({ status: "offline", icon: "🔴" });
});

// ============================================================================
// 3. QUEUING LOCAL OPERATIONS
// ============================================================================

// Add a score (will queue operation and cache locally)
async function addScore(studentId, scoreData) {
  console.log("📝 Adding score:", scoreData);

  const newScore = {
    id: generateUUID(),
    student_id: studentId,
    test: scoreData.test,
    practical: scoreData.practical,
    exam: scoreData.exam,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Queue operation
  const queueEntry = await syncManager.queueOperation(
    "scores", // table
    "insert", // operation
    newScore.id, // entity_id
    newScore, // new_value
    null // old_value
  );

  console.log(`✅ Queued operation: ${queueEntry.id}`);
  return queueEntry;
}

// Update a score
async function updateScore(scoreId, updates) {
  console.log("✏️ Updating score:", updates);

  const updatedScore = {
    ...updates,
    id: scoreId,
    updated_at: new Date().toISOString(),
  };

  const queueEntry = await syncManager.queueOperation(
    "scores",
    "update",
    scoreId,
    updatedScore,
    null // old_value (for conflict detection)
  );

  console.log(`✅ Queued update: ${queueEntry.id}`);
  return queueEntry;
}

// Delete a score
async function deleteScore(scoreId) {
  console.log("🗑️ Deleting score:", scoreId);

  const queueEntry = await syncManager.queueOperation(
    "scores",
    "delete",
    scoreId,
    null, // new_value
    null // old_value
  );

  console.log(`✅ Queued delete: ${queueEntry.id}`);
  return queueEntry;
}

// ============================================================================
// 4. MANUAL SYNC OPERATIONS
// ============================================================================

// Perform sync manually (normally happens automatically every 30s)
async function manualSync() {
  console.log("🔄 Starting manual sync...");
  const success = await syncManager.performSync();

  if (success) {
    console.log("✅ Manual sync succeeded");
  } else {
    console.log("❌ Manual sync failed");
  }

  return success;
}

// Force full sync (sync all data from cloud, ignoring last_sync_time)
async function forceFullSync() {
  console.log("🔄 Starting FULL sync from cloud...");
  const success = await syncManager.forceFullSync();

  if (success) {
    console.log("✅ Full sync succeeded");
  } else {
    console.log("❌ Full sync failed");
  }

  return success;
}

// ============================================================================
// 5. ACCESSING LOCAL DATA
// ============================================================================

// Get a score from local cache
async function getLocalScore(scoreId) {
  const score = await indexedDB.get("scores", scoreId);
  console.log("📖 Local score:", score);
  return score;
}

// Get all scores for a student (from local cache)
async function getLocalStudentScores(studentId) {
  // Using query approach (if available)
  const scores = await indexedDB.query("scores", "index", {
    index: "student_id",
    value: studentId,
  });

  console.log(`📊 ${scores.length} local scores for student ${studentId}`);
  return scores;
}

// Get all data in a store
async function getAllLocal(entityType) {
  const all = await indexedDB.getAll(entityType);
  console.log(`📚 ${all.length} items in ${entityType}`);
  return all;
}

// ============================================================================
// 6. CONFLICT HANDLING
// ============================================================================

// Example: How conflicts are automatically resolved
function explainConflictResolution() {
  const local = {
    id: "score-1",
    test: 75,
    practical: 90,
    exam: 60,
    updated_at: "2026-04-13T10:00:00Z",
  };

  const remote = {
    id: "score-1",
    test: 80, // Different!
    practical: 85, // Different!
    exam: 95, // Different!
    updated_at: "2026-04-13T10:00:00Z", // Same time
  };

  // For Scores with same timestamp: Component Merge
  // Result: Take highest value for each component
  const merged = {
    id: "score-1",
    test: 80, // max(75, 80)
    practical: 90, // max(90, 85)
    exam: 95, // max(60, 95)
    updated_at: "2026-04-13T10:00:00Z",
    _merge_info: {
      test_from: "remote",
      practical_from: "local",
      exam_from: "remote",
    },
  };

  console.log("⚖️ Conflict Resolution Example:");
  console.log("  Local:  ", local);
  console.log("  Remote: ", remote);
  console.log("  Merged: ", merged);
  console.log("  Result: Highest score in each component!");
}

// ============================================================================
// 7. ERROR RECOVERY
// ============================================================================

// Check queue status
async function checkQueueStatus() {
  const pending = await syncQueue.getPending();
  const failed = await syncQueue.getFailed();

  console.log("📋 Queue Status:");
  console.log(`  Pending: ${pending.length} operations`);
  console.log(`  Failed:  ${failed.length} operations`);

  if (failed.length > 0) {
    console.log("  ⚠️ Failed operations will retry with exponential backoff:");
    failed.slice(0, 3).forEach((op, i) => {
      console.log(`    ${i + 1}. ${op.entity_type} ${op.operation} (${op.attempts} attempts)`);
    });
  }
}

// Clear offline cache (dangerous - loses all local data!)
async function clearOfflineData() {
  if (confirm("⚠️ Clear ALL offline data? This cannot be undone!")) {
    await syncManager.clearOfflineData();
    console.log("🗑️ Offline data cleared");
  }
}

// ============================================================================
// 8. EVENT-DRIVEN ARCHITECTURE
// ============================================================================

class SyncUI {
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Real-time status updates
    this.syncManager.on("sync:start", () => this.showSyncing());
    this.syncManager.on("sync:complete", () => this.showSynced());
    this.syncManager.on("sync:error", (err) => this.showError(err));
    this.syncManager.on("status:online", () => this.showOnline());
    this.syncManager.on("status:offline", () => this.showOffline());
  }

  showSyncing() {
    const el = document.getElementById("sync-status");
    if (el) {
      el.className = "sync-status syncing";
      el.innerHTML = "🔄 Syncing...";
    }
  }

  showSynced() {
    const el = document.getElementById("sync-status");
    if (el) {
      el.className = "sync-status synced";
      el.innerHTML = "✅ All synced";
    }
  }

  showError(error) {
    const el = document.getElementById("sync-status");
    if (el) {
      el.className = "sync-status error";
      el.innerHTML = `⚠️ Error: ${error.message}`;
    }
  }

  showOnline() {
    const el = document.getElementById("connection-status");
    if (el) {
      el.className = "connection online";
      el.innerHTML = "🟢 Online";
    }
  }

  showOffline() {
    const el = document.getElementById("connection-status");
    if (el) {
      el.className = "connection offline";
      el.innerHTML = "🔴 Offline";
    }
  }
}

// Create UI controller
const syncUI = new SyncUI(syncManager);

// ============================================================================
// 9. TESTING
// ============================================================================

// Run comprehensive test suite
async function runTests() {
  const tests = new SyncEngineTests(syncManager, indexedDB, conflictResolver);
  const allPassed = await tests.runAll();

  if (allPassed) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("⚠️ Some tests failed - see above");
  }

  return allPassed;
}

// ============================================================================
// 10. COMPLETE EXAMPLE WORKFLOW
// ============================================================================

async function exampleWorkflow() {
  console.log("\n" + "=".repeat(60));
  console.log("📱 GRADEFLOW SYNC ENGINE - Example Workflow");
  console.log("=".repeat(60) + "\n");

  try {
    // 1. Initialize
    console.log("Step 1: Initialize sync engine");
    // Already done above
    console.log("✅ Sync engine ready\n");

    // 2. Add some data offline
    console.log("Step 2: Add score (offline)");
    const score = await addScore("student-123", {
      test: 85,
      practical: 90,
      exam: 88,
    });
    console.log("✅ Score queued locally\n");

    // 3. Check local data
    console.log("Step 3: Read from local cache");
    const localScore = await getLocalScore(score.entity_id);
    console.log(`✅ Retrieved: Test=${localScore.test}\n`);

    // 4. Update the score
    console.log("Step 4: Update score");
    await updateScore(score.entity_id, { test: 90 });
    console.log("✅ Update queued\n");

    // 5. Manual sync
    console.log("Step 5: Manual sync with cloud");
    await manualSync();
    console.log("✅ Sync attempt complete\n");

    // 6. Check queue status
    console.log("Step 6: Check queue status");
    await checkQueueStatus();
    console.log("✅ Queue status checked\n");

    console.log("=".repeat(60));
    console.log("🎉 WORKFLOW COMPLETE!");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Workflow error:", error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    syncManager,
    indexedDB,
    syncQueue,
    conflictResolver,
    addScore,
    updateScore,
    deleteScore,
    manualSync,
    forceFullSync,
    getLocalScore,
    getLocalStudentScores,
    getAllLocal,
    checkQueueStatus,
    clearOfflineData,
    SyncUI,
    exampleWorkflow,
    runTests,
  };
}
