/**
 * Device Manager
 * Manages device registration, lifecycle, and metadata
 *
 * Week 21-22: Multi-Device Sync Support
 * Handles:
 * - Device registration and uniqueness
 * - Device metadata (name, type, last seen)
 * - Device lifecycle (online/offline)
 * - Local storage of device info
 */

class DeviceManager {
  constructor(dbName = "gradeflow-devices") {
    this.dbName = dbName;
    this.db = null;
    this.currentDeviceId = null;
    this.currentDevice = null;
    this.version = 1;
  }

  /**
   * Initialize device manager and IndexedDB
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create devices store
        if (!db.objectStoreNames.contains("devices")) {
          const deviceStore = db.createObjectStore("devices", {
            keyPath: "id",
          });
          deviceStore.createIndex("lastSeen", "lastSeen", { unique: false });
          deviceStore.createIndex("status", "status", { unique: false });
          deviceStore.createIndex("userId", "userId", { unique: false });
        }

        // Create device sessions store
        if (!db.objectStoreNames.contains("device_sessions")) {
          const sessionStore = db.createObjectStore("device_sessions", {
            keyPath: "id",
          });
          sessionStore.createIndex("deviceId", "deviceId", { unique: false });
          sessionStore.createIndex("startTime", "startTime", { unique: false });
          sessionStore.createIndex("endTime", "endTime", { unique: false });
        }
      };
    });
  }

  /**
   * Register or get current device
   * @param {string} userId - User ID
   * @param {Object} metadata - Device metadata (name, type, etc)
   * @returns {Promise<Object>} Device object
   */
  async registerDevice(userId, metadata = {}) {
    // Check for existing device in localStorage
    const storedDeviceId = localStorage.getItem("gradeflow-device-id");

    let device;

    if (storedDeviceId) {
      // Load existing device
      device = await this.getDevice(storedDeviceId);
      if (device && device.userId === userId) {
        // Update last seen
        device.lastSeen = Date.now();
        device.status = "online";
        await this.updateDevice(device);
        this.currentDeviceId = device.id;
        this.currentDevice = device;
        return device;
      }
    }

    // Create new device
    device = {
      id: this.generateDeviceId(),
      userId: userId,
      name: metadata.name || this.getDefaultDeviceName(),
      type: metadata.type || this.detectDeviceType(),
      browser: this.detectBrowser(),
      os: this.detectOS(),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      status: "online",
      metadata: metadata || {},
    };

    await this.addDevice(device);
    localStorage.setItem("gradeflow-device-id", device.id);

    this.currentDeviceId = device.id;
    this.currentDevice = device;

    return device;
  }

