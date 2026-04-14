/**
 * WebSocket Handler
 * Manages real-time communication between devices
 *
 * Week 21-22: Multi-Device Sync Support
 * Handles:
 * - WebSocket connection and reconnection
 * - Message sending and receiving
 * - Message queuing (offline support)
 * - Connection state management
 * - Fallback to polling
 * - Message channeling by entity type
 */

class WebSocketHandler {
  constructor(wsUrl, options = {}) {
    this.wsUrl = wsUrl;
    this.options = {
      autoReconnect: options.autoReconnect !== false,
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectDelay: options.maxReconnectDelay || 30000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      messageTimeout: options.messageTimeout || 5000,
      fallbackToPoll: options.fallbackToPoll !== false,
      pollInterval: options.pollInterval || 5000,
      ...options,
    };

    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.messageQueue = [];
    this.subscribers = new Map();
    this.listeners = [];
    this.reconnectAttempts = 0;
    this.heartbeatInterval = null;
    this.pollInterval = null;
    this.messageId = 0;
    this.pendingMessages = new Map();
  }

  /**
   * Connect to WebSocket
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      return new Promise((resolve, reject) => {
        // Check if WebSocket URL is available
        if (!this.wsUrl) {
          console.warn("WebSocket URL not available, skipping connection");
          this.emit("connection-skipped", null);
          this.connecting = false;
          if (this.options.fallbackToPoll) {
            this.startPolling();
          }
          resolve();
          return;
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.connected = true;
          this.connecting = false;
          this.reconnectAttempts = 0;
          this.emit("connected", null);
          this.flushMessageQueue();
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.emit("error", error);
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.connecting = false;
          this.emit("disconnected", null);
          this.stopHeartbeat();

          if (this.options.autoReconnect) {
            this.scheduleReconnect();
          }

          reject(new Error("WebSocket connection closed"));
        };

        // Timeout
        setTimeout(() => {
          if (
            !this.connected &&
            this.ws &&
            this.ws.readyState === WebSocket.CONNECTING
          ) {
            this.ws.close();
            reject(new Error("WebSocket connection timeout"));
          }
        }, 5000);
      });
    } catch (error) {
      this.connecting = false;
      console.warn("WebSocket connection failed:", error);
      this.emit("connection-failed", error);

      if (this.options.fallbackToPoll) {
        this.startPolling();
      }
    }
  }

  /**
   * Handle incoming message
   * @param {Object} data - Message data
   */
  handleMessage(data) {
    const { type, id, channel, payload } = data;

    // Acknowledge pending message
    if (id && this.pendingMessages.has(id)) {
      clearTimeout(this.pendingMessages.get(id).timeout);
      this.pendingMessages.delete(id);
    }

    // Route to channel subscribers
    if (channel && this.subscribers.has(channel)) {
      this.subscribers.get(channel).forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in subscriber for channel ${channel}:`, error);
        }
      });
    }

    // Emit to all listeners
    this.listeners.forEach((callback) => {
      try {
        callback({ type, channel, payload });
      } catch (error) {
        console.error("Error in WebSocket listener:", error);
      }
    });
  }

  /**
   * Send message
   * @param {string} channel - Channel name
   * @param {Object} payload - Message payload
   * @param {Object} options - Send options
   * @returns {Promise<void>}
   */
  async send(channel, payload, options = {}) {
    const messageId = ++this.messageId;
    const message = {
      id: messageId,
      type: options.type || "message",
      channel,
      payload,
      timestamp: Date.now(),
    };

    // If connected, send immediately
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve, reject) => {
        try {
          this.ws.send(JSON.stringify(message));

          // Setup timeout for ack if required
          if (options.requireAck) {
            const timeout = setTimeout(() => {
              this.pendingMessages.delete(messageId);
              reject(new Error("Message acknowledgment timeout"));
            }, this.options.messageTimeout);

            this.pendingMessages.set(messageId, {
              timeout,
              resolve,
              reject,
            });
          } else {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    }

    // Queue message if offline
    this.messageQueue.push(message);
    this.emit("message-queued", message);
  }

  /**
   * Flush queued messages
   */
  flushMessageQueue() {
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((message) => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error("Error sending queued message:", error);
          this.messageQueue.push(message);
        }
      }
    });
  }

  /**
   * Subscribe to channel
   * @param {string} channel - Channel name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel).add(callback);

    return () => {
      this.subscribers.get(channel).delete(callback);
    };
  }

  /**
   * Subscribe to all messages
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
   * Emit internal event
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
            `Error in WebSocket event subscriber for ${eventType}:`,
            error,
          );
        }
      });
    }
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, this.options.heartbeatInterval);
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
   * Start polling fallback
   */
  startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      this.emit("poll-tick", null);
    }, this.options.pollInterval);

    this.emit("polling-started", null);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Schedule reconnect
   */
  scheduleReconnect() {
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelay,
    );

    this.reconnectAttempts++;
    console.log(
      `Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("Reconnect failed:", error);
      });
    }, delay);
  }

  /**
   * Disconnect
   */
  disconnect() {
    this.stopHeartbeat();
    this.stopPolling();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.emit("manually-disconnected", null);
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get connection status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      queuedMessages: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Clear message queue
   */
  clearMessageQueue() {
    this.messageQueue = [];
  }

  /**
   * Destroy handler
   */
  destroy() {
    this.disconnect();
    this.subscribers.clear();
    this.listeners = [];
    this.pendingMessages.clear();
  }
}

// Export for browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = WebSocketHandler;
} else {
  window.WebSocketHandler = WebSocketHandler;
}
