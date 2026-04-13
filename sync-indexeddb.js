/**
 * 💾 IndexedDB Manager for GradeFlow Offline Cache
 * 
 * Manages local data storage for offline-first sync
 * Week 19-20 Implementation
 */

class SyncIndexedDB {
  constructor(dbName = 'gradeflow-v1', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.stores = [
      'schools', 'users', 'classes', 'students',
      'scores', 'attendance', 'materials', 'quizzes',
      'quiz_results', 'audit_logs',
      'sync_queue', 'sync_log', 'auth_state'
    ];
  }

  /**
   * Initialize IndexedDB and create/upgrade schema
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✓ IndexedDB initialized:', this.dbName);
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Data tables
        this.createObjectStore(db, 'schools', 'id');
        this.createObjectStore(db, 'users', 'id', ['school_id', 'email']);
        this.createObjectStore(db, 'classes', 'id', ['school_id']);
        this.createObjectStore(db, 'students', 'id', ['class_id', 'school_id', 'email']);
        this.createObjectStore(db, 'scores', 'id', ['student_id', 'subject_id', 'class_id']);
        this.createObjectStore(db, 'attendance', 'id', ['student_id', 'class_id', 'date']);
        this.createObjectStore(db, 'materials', 'id', ['class_id']);
        this.createObjectStore(db, 'quizzes', 'id', ['class_id']);
        this.createObjectStore(db, 'quiz_results', 'id', ['student_id', 'quiz_id']);
        this.createObjectStore(db, 'audit_logs', 'id', ['school_id']);

        // Sync metadata
        this.createObjectStore(db, 'sync_queue', 'id', ['status', 'entity_type', 'timestamp']);
        this.createObjectStore(db, 'sync_log', 'id', ['entity_type', 'timestamp']);
        this.createObjectStore(db, 'auth_state', 'key');
      };
    });
  }

  /**
   * Create an object store with indexes
   */
  createObjectStore(db, storeName, keyPath, indexes = []) {
    if (db.objectStoreNames.contains(storeName)) {
      db.deleteObjectStore(storeName);
    }

    const store = db.createObjectStore(storeName, { keyPath });
    
    // Add indexes
    indexes.forEach(indexName => {
      store.createIndex(indexName, indexName, { unique: false });
    });

    console.log(`  • Created store: ${storeName}`);
  }

  /**
   * Get all records from a store
   */
  async getAll(storeName) {
    return this.performTransaction(storeName, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Get single record by ID
   */
  async get(storeName, id) {
    return this.performTransaction(storeName, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Query by index
   */
  async queryByIndex(storeName, indexName, value) {
    return this.performTransaction(storeName, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Insert record
   */
  async insert(storeName, data) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.add({
          ...data,
          _synced: false,
          _created_at: Date.now()
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Update record
   */
  async update(storeName, id, data) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.put({
          ...data,
          id,
          _synced: false,
          _updated_at: Date.now()
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Delete record
   */
  async delete(storeName, id) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Clear entire store
   */
  async clear(storeName) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Batch insert
   */
  async batchInsert(storeName, records) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        let count = 0;
        records.forEach(record => {
          const request = store.add({
            ...record,
            _synced: false,
            _created_at: Date.now()
          });
          request.onsuccess = () => {
            count++;
            if (count === records.length) resolve(count);
          };
          request.onerror = () => reject(request.error);
        });
      });
    });
  }

  /**
   * Generic transaction wrapper
   */
  performTransaction(storeName, mode, callback) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        // Will be resolved by callback
      };

      try {
        Promise.resolve(callback(store)).then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get database stats
   */
  async getStats() {
    const stats = {
      stores: {},
      totalSize: 0,
      lastSync: null
    };

    for (const storeName of this.stores) {
      const records = await this.getAll(storeName);
      stats.stores[storeName] = records.length;
    }

    return stats;
  }

  /**
   * Close database
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('✓ IndexedDB closed');
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncIndexedDB;
}
