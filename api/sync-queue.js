/**
 * 📋 Sync Queue - Track Pending Operations
 * 
 * Manages queue of pending sync operations:
 * - Add/remove operations
 * - Status tracking (pending/syncing/synced/failed)
 * - Retry management with exponential backoff
 * - Persistence to IndexedDB
 * 
 * Usage:
 *   const queue = new SyncQueue();
 *   await queue.restore(indexedDBStore);
 *   
 *   await queue.add({
 *     operation: 'INSERT',
 *     entity_type: 'scores',
 *     data: {...}
 *   });
 *   
 *   const pending = queue.getPending();
 */

class SyncQueue {
  constructor() {
    this.pending = [];    // Operations waiting to sync
    this.syncing = [];    // Currently syncing
    this.synced = [];     // Successfully synced
    this.failed = [];     // Failed (will retry)
    this.store = null;    // IndexedDB store reference
  }
  
  /**
   * RESTORE - Load persisted queue from IndexedDB
   */
  async restore(indexedDBStore) {
    this.store = indexedDBStore;
    
    try {
      // Get all sync items from IndexedDB
      const { data: allItems } = this.store.query('sync_queue');
      
      this.pending = allItems.filter(item => item.status === 'pending');
      this.synced = allItems.filter(item => item.status === 'synced');
      this.failed = allItems.filter(item => item.status === 'failed');
      
      console.log(`✓ Restored queue: ${this.pending.length} pending, ${this.failed.length} failed`);
    } catch (err) {
      console.warn('Failed to restore queue, starting fresh', err);
      this.pending = [];
      this.synced = [];
      this.failed = [];
    }
  }
  
