/**
 * Week 21-22: Multi-Device Sync - Test Suite
 *
 * Comprehensive tests covering all multi-device sync components
 * Run in browser console or with test framework
 */

class MultiDeviceTestSuite {
  constructor() {
    this.results = [];
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
  }

  // ========================================================================
  // DEVICE MANAGER TESTS
  // ========================================================================

  async testDeviceRegistration() {
    try {
      const manager = new DeviceManager("test-device-db");
      await manager.init();

      const device = await manager.registerDevice("user_123", {
        name: "Test Device",
        type: "desktop",
      });

      if (!device.id || !device.userId || device.userId !== "user_123") {
        throw new Error("Device registration failed");
      }

      await manager.deleteDevice(device.id);
      this.pass("Device Registration");
    } catch (error) {
      this.fail("Device Registration", error);
    }
  }

  async testDeviceRetrieval() {
    try {
      const manager = new DeviceManager("test-device-db-2");
      await manager.init();

      const device = await manager.registerDevice("user_123", {
        name: "Device A",
      });

      const retrieved = await manager.getDevice(device.id);

      if (!retrieved || retrieved.id !== device.id) {
        throw new Error("Failed to retrieve device");
      }

      await manager.clearAll();
      this.pass("Device Retrieval");
    } catch (error) {
      this.fail("Device Retrieval", error);
    }
  }

  async testGetUserDevices() {
    try {
      const manager = new DeviceManager("test-device-db-3");
      await manager.init();

      // Register two devices
      const device1 = await manager.registerDevice("user_123", {
        name: "Device A",
      });

      const device2 = await manager.registerDevice("user_123", {
        name: "Device B",
      });

      const devices = await manager.getUserDevices("user_123");

      if (devices.length < 2) {
        throw new Error("Failed to get user devices");
      }

      await manager.clearAll();
      this.pass("Get User Devices");
    } catch (error) {
      this.fail("Get User Devices", error);
    }
  }

  async testGetOnlineDevices() {
    try {
      const manager = new DeviceManager("test-device-db-4");
      await manager.init();

      const device = await manager.registerDevice("user_123", {
        name: "Online Device",
      });

      const online = await manager.getOnlineDevices("user_123");

      if (online.length === 0) {
        throw new Error("Device not marked as online");
      }

      await manager.clearAll();
      this.pass("Get Online Devices");
    } catch (error) {
      this.fail("Get Online Devices", error);
    }
  }

  async testDeviceSessions() {
    try {
      const manager = new DeviceManager("test-device-db-5");
      await manager.init();

      const device = await manager.registerDevice("user_123", {
        name: "Session Device",
      });

      const session = await manager.createSession(device.id);

      if (!session || !session.id) {
        throw new Error("Session creation failed");
      }

      await manager.endSession(session.id);
      const sessions = await manager.getDeviceSessions(device.id);

      if (sessions.length === 0) {
        throw new Error("Session not retrieved");
      }

      await manager.clearAll();
      this.pass("Device Sessions");
    } catch (error) {
      this.fail("Device Sessions", error);
    }
  }

  // ========================================================================
  // DEVICE STATE STORE TESTS
  // ========================================================================

  async testStateStoreUpdate() {
    try {
      const store = new DeviceStateStore();
      await store.init();

      const device = {
        id: "device_123",
        name: "Test Device",
        status: "online",
      };

      store.updateDevice(device);
      const retrieved = store.getDevice("device_123");

      if (!retrieved || retrieved.id !== "device_123") {
        throw new Error("Device not in state store");
      }

      store.clear();
      this.pass("State Store Update");
    } catch (error) {
      this.fail("State Store Update", error);
    }
  }

  async testPresenceUpdate() {
    try {
      const store = new DeviceStateStore();
      await store.init();

      const presence = {
        deviceId: "device_123",
        status: "online",
        currentView: "classes",
      };

      store.updatePresence("device_123", presence);
      const retrieved = store.getPresence("device_123");

      if (!retrieved || retrieved.currentView !== "classes") {
        throw new Error("Presence not updated");
      }

      store.clear();
      this.pass("Presence Update");
    } catch (error) {
      this.fail("Presence Update", error);
    }
  }

