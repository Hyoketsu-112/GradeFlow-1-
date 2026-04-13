/**
 * 🔄 Sync Manager - Core Orchestrator
 *
 * Orchestrates bidirectional sync: Local Storage ↔ Sync Queue ↔ Supabase
 * Week 19-20 Implementation
 */

class SyncManager {
  constructor(supabase, indexedDB, syncQueue, conflictResolver) {
    this.supabase = supabase;
    this.db = indexedDB;
    this.queue = syncQueue;
    this.resolver = conflictResolver;

    // State management
    this.isSyncing = false;
    this.isOnline = navigator?.onLine ?? true;
    this.lastSyncTime = this.getLastSyncTime();
    this.syncInterval = null;
    this.listeners = [];

    // Event listeners
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleOnline());
      window.addEventListener("offline", () => this.handleOffline());
    }
  }

  /**
   * Initialize sync manager
   */
  async init() {
    console.log("🔄 Initializing sync manager...");

    try {
      // Initialize IndexedDB
      await this.db.init();
      console.log("✓ IndexedDB initialized");

      // Start periodic sync
      this.startPeriodicSync();
      console.log("✓ Periodic sync started (every 30s)");

      return this;
    } catch (error) {
      console.error("❌ Failed to initialize sync manager:", error);
      throw error;
    }
  }

  /**
   * Start periodic sync every 30 seconds when online
   */
  startPeriodicSync(interval = 30000) {
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.performSync().catch((err) =>
          console.error("❌ Periodic sync failed:", err),
        );
      }
    }, interval);

    console.log(`📅 Periodic sync started (${interval}ms interval)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("🛑 Periodic sync stopped");
    }
  }

  /**
   * Main sync orchestration
   */
  async performSync() {
    if (this.isSyncing) {
      console.log("⏳ Sync already in progress");
      return false;
    }

    if (!this.isOnline) {
      console.log("📴 Offline - skipping sync");
      return false;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.emit("sync:start");
      console.log("🔄 Starting sync cycle...");

      // Phase 1: Upload local changes
      console.log("⬆️ Phase 1: Uploading local changes...");
      await this.uploadLocalChanges();

      // Phase 2: Download remote changes
      console.log("⬇️ Phase 2: Downloading remote changes...");
      await this.downloadRemoteChanges();

      // Phase 3: Retry failed operations
      console.log("🔁 Phase 3: Retrying failed operations...");
      await this.retryFailedOperations();

      // Update last sync time
      this.lastSyncTime = new Date();
      localStorage.setItem("lastSyncTime", this.lastSyncTime.toISOString());

      const duration = Date.now() - startTime;
      console.log(`✅ Sync complete in ${duration}ms`);
      this.emit("sync:complete", { duration });

      return true;
    } catch (error) {
      console.error("❌ Sync failed:", error);
      this.emit("sync:error", error);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Phase 1: Upload local changes
   */
  async uploadLocalChanges() {
    const pending = await this.queue.getPending();
    console.log(`  📤 Found ${pending.length} pending operations`);

    let successCount = 0;
    let failureCount = 0;

    for (const entry of pending) {
      try {
        await this.queue.markSyncing(entry.id);

        // Execute the sync operation
        await this.executeSync(entry);

        await this.queue.markSynced(entry.id);
        successCount++;

        console.log(
          `  ✅ Synced: ${entry.entity_type} ${entry.operation} #${entry.entity_id}`,
        );
      } catch (error) {
        await this.queue.markFailed(entry.id, error.message);
        failureCount++;

        console.error(
          `  ❌ Failed: ${entry.entity_type} #${entry.entity_id} - ${error.message}`,
        );
      }

      this.emit("sync:progress", {
        synced: successCount,
        failed: failureCount,
      });
    }

    console.log(
      `  📊 Upload complete: ${successCount} succeeded, ${failureCount} failed`,
    );
  }

  /**
   * Execute a single sync operation
   */
  async executeSync(entry) {
    const { entity_type, operation, entity_id, new_value, old_value } = entry;

    switch (operation) {
      case "insert":
        return await this.supabase.from(entity_type).insert([new_value]);

      case "update":
        return await this.supabase
          .from(entity_type)
          .update(new_value)
          .eq("id", entity_id);

      case "delete":
        return await this.supabase
          .from(entity_type)
          .delete()
          .eq("id", entity_id);

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Phase 2: Download remote changes
   */
  async downloadRemoteChanges() {
    // Tables to sync (in dependency order)
    const tables = [
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
    ];

    let totalChanges = 0;
    let totalConflicts = 0;

    for (const table of tables) {
      try {
        // Query for changes since last sync
        const { data, error } = await this.supabase
          .from(table)
          .select("*")
          .gt("updated_at", this.lastSyncTime.toISOString())
          .limit(1000);

        if (error) throw error;

        if (data && data.length > 0) {
          console.log(`  📥 ${table}: ${data.length} changes`);
          const conflicts = await this.mergeRemoteData(table, data);
          totalChanges += data.length;
          totalConflicts += conflicts;
        }
      } catch (error) {
        console.error(`  ⚠️ Error downloading ${table}:`, error.message);
        // Continue with next table on error
      }
    }

    console.log(
      `  📊 Download complete: ${totalChanges} records, ${totalConflicts} conflicts resolved`,
    );
  }

  /**
   * Merge remote data with local cache
   */
  async mergeRemoteData(table, remoteData) {
    let conflictCount = 0;

    for (const remote of remoteData) {
      try {
        // Get local version
        const local = await this.db.get(table, remote.id);

        if (local) {
          // Check for conflict
          const conflict = this.resolver.detectConflict(local, remote);

          if (conflict.conflict) {
            conflictCount++;
            console.log(
              `    ⚖️ Conflict in ${table}:${remote.id} - ${conflict.newer} wins`,
            );

            // Resolve conflict
            const resolved = this.resolver.resolve(table, local, remote);
            await this.db.insert(table, resolved.value);
          } else {
            // No conflict - just use remote
            await this.db.insert(table, remote);
          }
        } else {
          // No local version - just insert remote
          await this.db.insert(table, remote);
        }
      } catch (error) {
        console.error(
          `  ⚠️ Error merging ${table}:${remote.id} - ${error.message}`,
        );
      }
    }

    return conflictCount;
  }

  /**
   * Phase 3: Retry failed operations
   */
  async retryFailedOperations() {
    const failed = await this.queue.getFailed();
    console.log(`  🔁 Found ${failed.length} failed operations`);

    let retriedCount = 0;
    let permanentFailures = 0;

    for (const entry of failed) {
      try {
        // Check if ready to retry (exponential backoff)
        if (!this.isReadyForRetry(entry)) {
          continue;
        }

        console.log(
          `  🔄 Retrying ${entry.entity_type} #${entry.entity_id} (attempt ${entry.attempts + 1})`,
        );

        await this.queue.markSyncing(entry.id);
        await this.executeSync(entry);
        await this.queue.markSynced(entry.id);

        retriedCount++;
      } catch (error) {
        // Increment retry count
        await this.queue.incrementAttempts(entry.id);
        const newAttempts = entry.attempts + 1;

        if (newAttempts >= entry.max_attempts) {
          // Permanent failure
          await this.queue.markPermanentFailure(entry.id);
          permanentFailures++;
          console.error(
            `  💀 Permanent failure for ${entry.entity_type} #${entry.entity_id} after ${newAttempts} attempts`,
          );
        } else {
          // Mark as failed for next retry
          await this.queue.markFailed(entry.id, error.message);
          console.error(
            `  ⚠️ Retry failed for ${entry.entity_type} #${entry.entity_id}: ${error.message}`,
          );
        }
      }
    }

    console.log(
      `  📊 Retry complete: ${retriedCount} succeeded, ${permanentFailures} permanent failures`,
    );
  }

  /**
   * Check if operation is ready for retry (exponential backoff)
   */
  isReadyForRetry(entry) {
    if (!entry.next_retry) return true;

    const now = Date.now();
    const nextRetryTime = new Date(entry.next_retry).getTime();

    return now >= nextRetryTime;
  }

  /**
   * Calculate exponential backoff delay
   * 1s, 2s, 4s, 8s, 16s, 32s, 1m, 2m, ... 1h max
   */
  calculateBackoff(attemptNumber) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 3600000; // 1 hour
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
    return delay;
  }

  /**
   * Queue a local operation (insert, update, delete)
   */
  async queueOperation(entityType, operation, entityId, newValue, oldValue) {
    console.log(`📋 Queuing: ${entityType} ${operation} #${entityId}`);

    const queueEntry = await this.queue.enqueue({
      entity_type: entityType,
      operation,
      entity_id: entityId,
      new_value: newValue,
      old_value: oldValue,
    });

    // Update local cache immediately
    if (operation === "delete") {
      await this.db.delete(entityType, entityId);
    } else {
      await this.db.insert(entityType, newValue);
    }

    // Try to sync immediately if online
    if (this.isOnline && !this.isSyncing) {
      this.performSync().catch((err) =>
        console.error("❌ Immediate sync failed:", err),
      );
    }

    return queueEntry;
  }

  /**
   * Handle coming online
   */
  handleOnline() {
    console.log("🟢 ONLINE - Starting sync...");
    this.isOnline = true;
    this.emit("status:online");

    // Perform sync when coming online
    this.performSync().catch((err) =>
      console.error("❌ Sync on reconnect failed:", err),
    );
  }

  /**
   * Handle going offline
   */
  handleOffline() {
    console.log("🔴 OFFLINE - Switching to local-only mode");
    this.isOnline = false;
    this.emit("status:offline");
  }

  /**
   * Force full sync (sync all data from cloud)
   */
  async forceFullSync() {
    console.log("🔄 Forcing full sync from cloud...");
    this.lastSyncTime = new Date(0); // Sync all data
    return await this.performSync();
  }

  /**
   * Get current sync status
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      pendingCount: 0, // Can be calculated from queue
      failedCount: 0, // Can be calculated from queue
    };
  }

  /**
   * Get last sync time from localStorage
   */
  getLastSyncTime() {
    const saved = localStorage.getItem("lastSyncTime");
    return saved ? new Date(saved) : new Date(0);
  }

  /**
   * Clear all offline data
   */
  async clearOfflineData() {
    console.log("🗑️ Clearing offline data...");
    for (const store of this.db.stores) {
      await this.db.clearStore(store);
    }
    console.log("✓ Offline data cleared");
  }

  /**
   * Event listener management
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback,
      );
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopPeriodicSync();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", () => this.handleOnline());
      window.removeEventListener("offline", () => this.handleOffline());
    }
    console.log("🛑 Sync manager destroyed");
  }
}

/**
 * UUID generator (fallback for environments without crypto)
 */
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SyncManager, generateUUID };
}
