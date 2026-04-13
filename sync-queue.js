/**
 * 📋 Sync Queue Manager
 *
 * Manages pending operations for synchronization
 * Week 19-20 Implementation
 */

class SyncQueue {
  constructor(indexedDB) {
    this.db = indexedDB;
    this.storeName = "sync_queue";
    this.listeners = [];
  }

  /**
   * Add operation to queue
   */
  async enqueue(operation) {
    const queueEntry = {
      id: generateUUID(),
      entity_type: operation.entity_type, // 'scores', 'attendance', etc.
      operation: operation.operation, // 'insert', 'update', 'delete'
      entity_id: operation.entity_id,
      old_value: operation.old_value || null,
      new_value: operation.new_value || null,
      status: "pending", // pending|syncing|synced|failed
      attempts: 0,
      max_attempts: 8,
      last_error: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      next_retry: null,
    };

    await this.db.insert(this.storeName, queueEntry);
    this.emit("queue:added", queueEntry);
    return queueEntry;
  }

  /**
   * Get all pending operations
   */
  async getPending() {
    const all = await this.db.getAll(this.storeName);
    return all.filter((entry) => entry.status === "pending");
  }

  /**
   * Get failed operations
   */
  async getFailed() {
    const all = await this.db.getAll(this.storeName);
    return all.filter((entry) => entry.status === "failed");
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const all = await this.db.getAll(this.storeName);
    return {
      total: all.length,
      pending: all.filter((e) => e.status === "pending").length,
      syncing: all.filter((e) => e.status === "syncing").length,
      synced: all.filter((e) => e.status === "synced").length,
      failed: all.filter((e) => e.status === "failed").length,
      byType: groupBy(all, "entity_type"),
    };
  }

  /**
   * Mark operation as syncing
   */
  async markSyncing(queueId) {
    const entry = await this.db.get(this.storeName, queueId);
    entry.status = "syncing";
    entry.updated_at = Date.now();
    await this.db.update(this.storeName, queueId, entry);
    this.emit("queue:syncing", entry);
    return entry;
  }

  /**
   * Mark operation as synced
   */
  async markSynced(queueId) {
    const entry = await this.db.get(this.storeName, queueId);
    entry.status = "synced";
    entry.updated_at = Date.now();
    entry.attempts = 0;
    await this.db.update(this.storeName, queueId, entry);
    this.emit("queue:synced", entry);
    return entry;
  }

  /**
   * Mark operation as failed and schedule retry
   */
  async markFailed(queueId, error) {
    const entry = await this.db.get(this.storeName, queueId);
    entry.attempts++;
    entry.last_error = error.message;
    entry.updated_at = Date.now();

    if (entry.attempts >= entry.max_attempts) {
      entry.status = "failed";
      this.emit("queue:failed", entry);
    } else {
      // Schedule retry with exponential backoff
      const delayMs = Math.min(
        1000 * Math.pow(2, entry.attempts - 1),
        60 * 60 * 1000, // Max 1 hour
      );
      entry.next_retry = Date.now() + delayMs;
      entry.status = "pending";
      this.emit("queue:retry_scheduled", entry);
    }

    await this.db.update(this.storeName, queueId, entry);
    return entry;
  }

  /**
   * Retry a failed operation immediately
   */
  async retryNow(queueId) {
    const entry = await this.db.get(this.storeName, queueId);
    entry.status = "pending";
    entry.next_retry = null;
    entry.updated_at = Date.now();
    await this.db.update(this.storeName, queueId, entry);
    this.emit("queue:retry_requested", entry);
    return entry;
  }

  /**
   * Remove operation from queue
   */
  async remove(queueId) {
    await this.db.delete(this.storeName, queueId);
    this.emit("queue:removed", { id: queueId });
  }

  /**
   * Batch mark all synced
   */
  async markAllSynced(queueIds) {
    const tasks = queueIds.map((id) => this.markSynced(id));
    await Promise.all(tasks);
  }

  /**
   * Clear all synced entries
   */
  async clearSynced() {
    const all = await this.db.getAll(this.storeName);
    const synced = all.filter((e) => e.status === "synced");
    const count = synced.length;

    for (const entry of synced) {
      await this.remove(entry.id);
    }

    this.emit("queue:cleared", { count });
    return count;
  }

  /**
   * Get next batch to sync
   */
  async getNextBatch(batchSize = 50) {
    const pending = await this.getPending();
    const batch = pending
      .sort((a, b) => a.created_at - b.created_at)
      .slice(0, batchSize);
    return batch;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
    return () => {
      this.listeners = this.listeners.filter(
        (l) => !(l.event === event && l.callback === callback),
      );
    };
  }

  /**
   * Emit event
   */
  emit(event, data) {
    this.listeners
      .filter((l) => l.event === event)
      .forEach((l) => l.callback(data));
  }

  /**
   * Get operation timeline (for debugging)
   */
  async getTimeline() {
    const all = await this.db.getAll(this.storeName);
    return all
      .sort((a, b) => b.created_at - a.created_at)
      .map((entry) => ({
        id: entry.id.substring(0, 8),
        entity: entry.entity_type,
        operation: entry.operation,
        status: entry.status,
        attempts: entry.attempts,
        age: ((Date.now() - entry.created_at) / 1000).toFixed(0) + "s",
        error: entry.last_error || "-",
      }));
  }
}

/**
 * Utility: Generate UUID v4
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Utility: Group by property
 */
function groupBy(arr, prop) {
  return arr.reduce((groups, item) => {
    const key = item[prop];
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {});
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = SyncQueue;
}
