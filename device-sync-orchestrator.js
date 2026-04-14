/**
 * Device Sync Orchestrator
 * Coordinates multi-device synchronization
 *
 * Week 21-22: Multi-Device Sync Support
 * Orchestrates:
 * - Device registration and tracking
 * - Presence synchronization
 * - Real-time updates across devices
 * - Conflict resolution between devices
 * - State consistency
 * - Heartbeat and keep-alive
 */

class DeviceSyncOrchestrator {
  constructor(options = {}) {
    this.options = {
      wsUrl: options.wsUrl || null,
      dbName: options.dbName || "gradeflow",
      userId: options.userId,
      syncInterval: options.syncInterval || 5000,
      ...options,
    };

    // Core components
    this.deviceManager = null;
    this.stateStore = null;
    this.presenceManager = null;
    this.wsHandler = null;

    // State
    this.initialized = false;
    this.syncTimer = null;
    this.deviceSession = null;
  }

  /**
   * Initialize orchestrator
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    try {
      // Initialize device manager
      this.deviceManager = new DeviceManager(this.options.dbName);
      await this.deviceManager.init();

      // Initialize state store
      this.stateStore = getDeviceStateStore();
      await this.stateStore.init();

      // Register current device
      const deviceMetadata = {
        name: this.options.deviceName,
        type: this.options.deviceType,
        ...this.options.deviceMetadata,
      };

      const device = await this.deviceManager.registerDevice(
        this.options.userId,
        deviceMetadata,
      );

      this.stateStore.setCurrentDevice(device);

      // Create device session
      this.deviceSession = await this.deviceManager.createSession(device.id);

      // Initialize presence manager
      this.presenceManager = new PresenceManager(
        device.id,
        this.options.userId,
      );
      await this.presenceManager.init();

      // Setup presence update broadcast
      this.presenceManager.subscribe("presence-updated", (presence) => {
        this.stateStore.updatePresence(device.id, presence);
        this.broadcastPresence(presence);
      });

      // Initialize WebSocket handler (if URL provided)
      if (this.options.wsUrl) {
        this.wsHandler = new WebSocketHandler(this.options.wsUrl, {
          autoReconnect: true,
          fallbackToPoll: true,
          ...this.options.wsOptions,
        });

        try {
          await this.wsHandler.connect();

          // Subscribe to device updates
          this.wsHandler.subscribe("device-update", (data) => {
            this.handleDeviceUpdate(data);
          });

          // Subscribe to presence updates
          this.wsHandler.subscribe("presence-update", (data) => {
            this.handlePresenceUpdate(data);
          });

          // Subscribe to sync operations
          this.wsHandler.subscribe("sync-operation", (data) => {
            this.handleSyncOperation(data);
          });

          // Subscribe to conflicts
          this.wsHandler.subscribe("conflict-detected", (data) => {
            this.handleConflict(data);
          });

          // Subscribe to polling
          this.wsHandler.subscribe("poll-tick", () => {
            this.performSync();
          });
        } catch (error) {
          console.warn(
            "WebSocket initialization failed, using polling only:",
            error,
          );
        }
      }

      // Start periodic sync
      this.startSync();

      // Setup beforeunload
      window.addEventListener("beforeunload", () => {
        this.cleanup();
      });

      this.initialized = true;
      console.log("Device Sync Orchestrator initialized");
    } catch (error) {
      console.error("Failed to initialize Device Sync Orchestrator:", error);
      throw error;
    }
  }

  /**
   * Broadcast presence to other devices
   * @param {Object} presence - Presence data
   */
  async broadcastPresence(presence) {
    if (this.wsHandler && this.wsHandler.isConnected()) {
      try {
        await this.wsHandler.send("presence-update", {
          presence,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Error broadcasting presence:", error);
      }
    }
  }

  /**
   * Handle device update from other device
   * @param {Object} data - Update data
   */
  async handleDeviceUpdate(data) {
    const { device } = data;
    if (device && device.id !== this.deviceManager.getCurrentDeviceId()) {
      this.stateStore.updateDevice(device);
      this.stateStore.updatePresence(device.id, {
        status: device.status,
        lastSeen: device.lastSeen,
      });
    }
  }

  /**
   * Handle presence update from other device
   * @param {Object} data - Update data
   */
  async handlePresenceUpdate(data) {
    const { presence } = data;
    if (
      presence &&
      presence.deviceId !== this.deviceManager.getCurrentDeviceId()
    ) {
      this.stateStore.updatePresence(presence.deviceId, presence);
    }
  }

  /**
   * Handle sync operation from other device
   * @param {Object} data - Operation data
   */
  async handleSyncOperation(data) {
    const { operation, deviceId } = data;
    if (deviceId !== this.deviceManager.getCurrentDeviceId()) {
      // Emit event for application to handle
      this.emitSyncEvent("remote-operation", { operation, deviceId });
    }
  }

  /**
   * Handle conflict from other device
   * @param {Object} data - Conflict data
   */
  async handleConflict(data) {
    this.stateStore.addConflict(data);
    this.emitSyncEvent("conflict-detected", data);
  }

  /**
   * Perform sync with other devices
   */
  async performSync() {
    try {
      const device = this.deviceManager.getCurrentDevice();
      const presence = this.presenceManager.getPresence();
      const onlineDevices = await this.deviceManager.getOnlineDevices(
        this.options.userId,
      );

      // Update device last seen
      await this.deviceManager.updateLastSeen(device.id);

      // Emit sync tick for application
      this.emitSyncEvent("sync-tick", {
        device,
        presence,
        onlineDevices: onlineDevices.length,
      });

      // Broadcast current state if connected
      if (this.wsHandler && this.wsHandler.isConnected()) {
        await this.wsHandler.send("device-update", {
          device: {
            id: device.id,
            status: device.status,
            lastSeen: device.lastSeen,
          },
          timestamp: Date.now(),
        });
      }

      this.stateStore.incrementSynced(1);
    } catch (error) {
      console.error("Error during sync:", error);
      this.stateStore.incrementFailedSyncs(1);
    }
  }

  /**
   * Start periodic sync
   */
  startSync() {
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.options.syncInterval);
  }

  /**
   * Stop periodic sync
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Broadcast sync operation to other devices
   * @param {Object} operation - Sync operation
   */
  async broadcastSyncOperation(operation) {
    if (this.wsHandler && this.wsHandler.isConnected()) {
      try {
        await this.wsHandler.send("sync-operation", {
          operation,
          deviceId: this.deviceManager.getCurrentDeviceId(),
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Error broadcasting sync operation:", error);
      }
    }
  }

  /**
   * Report conflict between devices
   * @param {Object} conflict - Conflict data
   */
  async reportConflict(conflict) {
    this.stateStore.addConflict(conflict);

    if (this.wsHandler && this.wsHandler.isConnected()) {
      try {
        await this.wsHandler.send("conflict-detected", {
          conflict,
          deviceId: this.deviceManager.getCurrentDeviceId(),
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Error reporting conflict:", error);
      }
    }
  }

  /**
   * Get all online devices
   * @returns {Promise<Array>}
   */
  async getOnlineDevices() {
    return this.deviceManager.getOnlineDevices(this.options.userId);
  }

  /**
   * Get current device
   * @returns {Object}
   */
  getCurrentDevice() {
    return this.deviceManager.getCurrentDevice();
  }

  /**
   * Get current presence
   * @returns {Object}
   */
  getCurrentPresence() {
    return this.presenceManager.getPresence();
  }

  /**
   * Get all devices for current user
   * @returns {Promise<Array>}
   */
  async getAllDevices() {
    return this.deviceManager.getUserDevices(this.options.userId);
  }

  /**
   * Get state store
   * @returns {DeviceStateStore}
   */
  getStateStore() {
    return this.stateStore;
  }

  /**
   * Subscribe to sync events
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, callback) {
    return this.stateStore.subscribe(eventType, callback);
  }

  /**
   * Subscribe to all sync events
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    return this.stateStore.subscribeAll(callback);
  }

  /**
   * Emit sync event
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emitSyncEvent(eventType, data) {
    this.stateStore.emit(eventType, data);
  }

  /**
   * Get orchestrator status
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.initialized,
      device: this.deviceManager.getCurrentDevice(),
      presence: this.presenceManager.getPresence(),
      wsStatus: this.wsHandler ? this.wsHandler.getStatus() : null,
      syncStats: this.stateStore.getSyncStats(),
    };
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    try {
      this.stopSync();

      // End device session
      if (this.deviceSession) {
        await this.deviceManager.endSession(this.deviceSession.id);
      }

      // Mark device as offline
      const device = this.deviceManager.getCurrentDevice();
      if (device) {
        await this.deviceManager.markOffline(device.id);
      }

      // Destroy presence manager
      if (this.presenceManager) {
        this.presenceManager.destroy();
      }

      // Disconnect WebSocket
      if (this.wsHandler) {
        this.wsHandler.disconnect();
      }

      console.log("Device Sync Orchestrator cleaned up");
    } catch (error) {
      console.error("Error cleaning up Device Sync Orchestrator:", error);
    }
  }

  /**
   * Destroy orchestrator
   */
  destroy() {
    this.cleanup();
  }
}

// Singleton instance
let orchestratorInstance = null;

function getDeviceSyncOrchestrator(options = {}) {
  if (!orchestratorInstance) {
    orchestratorInstance = new DeviceSyncOrchestrator(options);
  }
  return orchestratorInstance;
}

// Export for browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DeviceSyncOrchestrator, getDeviceSyncOrchestrator };
} else {
  window.DeviceSyncOrchestrator = DeviceSyncOrchestrator;
  window.getDeviceSyncOrchestrator = getDeviceSyncOrchestrator;
}
