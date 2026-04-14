/**
 * Device State Store
 * Manages centralized device state with reactive updates
 *
 * Week 21-22: Multi-Device Sync Support
 * Handles:
 * - Device state tracking
 * - Reactive state changes
 * - State subscriptions (pub/sub)
 * - Device status indicators
 * - Conflict tracking
 */

class DeviceStateStore {
  constructor() {
    this.state = {
      currentDeviceId: null,
      currentDevice: null,
      devices: new Map(), // deviceId -> device
      presence: new Map(), // deviceId -> presence info
      sessions: new Map(), // deviceId -> active sessions
      conflicts: [], // Array of conflicts
      syncStats: {
        totalSynced: 0,
        failedSyncs: 0,
        lastSync: null,
        pendingOperations: 0,
      },
    };

    this.subscribers = new Map(); // eventType -> Set of callbacks
    this.listeners = [];
  }

  /**
   * Initialize store
   * @returns {Promise<void>}
   */
  async init() {
    this.state.currentDeviceId = this.getCurrentDeviceIdFromStorage();
    return Promise.resolve();
  }

  /**
   * Set current device
   * @param {Object} device - Device object
   */
  setCurrentDevice(device) {
    this.state.currentDevice = device;
    this.state.currentDeviceId = device.id;
    this.saveCurrentDeviceToStorage(device.id);
    this.emit("current-device-changed", device);
  }

  /**
   * Add or update device in state
   * @param {Object} device - Device object
   */
  updateDevice(device) {
    this.state.devices.set(device.id, device);
    this.emit("device-updated", device);
  }

  /**
   * Get device from state
   * @param {string} deviceId - Device ID
   * @returns {Object|undefined}
   */
  getDevice(deviceId) {
    return this.state.devices.get(deviceId);
  }

  /**
   * Get all devices
   * @returns {Array}
   */
  getAllDevices() {
    return Array.from(this.state.devices.values());
  }

  /**
   * Get online devices
   * @returns {Array}
   */
  getOnlineDevices() {
    return this.getAllDevices().filter((d) => d.status === "online");
  }

  /**
   * Remove device from state
   * @param {string} deviceId - Device ID
   */
  removeDevice(deviceId) {
    this.state.devices.delete(deviceId);
    this.state.presence.delete(deviceId);
    this.state.sessions.delete(deviceId);
    this.emit("device-removed", deviceId);
  }

  /**
   * Update presence for device
   * @param {string} deviceId - Device ID
   * @param {Object} presence - Presence info
   */
  updatePresence(deviceId, presence) {
    this.state.presence.set(deviceId, {
      deviceId,
      ...presence,
      lastUpdated: Date.now(),
    });
    this.emit("presence-updated", { deviceId, presence });
  }

  /**
   * Get presence for device
   * @param {string} deviceId - Device ID
   * @returns {Object|undefined}
   */
  getPresence(deviceId) {
    return this.state.presence.get(deviceId);
  }

  /**
   * Get all presence
   * @returns {Array}
   */
  getAllPresence() {
    return Array.from(this.state.presence.values());
  }

  /**
   * Set active session for device
   * @param {string} deviceId - Device ID
   * @param {Object} session - Session info
   */
  setSession(deviceId, session) {
    if (!this.state.sessions.has(deviceId)) {
      this.state.sessions.set(deviceId, []);
    }
    const sessions = this.state.sessions.get(deviceId);
    sessions.push(session);
    this.emit("session-started", { deviceId, session });
  }

  /**
   * Get sessions for device
   * @param {string} deviceId - Device ID
   * @returns {Array}
   */
  getSessions(deviceId) {
    return this.state.sessions.get(deviceId) || [];
  }

