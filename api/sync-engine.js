/**
 * 🔄 Sync Engine - Offline-First Data Synchronization
 * 
 * Main orchestrator for:
 * - Reading/writing data locally & remotely
 * - Conflict resolution
 * - Sync queue management
 * - Online/offline handling
 * 
 * Usage:
 *   const engine = new SyncEngine(supabaseClient);
 *   await engine.initialize();
 *   
 *   // Write data (works offline)
 *   await engine.write('scores', 'INSERT', scoreData);
 *   
 *   // Read data (returns local + syncs if online)
 *   const scores = await engine.read('scores', {student_id: 'xyz'});
 */

class SyncEngine {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.db = new IndexedDBStore('gradeflow');
    this.queue = new SyncQueue();
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
    
    // Event emitters for UI
    this.observers = {
      onSyncStart: [],
      onSyncEnd: [],
      onConflict: [],
      onError: [],
      onStatusChange: []
    };
  }
  
  /**
   * Initialize sync engine
   * - Open IndexedDB
   * - Restore sync queue
   * - Listen for online/offline events
   * - Start sync interval
   */
  async initialize() {
    console.log('🔄 Initializing Sync Engine...');
    
    try {
      // Initialize IndexedDB
      await this.db.initialize();
      console.log('✓ IndexedDB initialized');
      
      // Restore sync queue from IDB
      await this.queue.restore(this.db);
      console.log(`✓ Restored ${this.queue.pending.length} pending items`);
      
      // Listen for online/offline
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      
      // Start periodic sync (every 5 seconds if online)
      this.startSyncInterval();
      
      // Emit status
      this.emit('onStatusChange', {
        status: 'ready',
        isOnline: this.isOnline,
        pendingCount: this.queue.pending.length
      });
      
      console.log('✓ Sync Engine ready');
    } catch (err) {
      console.error('✗ Sync Engine initialization failed:', err);
      this.emit('onError', {type: 'init', error: err});
      throw err;
    }
  }
  
  /**
   * READ - Get data from local cache (with optional remote sync)
   */
  async read(table, query = {}) {
    try {
      // Immediately return from IndexedDB (for responsiveness)
      let localData = await this.db.query(table, query);
      
      // If online, sync and update cache
      if (this.isOnline) {
        try {
          const remoteData = await this.supabase
            .from(table)
            .select('*')
            .match(query)
            .limit(1000);
          
          if (remoteData.error) throw remoteData.error;
          
          // Update cache with remote data
          for (const row of remoteData.data || []) {
            await this.db.upsert(table, row);
          }
          
          return remoteData.data || localData;
        } catch (err) {
          console.warn(`Failed to sync ${table}, using local cache:`, err);
          return localData;
        }
      }
      
      return localData;
    } catch (err) {
      console.error(`Error reading ${table}:`, err);
      this.emit('onError', {type: 'read', table, error: err});
      throw err;
    }
  }
  
  /**
   * WRITE - Optimistic update (local first, queue for sync)
   */
  async write(table, operation, data) {
    try {
      // 1. Optimistic update: Write to local immediately
      let recordId = data.id;
      
      if (operation === 'INSERT') {
        recordId = data.id || generateUUID();
        data.id = recordId;
        data.created_at = new Date().toISOString();
        data.updated_at = new Date().toISOString();
        await this.db.insert(table, data);
      } else if (operation === 'UPDATE') {
        data.updated_at = new Date().toISOString();
        await this.db.update(table, recordId, data);
      } else if (operation === 'DELETE') {
        await this.db.delete(table, recordId);
      }
      
      // 2. Add to sync queue
      await this.queue.add({
        operation,
        entity_type: table,
        entity_id: recordId,
        data: operation !== 'DELETE' ? data : null,
        status: 'pending',
        attempts: 0
      });
      
      // 3. Trigger sync if online
      if (this.isOnline) {
        this.sync();  // Non-blocking
      }
      
      // 4. Emit UI update
      this.emit('onStatusChange', {
        status: 'pending_sync',
        pendingCount: this.queue.pending.length
      });
      
      return { id: recordId, ...data };
    } catch (err) {
      console.error(`Error writing to ${table}:`, err);
      this.emit('onError', {type: 'write', table, error: err});
      throw err;
    }
  }
  
  /**
   * SYNC - Upload pending changes to Supabase
   */
  async sync() {
    if (this.isSyncing || !this.isOnline) {
      return;
    }
    
    this.isSyncing = true;
    this.emit('onSyncStart', {pendingCount: this.queue.pending.length});
    
    try {
      const pending = [...this.queue.pending];
      let syncedCount = 0;
      let failedCount = 0;
      
      for (const item of pending) {
        try {
          await this.syncItem(item);
          syncedCount++;
        } catch (err) {
          console.error(`Sync failed for ${item.entity_type}:${item.entity_id}:`, err);
          failedCount++;
          
          // Update queue item with error
          await this.queue.update(item.id, {
            status: 'failed',
            error: err.message,
            attempts: (item.attempts || 0) + 1
          });
        }
      }
      
      this.lastSyncTime = new Date();
      
      this.emit('onSyncEnd', {
        syncedCount,
        failedCount,
        totalPending: this.queue.pending.length
      });
      
      if (syncedCount > 0) {
        this.emit('onStatusChange', {
          status: syncedCount > 0 ? 'synced' : 'partial',
          message: `${syncedCount} changes synced`,
          pendingCount: this.queue.pending.length
        });
      }
    } catch (err) {
      console.error('Sync error:', err);
      this.emit('onError', {type: 'sync', error: err});
    } finally {
      this.isSyncing = false;
    }
  }
  
  /**
   * SYNC ITEM - Sync a single queued item with conflict resolution
   */
  async syncItem(item) {
    const {operation, entity_type, entity_id, data, id: queueId} = item;
    
    try {
      if (operation === 'INSERT') {
        // Try direct insert
        const {data: inserted, error} = await this.supabase
          .from(entity_type)
          .insert([data])
          .select();
        
        if (error) {
          if (error.code === '23505') {
            // Duplicate key: Try update instead
            const {data: updated, error: updateErr} = await this.supabase
              .from(entity_type)
              .update(data)
              .eq('id', entity_id)
              .select();
            
            if (updateErr) throw updateErr;
            
            // Updated in DB, mark queue as synced
            await this.queue.markSynced(queueId);
            return;
          }
          throw error;
        }
        
        await this.queue.markSynced(queueId);
        return;
      }
      
      if (operation === 'UPDATE') {
        // Fetch remote to check for conflicts
        const {data: [remoteRecord], error: fetchErr} = await this.supabase
          .from(entity_type)
          .select('*')
          .eq('id', entity_id)
          .limit(1);
        
        if (fetchErr) throw fetchErr;
        
        if (remoteRecord) {
          // Check for conflict
          const local = data;
          const remote = remoteRecord;
          
          if (remote.updated_at && local.updated_at) {
            if (new Date(remote.updated_at) > new Date(local.updated_at)) {
              // Remote is newer: Conflict!
              this.emit('onConflict', {
                table: entity_type,
                local,
                remote,
                resolution: 'remote_wins'
              });
              
              // Update local with remote version
              await this.db.update(entity_type, entity_id, remote);
              await this.queue.markSynced(queueId);
              return;
            }
          }
        }
        
        // No conflict: Update remote
        const {error: updateErr} = await this.supabase
          .from(entity_type)
          .update(data)
          .eq('id', entity_id);
        
        if (updateErr) throw updateErr;
        
        await this.queue.markSynced(queueId);
        return;
      }
      
      if (operation === 'DELETE') {
        const {error: deleteErr} = await this.supabase
          .from(entity_type)
          .delete()
          .eq('id', entity_id);
        
        if (deleteErr) throw deleteErr;
        
        await this.queue.markSynced(queueId);
        return;
      }
    } catch (err) {
      // Exponential backoff
      const backoffMs = this.calculateBackoff(item.attempts || 0);
      const nextRetry = new Date(Date.now() + backoffMs);
      
      await this.queue.update(queueId, {
        status: 'failed',
        error: err.message,
        attempts: (item.attempts || 0) + 1,
        next_retry: nextRetry.toISOString()
      });
      
      throw err;
    }
  }
  
  /**
   * Calculate exponential backoff time
   * 1s, 2s, 4s, 8s, 16s, 32s, 1m, 1h, stop
   */
  calculateBackoff(attempt) {
    if (attempt >= 8) return null; // Stop retrying
    const baseMs = 1000;
    const maxMs = 3600000; // 1 hour
    const backoff = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    return backoff + Math.random() * 1000; // Add jitter
  }
  
  /**
   * HANDLE OFFLINE - Stop sync, show indicator
   */
  handleOffline() {
    this.isOnline = false;
    console.log('📵 Went offline');
    
    this.emit('onStatusChange', {
      status: 'offline',
      message: 'Offline mode - changes will sync when back online',
      pendingCount: this.queue.pending.length
    });
  }
  
  /**
   * HANDLE ONLINE - Resume sync
   */
  async handleOnline() {
    this.isOnline = true;
    console.log('📱 Back online');
    
    this.emit('onStatusChange', {
      status: 'resuming_sync',
      message: 'Resuming sync...',
      pendingCount: this.queue.pending.length
    });
    
    // Resume sync
    await this.sync();
  }
  
  /**
   * START SYNC INTERVAL - Auto-sync every 5 seconds
   */
  startSyncInterval() {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing && this.queue.pending.length > 0) {
        this.sync();
      }
    }, 5000);
  }
  
  /**
   * STOP SYNC INTERVAL - Cleanup
   */
  stopSyncInterval() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
  
  /**
   * GET STATUS - Current sync status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.queue.pending.length,
      failedCount: this.queue.failed.length,
      lastSyncTime: this.lastSyncTime
    };
  }
  
  /**
   * RETRY FAILED - Manually retry failed items
   */
  async retryFailed() {
    const failed = this.queue.failed;
    console.log(`Retrying ${failed.length} failed items...`);
    
    for (const item of failed) {
      // Reset to pending
      await this.queue.update(item.id, {
        status: 'pending',
        attempts: 0,
        error: null
      });
    }
    
    if (this.isOnline) {
      await this.sync();
    }
  }
  
  /**
   * CLEAR QUEUE - Delete synced items
   */
  async clearQueue() {
    await this.queue.clearSynced();
    console.log('✓ Synced queue items cleared');
  }
  
  /**
   * DESTROY - Cleanup
   */
  destroy() {
    this.stopSyncInterval();
    window.removeEventListener('online', () => this.handleOnline());
    window.removeEventListener('offline', () => this.handleOffline());
    this.observers = {};
    console.log('✓ Sync Engine destroyed');
  }
  
  /**
   * EVENT SYSTEM
   */
  on(event, callback) {
    if (this.observers[event]) {
      this.observers[event].push(callback);
    }
  }
  
  off(event, callback) {
    if (this.observers[event]) {
      this.observers[event] = this.observers[event].filter(cb => cb !== callback);
    }
  }
  
  emit(event, data) {
    if (this.observers[event]) {
      this.observers[event].forEach(cb => cb(data));
    }
  }
}

/**
 * HELPER: Generate UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncEngine;
}