  /**
   * ADD - Queue a new operation
   */
  async add(operation) {
    const queueItem = {
      id: this.generateId(),
      operation: operation.operation,          // INSERT|UPDATE|DELETE
      entity_type: operation.entity_type,      // Table name
      entity_id: operation.entity_id,          // Record ID
      data: operation.data || null,            // Full record
      old_data: operation.old_data || null,    // For conflict resolution
      status: 'pending',
      attempts: 0,
      max_attempts: 8,
      error: null,
      next_retry: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Add to in-memory queue
    this.pending.push(queueItem);
    
    // Persist to IndexedDB
    if (this.store) {
      await this.store.upsert('sync_queue', queueItem);
    }
    
    console.log(`✓ Queued: ${queueItem.operation} ${queueItem.entity_type}:${queueItem.entity_id}`);
    return queueItem.id;
  }
  
  /**
   * GET - Fetch queue item by ID
   */
  getItem(id) {
    return this.pending.find(item => item.id === id) ||
           this.synced.find(item => item.id === id) ||
           this.failed.find(item => item.id === id);
  }
  
  /**
   * UPDATE - Modify queue item
   */
  async update(id, updates) {
    const item = this.getItem(id);
    if (!item) {
      throw new Error(`Queue item not found: ${id}`);
    }
    
    // Update in-memory
    Object.assign(item, updates);
    item.updated_at = new Date().toISOString();
    
    // Move to appropriate list if status changed
    if (updates.status) {
      this.pending = this.pending.filter(it => it.id !== id);
      this.synced = this.synced.filter(it => it.id !== id);
      this.failed = this.failed.filter(it => it.id !== id);
      
      if (updates.status === 'pending') {
        this.pending.push(item);
      } else if (updates.status === 'synced') {
        this.synced.push(item);
      } else if (updates.status === 'failed') {
        this.failed.push(item);
      }
    }
    
    // Persist to IndexedDB
    if (this.store) {
      await this.store.upsert('sync_queue', item);
    }
    
    console.log(`✓ Updated queue item: ${id} → ${updates.status || 'modified'}`);
  }
  
  /**
   * MARK SYNCED - Remove from pending, add to synced
   */
  async markSynced(id) {
    const item = this.getItem(id);
    if (!item) {
      throw new Error(`Queue item not found: ${id}`);
    }
    
    this.pending = this.pending.filter(it => it.id !== id);
    this.failed = this.failed.filter(it => it.id !== id);
    
    item.status = 'synced';
    item.attempts = 0;
    item.error = null;
    item.updated_at = new Date().toISOString();
    
    this.synced.push(item);
    
    if (this.store) {
      await this.store.upsert('sync_queue', item);
    }
    
    console.log(`✓ Synced: ${item.entity_type}:${item.entity_id}`);
  }
  
  /**
   * MARK FAILED - Handle sync failure with backoff
   */
  async markFailed(id, error, attempt = 1) {
    const item = this.getItem(id);
    if (!item) {
      throw new Error(`Queue item not found: ${id}`);
    }
    
    this.pending = this.pending.filter(it => it.id !== id);
    
    if (attempt >= 8) {
      // Max retries exceeded
      console.error(`✗ Max retries exceeded: ${item.entity_type}:${item.entity_id}`);
      item.status = 'failed';
      item.attempts = attempt;
      item.error = error.message;
      item.next_retry = null;
      
      if (!this.failed.find(it => it.id === id)) {
        this.failed.push(item);
      }
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = this.calculateBackoff(attempt);
      const nextRetry = new Date(Date.now() + backoffMs);
      
      item.status = 'failed';
      item.attempts = attempt;
      item.error = error.message;
      item.next_retry = nextRetry.toISOString();
      
      if (!this.failed.find(it => it.id === id)) {
        this.failed.push(item);
      }
      
      console.warn(`⚠ Retry in ${(backoffMs / 1000).toFixed(1)}s: ${item.entity_type}:${item.entity_id}`);
    }
    
    item.updated_at = new Date().toISOString();
    
    if (this.store) {
      await this.store.upsert('sync_queue', item);
    }
  }
  
  /**
   * RETRY DUE - Get items ready to retry based on backoff
   */
  getRetryDue() {
    const now = new Date();
    return this.failed.filter(item => {
      if (!item.next_retry) return false;
      return new Date(item.next_retry) <= now && item.attempts < 8;
    });
  }
  
  /**
   * GET PENDING - Items waiting to sync
   */
  getPending() {
    return [...this.pending];
  }
  
  /**
   * GET FAILED - Items that failed to sync
   */
  getFailed() {
    return [...this.failed];
  }
  
  /**
   * CALCULATE BACKOFF - Exponential backoff with jitter
   * 1s, 2s, 4s, 8s, 16s, 32s, 1m, 1h
   */
  calculateBackoff(attempt) {
    if (attempt >= 8) return null;
    
    const baseMs = 1000;
    const maxMs = 3600000; // 1 hour
    const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    const jitter = Math.random() * 1000;
    
    return exponential + jitter;
  }
  
  /**
   * CLEAR SYNCED - Delete successfully synced items
   */
  async clearSynced() {
    if (this.store) {
      for (const item of this.synced) {
        await this.store.delete('sync_queue', item.id);
      }
    }
    
    this.synced = [];
    console.log('✓ Cleared synced items');
  }
  
  /**
   * CLEAR FAILED - Delete failed items
   */
  async clearFailed() {
    if (this.store) {
      for (const item of this.failed) {
        await this.store.delete('sync_queue', item.id);
      }
    }
    
    this.failed = [];
    console.log('✓ Cleared failed items');
  }
  
  /**
   * CLEAR ALL - Delete entire queue
   */
  async clearAll() {
    if (this.store) {
      await this.store.clearStore('sync_queue');
    }
    
    this.pending = [];
    this.syncing = [];
    this.synced = [];
    this.failed = [];
    console.log('✓ Cleared entire queue');
  }
  
  /**
   * GET STATS - Queue statistics
   */
  getStats() {
    return {
      pending: this.pending.length,
      syncing: this.syncing.length,
      synced: this.synced.length,
      failed: this.failed.length,
      retryDue: this.getRetryDue().length,
      totalQueued: this.pending.length + this.synced.length + this.failed.length
    };
  }
  
  /**
   * GENERATE ID - Unique queue item ID
   */
  generateId() {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * DEBUG - Print queue contents
   */
  debug() {
    console.log('📋 SYNC QUEUE STATUS:');
    console.log(`  Pending (${this.pending.length}):`, this.pending);
    console.log(`  Syncing (${this.syncing.length}):`, this.syncing);
    console.log(`  Synced (${this.synced.length}):`, this.synced);
    console.log(`  Failed (${this.failed.length}):`, this.failed);
    console.log(`  Ready to retry:`, this.getRetryDue());
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncQueue;
}
