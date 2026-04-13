/**
 * 📦 IndexedDB Store - Local Offline Cache
 * 
 * Handles all IndexedDB operations:
 * - Create/Read/Update/Delete (CRUD)
 * - Querying with filters
 * - Index-based lookups
 * - Cleanup & migration
 * 
 * Usage:
 *   const store = new IndexedDBStore('gradeflow');
 *   await store.initialize();
 *   await store.insert('scores', scoreData);
 *   const scores = await store.query('scores', {student_id: 'xyz'});
 */

class IndexedDBStore {
  constructor(dbName = 'gradeflow', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }
  
  /**
   * Initialize IndexedDB
   * Creates all stores and indexes
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      // Create database schema
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Define all stores matching Supabase schema
        const stores = {
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
          sync_queue: { keyPath: 'id', indexes: ['status', 'entity_type', 'created_at', 'next_retry'] },
          sync_metadata: { keyPath: 'key' }
        };
        
        for (const [storeName, config] of Object.entries(stores)) {
          // Create store if not exists
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
            
            // Create indexes
            for (const indexName of (config.indexes || [])) {
              store.createIndex(indexName, indexName, { unique: false });
            }
          }
        }
        
        console.log('✓ IndexedDB schema created');
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✓ IndexedDB opened');
        resolve();
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };
    });
  }
  
  /**
   * GET TRANSACTION - Helper for read/write
   */
  getTransaction(storeNames, mode = 'readonly') {
    if (!this.db) throw new Error('IndexedDB not initialized');
    
    if (!Array.isArray(storeNames)) {
      storeNames = [storeNames];
    }
    
    return this.db.transaction(storeNames, mode);
  }
  
  /**
   * INSERT - Add new record
   */
  async insert(store, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.add(data);
      
      request.onsuccess = () => {
        console.log(`✓ Inserted into ${store}:`, data.id);
        resolve(request.result);
      };
      
      request.onerror = () => {
        if (request.error.name === 'ConstraintError') {
          reject(new Error(`Duplicate key in ${store}: ${data.id}`));
        } else {
          reject(request.error);
        }
      };
    });
  }
  
  /**
   * UPDATE - Modify existing record
   */
  async update(store, id, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      
      // Get existing record
      const getRequest = objectStore.get(id);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error(`Record not found: ${store}:${id}`));
          return;
        }
        
        // Merge data
        const updated = { ...existing, ...data };
        const putRequest = objectStore.put(updated);
        
        putRequest.onsuccess = () => {
          console.log(`✓ Updated ${store}:${id}`);
          resolve(updated);
        };
        
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
  
  /**
   * UPSERT - Insert or update
   */
  async upsert(store, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.put(data);
      
      request.onsuccess = () => {
        console.log(`✓ Upserted ${store}:${data.id}`);
        resolve(request.result);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * DELETE - Remove record
   */
  async delete(store, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.delete(id);
      
      request.onsuccess = () => {
        console.log(`✓ Deleted ${store}:${id}`);
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * GET - Fetch by id
   */
  async get(store, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * QUERY - Find records matching criteria
   * Example: query('scores', {student_id: 'xyz', subject_id: 'math'})
   */
  async query(store, filters = {}) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      
      // If single filter on an indexed field, use index
      const filterKeys = Object.keys(filters);
      
      if (filterKeys.length === 1) {
        const indexName = filterKeys[0];
        const value = filters[indexName];
        
        try {
          const index = objectStore.index(indexName);
          const request = index.getAll(value);
          
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
          return;
        } catch (err) {
          // Index doesn't exist, fall through to manual filtering
        }
      }
      
      // Multiple filters or no index: scan all + filter
      const request = objectStore.getAll();
      
      request.onsuccess = () => {
        let results = request.result || [];
        
        // Apply filters
        for (const [key, value] of Object.entries(filters)) {
          results = results.filter(item => item[key] === value);
        }
        
        resolve(results);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * GET ALL - Fetch all records in store
   */
  async getAll(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * COUNT - Count records matching criteria
   */
  async count(store, filters = {}) {
    const results = await this.query(store, filters);
    return results.length;
  }
  
  /**
   * CLEAR STORE - Delete all records
   */
  async clearStore(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.clear();
      
      request.onsuccess = () => {
        console.log(`✓ Cleared ${store}`);
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * CLEAR ALL - Delete entire database
   */
  async clearAll() {
    const stores = [
      'schools', 'users', 'classes', 'students', 'scores',
      'attendance', 'materials', 'quizzes', 'quiz_results',
      'audit_logs', 'sync_queue', 'sync_metadata'
    ];
    
    for (const store of stores) {
      await this.clearStore(store);
    }
    
    console.log('✓ All stores cleared');
  }
  
  /**
   * BATCH INSERT - Insert multiple records
   */
  async batchInsert(store, records) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const results = [];
      
      for (const record of records) {
        const request = objectStore.add(record);
        request.onsuccess = () => results.push(request.result);
        request.onerror = () => console.warn(`Failed to insert`, record);
      }
      
      transaction.oncomplete = () => {
        console.log(`✓ Batch inserted ${results.length}/${records.length}`);
        resolve(results);
      };
      
      transaction.onerror = () => reject(transaction.error);
    });
  }
  
  /**
   * BATCH UPDATE - Update multiple records
   */
  async batchUpdate(store, records) {
    return new Promise((resolve, reject) => {
      const transaction = this.getTransaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const results = [];
      
      for (const record of records) {
        const request = objectStore.put(record);
        request.onsuccess = () => results.push(request.result);
        request.onerror = () => console.warn(`Failed to update`, record);
      }
      
      transaction.oncomplete = () => {
        console.log(`✓ Batch updated ${results.length}/${records.length}`);
        resolve(results);
      };
      
      transaction.onerror = () => reject(transaction.error);
    });
  }
  
  /**
   * GET STATS - Database statistics
   */
  async getStats() {
    const stores = [
      'schools', 'users', 'classes', 'students', 'scores',
      'attendance', 'materials', 'quizzes', 'quiz_results',
      'audit_logs', 'sync_queue'
    ];
    
    const stats = {};
    for (const store of stores) {
      stats[store] = await this.count(store);
    }
    
    return stats;
  }
  
  /**
   * EXPORT DATA - For backup/debugging
   */
  async exportData() {
    const stores = [
      'schools', 'users', 'classes', 'students', 'scores',
      'attendance', 'materials', 'quizzes', 'quiz_results',
      'audit_logs'
    ];
    
    const backup = {};
    for (const store of stores) {
      backup[store] = await this.getAll(store);
    }
    
    return backup;
  }
  
  /**
   * IMPORT DATA - Restore from backup
   */
  async importData(backup) {
    for (const [store, records] of Object.entries(backup)) {
      await this.clearStore(store);
      if (records.length > 0) {
        await this.batchInsert(store, records);
      }
    }
    
    console.log('✓ Data imported');
  }
  
  /**
   * CLOSE - Clean shutdown
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('✓ IndexedDB closed');
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IndexedDBStore;
}
