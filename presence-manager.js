/**
 * Presence Manager
 * Manages real-time presence and activity tracking across devices
 *
 * Week 21-22: Multi-Device Sync Support
 * Handles:
 * - User presence (typing, viewing, editing)
 * - Activity tracking (last action, action type)
 * - Presence heartbeat (keep-alive)
 * - Presence for specific entities (class, student, score)
 * - Broadcast presence changes
 */

class PresenceManager {
  constructor(deviceId, userId) {
    this.deviceId = deviceId;
    this.userId = userId;
    this.presence = {
      deviceId,
      userId,
      status: "online",
      currentView: null, // What page/section viewing
      currentEntity: null, // What entity viewing (e.g., class_123)
      typing: false,
      typingEntity: null,
      lastActivity: Date.now(),
      activityType: "idle", // idle, viewing, editing, typing
      cursorPosition: null, // For typing detection
      selectedItems: [],
    };

    this.subscribers = new Map();
    this.heartbeatInterval = null;
    this.activityTimer = null;
    this.heartbeatFrequency = 30000; // 30 seconds
    this.inactivityTimeout = 300000; // 5 minutes
  }

  /**
   * Initialize presence manager
   * @returns {Promise<void>}
   */
  async init() {
    this.startHeartbeat();
    this.setupActivityListeners();
    return Promise.resolve();
  }

  /**
   * Update presence status
   * @param {Object} update - Presence update
   */
  updatePresence(update) {
    this.presence = {
      ...this.presence,
      ...update,
      lastActivity: Date.now(),
    };
    this.resetActivityTimer();
    this.emit("presence-updated", this.presence);
  }

  /**
   * Set current view
   * @param {string} view - View/page name
   * @param {Object} context - Additional context
   */
  setCurrentView(view, context = {}) {
    this.updatePresence({
      currentView: view,
      activityType: "viewing",
      ...context,
    });
  }

  /**
   * Set currently viewing entity
   * @param {string} entityType - Type of entity (class, student, score)
   * @param {string} entityId - Entity ID
   */
  setCurrentEntity(entityType, entityId) {
    this.updatePresence({
      currentEntity: { type: entityType, id: entityId },
      activityType: "viewing",
    });
  }

  /**
   * Mark as typing
   * @param {string} entityId - Entity being typed in
   * @param {Object} position - Cursor position info
   */
  setTyping(entityId, position = null) {
    this.updatePresence({
      typing: true,
      typingEntity: entityId,
      activityType: "typing",
      cursorPosition: position,
    });
    this.resetTypingTimer();
  }

  /**
   * Stop typing
   */
  stopTyping() {
    this.updatePresence({
      typing: false,
      typingEntity: null,
      activityType: "viewing",
      cursorPosition: null,
    });
  }

  /**
   * Set editing mode
   * @param {string} entityId - Entity being edited
   */
  setEditing(entityId) {
    this.updatePresence({
      activityType: "editing",
      currentEntity: { type: "edit", id: entityId },
    });
  }

  /**
   * Set idle status
   */
  setIdle() {
    this.updatePresence({
      activityType: "idle",
      typing: false,
      typingEntity: null,
    });
  }

  /**
   * Select items
   * @param {Array} items - Array of selected item IDs
   */
  selectItems(items) {
    this.updatePresence({
      selectedItems: items,
      activityType: "viewing",
    });
  }

  /**
   * Get current presence
   * @returns {Object}
   */
  getPresence() {
    return { ...this.presence };
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.emit("presence-heartbeat", this.presence);
    }, this.heartbeatFrequency);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Setup activity listeners
   */
  setupActivityListeners() {
    // Track mouse movement
    document.addEventListener(
      "mousemove",
      (e) => {
        this.recordActivity("mousemove", { x: e.clientX, y: e.clientY });
      },
      { passive: true },
    );

    // Track keyboard
    document.addEventListener(
      "keydown",
      (e) => {
        this.recordActivity("keydown", { key: e.key });
      },
      { passive: true },
    );

    // Track clicks
    document.addEventListener(
      "click",
      (e) => {
        this.recordActivity("click", { target: e.target.tagName });
      },
      { passive: true },
    );

    // Track visibility
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.setIdle();
      }
    });
  }

  /**
   * Record activity
   * @param {string} type - Activity type
   * @param {Object} data - Activity data
   */
  recordActivity(type, data) {
    this.resetActivityTimer();
  }

  /**
   * Reset activity timer (for auto-idle after inactivity)
   */
  resetActivityTimer() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }

    this.activityTimer = setTimeout(() => {
      this.setIdle();
    }, this.inactivityTimeout);
  }

  /**
   * Reset typing timer
   */
  resetTypingTimer() {
    // Auto stop typing after 3 seconds of no activity
    setTimeout(() => {
      if (this.presence.typing) {
        this.stopTyping();
      }
    }, 3000);
  }

  /**
   * Subscribe to presence updates
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(callback);

    return () => {
      this.subscribers.get(eventType).delete(callback);
    };
  }

  /**
   * Emit event
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emit(eventType, data) {
    if (this.subscribers.has(eventType)) {
      this.subscribers.get(eventType).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `Error in presence subscriber for ${eventType}:`,
            error,
          );
        }
      });
    }
  }

  /**
   * Go offline
   */
  goOffline() {
    this.updatePresence({
      status: "offline",
      activityType: "idle",
    });
    this.stopHeartbeat();
  }

  /**
   * Come back online
   */
  goOnline() {
    this.updatePresence({
      status: "online",
      activityType: "idle",
    });
    this.startHeartbeat();
  }

  /**
   * Export presence for transmission
   * @returns {Object}
   */
  export() {
    return JSON.parse(JSON.stringify(this.presence));
  }

  /**
   * Destroy presence manager
   */
  destroy() {
    this.stopHeartbeat();
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    this.subscribers.clear();
  }
}

// Export for browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = PresenceManager;
} else {
  window.PresenceManager = PresenceManager;
}