  /**
   * Add device to store
   * @param {Object} device - Device object
   * @returns {Promise<void>}
   */
  async addDevice(device) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["devices"], "readwrite");
      const store = transaction.objectStore("devices");
      const request = store.add(device);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get device by ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object|null>} Device object or null
   */
  async getDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["devices"], "readonly");
      const store = transaction.objectStore("devices");
      const request = store.get(deviceId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Update device
   * @param {Object} device - Updated device object
   * @returns {Promise<void>}
   */
  async updateDevice(device) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["devices"], "readwrite");
      const store = transaction.objectStore("devices");
      const request = store.put(device);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all devices for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of devices
   */
  async getUserDevices(userId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["devices"], "readonly");
      const store = transaction.objectStore("devices");
      const index = store.index("userId");
      const request = index.getAll(userId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get all online devices for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of online devices
   */
  async getOnlineDevices(userId) {
    const devices = await this.getUserDevices(userId);
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    return devices.filter((device) => {
      const timeSinceLastSeen = now - device.lastSeen;
      return timeSinceLastSeen < timeout; // Consider online if seen in last 5 mins
    });
  }

  /**
   * Mark device as offline
   * @param {string} deviceId - Device ID
   * @returns {Promise<void>}
   */
  async markOffline(deviceId) {
    const device = await this.getDevice(deviceId);
    if (device) {
      device.status = "offline";
      await this.updateDevice(device);
    }
  }

  /**
   * Mark device as online
   * @param {string} deviceId - Device ID
   * @returns {Promise<void>}
   */
  async markOnline(deviceId) {
    const device = await this.getDevice(deviceId);
    if (device) {
      device.status = "online";
      device.lastSeen = Date.now();
      await this.updateDevice(device);
    }
  }

  /**
   * Delete device
   * @param {string} deviceId - Device ID
   * @returns {Promise<void>}
   */
  async deleteDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["devices"], "readwrite");
      const store = transaction.objectStore("devices");
      const request = store.delete(deviceId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Create device session
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} Session object
   */
  async createSession(deviceId) {
    const session = {
      id: this.generateSessionId(),
      deviceId: deviceId,
      startTime: Date.now(),
      endTime: null,
      active: true,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["device_sessions"], "readwrite");
      const store = transaction.objectStore("device_sessions");
      const request = store.add(session);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(session);
    });
  }

  /**
   * End device session
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async endSession(sessionId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["device_sessions"], "readwrite");
      const store = transaction.objectStore("device_sessions");

      const getRequest = store.get(sessionId);
      getRequest.onsuccess = () => {
        const session = getRequest.result;
        if (session) {
          session.endTime = Date.now();
          session.active = false;
          const putRequest = store.put(session);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Get device sessions
   * @param {string} deviceId - Device ID
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Array of sessions
   */
  async getDeviceSessions(deviceId, limit = 10) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["device_sessions"], "readonly");
      const store = transaction.objectStore("device_sessions");
      const index = store.index("deviceId");
      const request = index.getAll(deviceId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sessions = request.result.sort(
          (a, b) => b.startTime - a.startTime,
        );
        resolve(sessions.slice(0, limit));
      };
    });
  }

  /**
   * Update last seen timestamp
   * @param {string} deviceId - Device ID
   * @returns {Promise<void>}
   */
  async updateLastSeen(deviceId) {
    const device = await this.getDevice(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      await this.updateDevice(device);
    }
  }

  /**
   * Generate unique device ID
   * @returns {string} Device ID
   */
  generateDeviceId() {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default device name
   * @returns {string} Device name
   */
  getDefaultDeviceName() {
    const browser = this.detectBrowser();
    const info = navigator.userAgent;
    return `${browser} on ${this.detectOS()}`;
  }

  /**
   * Detect device type
   * @returns {string} Device type
   */
  detectDeviceType() {
    if (/mobile|android|iphone|ipod|windows phone/i.test(navigator.userAgent)) {
      return "mobile";
    }
    if (/tablet|ipad|android/i.test(navigator.userAgent)) {
      return "tablet";
    }
    return "desktop";
  }

  /**
   * Detect browser
   * @returns {string} Browser name
   */
  detectBrowser() {
    const userAgent = navigator.userAgent;

    if (userAgent.includes("Chrome") && !userAgent.includes("Chromium")) {
      return "Chrome";
    }
    if (userAgent.includes("Firefox")) {
      return "Firefox";
    }
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
      return "Safari";
    }
    if (userAgent.includes("Edge")) {
      return "Edge";
    }
    return "Unknown";
  }

  /**
   * Detect OS
   * @returns {string} OS name
   */
  detectOS() {
    const userAgent = navigator.userAgent;

    if (userAgent.includes("Win")) return "Windows";
    if (userAgent.includes("Mac")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("iPhone") || userAgent.includes("iPad"))
      return "iOS";
    return "Unknown";
  }

  /**
   * Get current device
   * @returns {Object|null} Current device
   */
  getCurrentDevice() {
    return this.currentDevice;
  }

  /**
   * Get current device ID
   * @returns {string|null} Current device ID
   */
  getCurrentDeviceId() {
    return this.currentDeviceId;
  }

  /**
   * Clear all device data (for testing)
   * @returns {Promise<void>}
   */
  async clearAll() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ["devices", "device_sessions"],
        "readwrite",
      );

      transaction.objectStore("devices").clear();
      transaction.objectStore("device_sessions").clear();

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }
}

// Export for browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = DeviceManager;
} else {
  window.DeviceManager = DeviceManager;
}