  async testConflictDetection() {
    try {
      const store = new DeviceStateStore();
      await store.init();

      const conflict = {
        entityType: "score",
        entityId: "score_123",
        version1: { value: 85 },
        version2: { value: 90 },
      };

      store.addConflict(conflict);
      const conflicts = store.getConflicts();

      if (conflicts.length === 0) {
        throw new Error("Conflict not stored");
      }

      store.clear();
      this.pass("Conflict Detection");
    } catch (error) {
      this.fail("Conflict Detection", error);
    }
  }

  async testSubscriptions() {
    try {
      const store = new DeviceStateStore();
      await store.init();

      let eventFired = false;

      store.subscribe("device-updated", (device) => {
        eventFired = true;
      });

      store.updateDevice({ id: "device_123", name: "Test" });

      if (!eventFired) {
        throw new Error("Subscription not triggered");
      }

      store.clear();
      this.pass("Subscriptions");
    } catch (error) {
      this.fail("Subscriptions", error);
    }
  }

  // ========================================================================
  // PRESENCE MANAGER TESTS
  // ========================================================================

  async testPresenceInitialization() {
    try {
      const presence = new PresenceManager("device_123", "user_123");
      await presence.init();

      const p = presence.getPresence();

      if (!p || p.deviceId !== "device_123") {
        throw new Error("Presence not initialized");
      }

      presence.destroy();
      this.pass("Presence Initialization");
    } catch (error) {
      this.fail("Presence Initialization", error);
    }
  }

  async testTypingTracking() {
    try {
      const presence = new PresenceManager("device_123", "user_123");
      await presence.init();

      presence.setTyping("input_123");
      let p = presence.getPresence();

      if (!p.typing) {
        throw new Error("Typing not set");
      }

      presence.stopTyping();
      p = presence.getPresence();

      if (p.typing) {
        throw new Error("Typing not stopped");
      }

      presence.destroy();
      this.pass("Typing Tracking");
    } catch (error) {
      this.fail("Typing Tracking", error);
    }
  }

  async testViewTracking() {
    try {
      const presence = new PresenceManager("device_123", "user_123");
      await presence.init();

      presence.setCurrentView("classes", { classId: "class_123" });
      const p = presence.getPresence();

      if (p.currentView !== "classes") {
        throw new Error("View not tracked");
      }

      presence.destroy();
      this.pass("View Tracking");
    } catch (error) {
      this.fail("View Tracking", error);
    }
  }

  // ========================================================================
  // WEBSOCKET HANDLER TESTS
  // ========================================================================

  async testWebSocketInitialization() {
    try {
      const ws = new WebSocketHandler(null, { fallbackToPoll: true });

      // Should not error with null URL
      const status = ws.getStatus();

      if (!status.hasOwnProperty("connected")) {
        throw new Error("Status not available");
      }

      ws.destroy();
      this.pass("WebSocket Initialization");
    } catch (error) {
      this.fail("WebSocket Initialization", error);
    }
  }

  async testMessageQueueing() {
    try {
      const ws = new WebSocketHandler(null, { fallbackToPoll: true });

      // Should queue messages when not connected
      await ws.send("test-channel", { data: "test" }).catch(() => {});

      const status = ws.getStatus();

      if (status.queuedMessages === 0) {
        throw new Error("Messages not queued");
      }

      ws.destroy();
      this.pass("Message Queueing");
    } catch (error) {
      this.fail("Message Queueing", error);
    }
  }

  // ========================================================================
  // DEVICE SYNC ORCHESTRATOR TESTS
  // ========================================================================

  async testOrchestratorInitialization() {
    try {
      const orchestrator = new DeviceSyncOrchestrator({
        userId: "user_123",
        dbName: "test-orchestrator-db",
      });

      await orchestrator.init();

      if (!orchestrator.currentDeviceId) {
        throw new Error("Orchestrator not initialized");
      }

      await orchestrator.cleanup();
      this.pass("Orchestrator Initialization");
    } catch (error) {
      this.fail("Orchestrator Initialization", error);
    }
  }