  /**
   * End session for device
   * @param {string} deviceId - Device ID
   * @param {string} sessionId - Session ID
   */
  endSession(deviceId, sessionId) {
    const sessions = this.state.sessions.get(deviceId);
    if (sessions) {
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index !== -1) {
        sessions[index].endTime = Date.now();
        this.emit("session-ended", { deviceId, sessionId });
      }
    }
  }

  /**
   * Add conflict
   * @param {Object} conflict - Conflict object
   */
  addConflict(conflict) {
    this.state.conflicts.push({
      ...conflict,
      id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      status: "pending",
    });
    this.emit("conflict-detected", conflict);
  }

  /**
   * Get all conflicts
   * @returns {Array}
   */
  getConflicts() {
    return this.state.conflicts;
  }

  /**
   * Resolve conflict
   * @param {string} conflictId - Conflict ID
   * @param {Object} resolution - Resolution data
   */
  resolveConflict(conflictId, resolution) {
    const conflict = this.state.conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      conflict.status = "resolved";
      conflict.resolution = resolution;
      conflict.resolvedAt = Date.now();
      this.emit("conflict-resolved", { conflictId, resolution });
    }
  }

  /**
   * Clear conflicts
   */
  clearConflicts() {
    this.state.conflicts = [];
    this.emit("conflicts-cleared", null);
  }

  /**
   * Update sync stats
   * @param {Object} stats - Stats update
   */
  updateSyncStats(stats) {
    this.state.syncStats = {
      ...this.state.syncStats,
      ...stats,
      lastSync: Date.now(),
    };
    this.emit("sync-stats-updated", this.state.syncStats);
  }

  /**
   * Increment synced count
   * @param {number} count - Count to add
   */
  incrementSynced(count = 1) {
    this.state.syncStats.totalSynced += count;
    this.updateSyncStats({});
  }

  /**
   * Increment failed syncs
   * @param {number} count - Count to add
   */
  incrementFailedSyncs(count = 1) {
    this.state.syncStats.failedSyncs += count;
    this.updateSyncStats({});
  }

  /**
   * Set pending operations
   * @param {number} count - Number of pending operations
   */
  setPendingOperations(count) {
    this.updateSyncStats({ pendingOperations: count });
  }

  /**
   * Get sync stats
   * @returns {Object}
   */
  getSyncStats() {
    return { ...this.state.syncStats };
  }

  /**
   * Subscribe to event
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType).delete(callback);
    };
  }

  /**
   * Subscribe to all events
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event to subscribers
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emit(eventType, data) {
    // Call specific subscribers
    if (this.subscribers.has(eventType)) {
      this.subscribers.get(eventType).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in subscriber for ${eventType}:`, error);
        }
      });
    }

    // Call all listeners
    this.listeners.forEach((callback) => {
      try {
        callback({ eventType, data });
      } catch (error) {
        console.error("Error in listener:", error);
      }
    });
  }

  /**
   * Get complete state snapshot
   * @returns {Object}
   */
  getState() {
    return {
      currentDeviceId: this.state.currentDeviceId,
      currentDevice: this.state.currentDevice,
      devices: Array.from(this.state.devices.values()),
      presence: Array.from(this.state.presence.values()),
      conflicts: [...this.state.conflicts],
      syncStats: { ...this.state.syncStats },
    };
  }

  /**
   * Clear all state
   */
  clear() {
    this.state.devices.clear();
    this.state.presence.clear();
    this.state.sessions.clear();
    this.state.conflicts = [];
    this.state.currentDevice = null;
    this.state.currentDeviceId = null;
    this.emit("state-cleared", null);
  }

  /**
   * Save current device ID to localStorage
   * @param {string} deviceId - Device ID
   */
  saveCurrentDeviceToStorage(deviceId) {
    try {
      localStorage.setItem("gradeflow-current-device-id", deviceId);
    } catch (error) {
      console.warn("Failed to save current device to storage:", error);
    }
  }

  /**
   * Get current device ID from localStorage
   * @returns {string|null}
   */
  getCurrentDeviceIdFromStorage() {
    try {
      return localStorage.getItem("gradeflow-current-device-id");
    } catch (error) {
      console.warn("Failed to get current device from storage:", error);
      return null;
    }
  }
}

// Singleton instance
let deviceStateStoreInstance = null;

function getDeviceStateStore() {
  if (!deviceStateStoreInstance) {
    deviceStateStoreInstance = new DeviceStateStore();
  }
  return deviceStateStoreInstance;
}

// Export for browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DeviceStateStore, getDeviceStateStore };
} else {
  window.DeviceStateStore = DeviceStateStore;
  window.getDeviceStateStore = getDeviceStateStore;
}