  async testOrchestratorDeviceTracking() {
    try {
      const orchestrator = new DeviceSyncOrchestrator({
        userId: "user_123",
        dbName: "test-orchestrator-db-2",
      });

      await orchestrator.init();

      const device = orchestrator.getCurrentDevice();

      if (!device || !device.id) {
        throw new Error("Device not tracked");
      }

      await orchestrator.cleanup();
      this.pass("Orchestrator Device Tracking");
    } catch (error) {
      this.fail("Orchestrator Device Tracking", error);
    }
  }

  async testOrchestratorPresence() {
    try {
      const orchestrator = new DeviceSyncOrchestrator({
        userId: "user_123",
        dbName: "test-orchestrator-db-3",
      });

      await orchestrator.init();

      const presence = orchestrator.getCurrentPresence();

      if (!presence || !presence.deviceId) {
        throw new Error("Presence not tracked");
      }

      await orchestrator.cleanup();
      this.pass("Orchestrator Presence");
    } catch (error) {
      this.fail("Orchestrator Presence", error);
    }
  }

  async testOrchestratorSync() {
    try {
      const orchestrator = new DeviceSyncOrchestrator({
        userId: "user_123",
        dbName: "test-orchestrator-db-4",
        syncInterval: 1000, // Quick sync for testing
      });

      await orchestrator.init();

      // Wait for one sync
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const stats = orchestrator.getStateStore().getSyncStats();

      if (stats.totalSynced === 0) {
        throw new Error("Sync not performed");
      }

      await orchestrator.cleanup();
      this.pass("Orchestrator Sync");
    } catch (error) {
      this.fail("Orchestrator Sync", error);
    }
  }

  // ========================================================================
  // TEST UTILITIES
  // ========================================================================

  async runAll() {
    console.log("🧪 Starting Multi-Device Sync Test Suite\n");

    // Device Manager
    await this.testDeviceRegistration();
    await this.testDeviceRetrieval();
    await this.testGetUserDevices();
    await this.testGetOnlineDevices();
    await this.testDeviceSessions();

    // Device State Store
    await this.testStateStoreUpdate();
    await this.testPresenceUpdate();
    await this.testConflictDetection();
    await this.testSubscriptions();

    // Presence Manager
    await this.testPresenceInitialization();
    await this.testTypingTracking();
    await this.testViewTracking();

    // WebSocket Handler
    await this.testWebSocketInitialization();
    await this.testMessageQueueing();

    // Device Sync Orchestrator
    await this.testOrchestratorInitialization();
    await this.testOrchestratorDeviceTracking();
    await this.testOrchestratorPresence();
    await this.testOrchestratorSync();

    this.printSummary();
  }

  pass(testName) {
    this.testCount++;
    this.passCount++;
    this.results.push({
      name: testName,
      status: "PASS",
      time: new Date().toLocaleTimeString(),
    });
    console.log(`✅ ${testName}`);
  }

  fail(testName, error) {
    this.testCount++;
    this.failCount++;
    this.results.push({
      name: testName,
      status: "FAIL",
      error: error.message,
      time: new Date().toLocaleTimeString(),
    });
    console.error(`❌ ${testName}: ${error.message}`);
  }

  printSummary() {
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total:  ${this.testCount}`);
    console.log(`Passed: ${this.passCount} ✅`);
    console.log(`Failed: ${this.failCount} ❌`);
    console.log("=".repeat(50));

    if (this.failCount === 0) {
      console.log("🎉 ALL TESTS PASSED!");
    } else {
      console.log("⚠️ Some tests failed. Check output above.");
    }

    return {
      total: this.testCount,
      passed: this.passCount,
      failed: this.failCount,
    };
  }
}

// ============================================================================
// EXPORT AND AUTO-RUN
// ============================================================================

// Make available globally
window.MultiDeviceTestSuite = MultiDeviceTestSuite;
window.runMultiDeviceTests = async function () {
  const suite = new MultiDeviceTestSuite();
  await suite.runAll();
  return suite;
};

// Auto-run if explicitly requested
if (window.location.search.includes("run-tests")) {
  console.log("Auto-running multi-device tests...");
  window.runMultiDeviceTests().catch(console.error);
}

console.log("✅ Multi-Device Test Suite loaded");
console.log("Run: await runMultiDeviceTests()");
