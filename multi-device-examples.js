/**
 * Week 21-22: Multi-Device Sync - Usage Examples
 *
 * Real-world examples showing how to use the multi-device sync system
 * with the GradeFlow application
 */

// ============================================================================
// EXAMPLE 1: Basic Setup and Initialization
// ============================================================================

async function setupMultiDeviceSync(userId) {
  try {
    // Initialize orchestrator with offline fallback
    const orchestrator = getDeviceSyncOrchestrator();

    await orchestrator.init({
      userId: userId,
      deviceName: `Browser on ${navigator.userAgent.split("Chrome")[0]}`,
      wsUrl: "wss://api.gradeflow.app/sync", // Optional: for real-time
      syncInterval: 5000, // Sync every 5 seconds
      syncInterval: 5000,
    });

    console.log("✅ Multi-device sync initialized");
    return orchestrator;
  } catch (error) {
    console.error("❌ Failed to initialize sync:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: Real-Time Presence Tracking
// ============================================================================

async function displayOnlineUsers(orchestrator, classId) {
  const store = orchestrator.getStateStore();

  // Subscribe to device changes
  const unsubscribe = store.subscribe("device-updated", async (device) => {
    await updateOnlineUsersList();
  });

  // Get online devices
  async function updateOnlineUsersList() {
    const online = await orchestrator.getOnlineDevices();
    const userList = document.getElementById("users-online");

    userList.innerHTML = online
      .map((device) => {
        const presence = store.getPresence(device.id);
        const icon = presence?.typing ? "⌨️" : "👁️";
        return `
        <div class="user-item">
          ${icon} ${device.name}
          <span class="status">${device.status}</span>
        </div>
      `;
      })
      .join("");
  }

  // Initial load
  await updateOnlineUsersList();

  // Return unsubscribe function
  return unsubscribe;
}

// ============================================================================
// EXAMPLE 3: Track Typing Activity
// ============================================================================

function setupTypingIndicators(orchestrator) {
  const inputFields = document.querySelectorAll("input[data-tracked]");

  inputFields.forEach((field) => {
    const presence = orchestrator.getCurrentPresence();

    field.addEventListener("input", (e) => {
      // Mark as typing
      presence.setTyping(field.id, {
        value: e.target.value,
        position: e.target.selectionStart,
      });

      // Broadcast to other devices if connected
      orchestrator.broadcastPresence(presence.getPresence());
    });

    field.addEventListener("blur", (e) => {
      // Stop typing
      presence.stopTyping();
      orchestrator.broadcastPresence(presence.getPresence());
    });
  });

  // Show typing indicators from other devices
  const store = orchestrator.getStateStore();
  store.subscribe("presence-updated", (data) => {
    const { deviceId, presence } = data;
    if (deviceId !== orchestrator.getCurrentDevice().id && presence.typing) {
      showTypingIndicator(presence.typingEntity, deviceId);
    }
  });
}

// ============================================================================
// EXAMPLE 4: Handle Remote Data Changes
// ============================================================================

function setupRemoteChangeHandling(orchestrator, syncManager) {
  const store = orchestrator.getStateStore();

  // Listen for remote operations
  orchestrator.subscribe("remote-operation", async (data) => {
    const { operation, deviceId } = data;
    const otherDevice = store.getDevice(deviceId);

    console.log(`📍 ${otherDevice.name} made a change`);

    // Handle different operation types
    switch (operation.type) {
      case "insert":
        await handleRemoteInsert(operation);
        break;
      case "update":
        await handleRemoteUpdate(operation);
        break;
      case "delete":
        await handleRemoteDelete(operation);
        break;
      case "conflict":
        await handleRemoteConflict(operation);
        break;
    }
  });
}

async function handleRemoteInsert(operation) {
  const { entity, data } = operation;
  console.log(`🆕 Remote insert: ${entity}`, data);

  // Update UI
  switch (entity) {
    case "class":
      addClassToUI(data);
      break;
    case "student":
      addStudentToUI(data);
      break;
    case "score":
      addScoreToUI(data);
      break;
  }

  // Show notification
  showNotification(`New ${entity} added by another device`);
}

async function handleRemoteUpdate(operation) {
  const { entity, data, id } = operation;
  console.log(`✏️ Remote update: ${entity} ${id}`, data);

  // Update UI
  updateEntityInUI(entity, id, data);
  showNotification(`${entity} updated by another device`);
}

async function handleRemoteDelete(operation) {
  const { entity, id } = operation;
  console.log(`🗑️ Remote delete: ${entity} ${id}`);

  // Update UI
  removeEntityFromUI(entity, id);
  showNotification(`${entity} deleted by another device`);
}

async function handleRemoteConflict(operation) {
  const { entity, id, conflicts } = operation;
  console.log(`⚠️ Conflict detected: ${entity} ${id}`);

  // Show conflict resolution dialog
  showConflictDialog(entity, id, conflicts);
}

// ============================================================================
// EXAMPLE 5: Broadcast Local Changes
// ============================================================================

async function broadcastDataChange(orchestrator, operation) {
  try {
    // First, queue for offline-first sync
    const syncManager = window.gradeflowSyncManager;
    if (syncManager) {
      await syncManager.queueOperation(operation);
    }

    // Then broadcast to other devices
    await orchestrator.broadcastSyncOperation({
      ...operation,
      timestamp: Date.now(),
      sourceDevice: orchestrator.getCurrentDevice().id,
    });

    console.log("✅ Change broadcasted to other devices");
  } catch (error) {
    console.error("❌ Failed to broadcast change:", error);
  }
}

// Example usage:
async function addNewClass(orchestrator, classData) {
  const operation = {
    type: "insert",
    entity: "class",
    data: classData,
    timestamp: Date.now(),
  };

  await broadcastDataChange(orchestrator, operation);
}

// ============================================================================
// EXAMPLE 6: Conflict Resolution
// ============================================================================

function setupConflictResolution(orchestrator) {
  const store = orchestrator.getStateStore();

  // Listen for conflicts
  store.subscribe("conflict-detected", (conflict) => {
    console.log("🔀 Conflict detected:", conflict);
    showConflictResolutionUI(conflict);
  });

  // Resolve conflict (user chooses)
  window.resolveConflict = async function (conflictId, resolution) {
    store.resolveConflict(conflictId, resolution);

    // Broadcast resolution to other devices
    await orchestrator.broadcastSyncOperation({
      type: "conflict-resolution",
      conflictId,
      resolution,
      timestamp: Date.now(),
    });

    console.log("✅ Conflict resolved");
  };
}

// ============================================================================
// EXAMPLE 7: Session Management
// ============================================================================

async function trackUserSessions(orchestrator) {
  const deviceManager = orchestrator.deviceManager;
  const device = orchestrator.getCurrentDevice();

  // Show session history
  const sessions = await deviceManager.getDeviceSessions(device.id, 10);

  console.log("📋 Device Sessions:");
  sessions.forEach((session) => {
    const duration = session.endTime
      ? session.endTime - session.startTime
      : Date.now() - session.startTime;
    const durationMinutes = Math.round(duration / 60000);
    console.log(
      `  Session: ${durationMinutes} minutes (${new Date(session.startTime).toLocaleString()})`,
    );
  });

  return sessions;
}

// ============================================================================
// EXAMPLE 8: Sync Status Dashboard
// ============================================================================

function setupSyncStatusDashboard(orchestrator) {
  const store = orchestrator.getStateStore();

  // Update stats
  const statsPanel = document.getElementById("sync-stats");

  function updateStats() {
    const stats = store.getSyncStats();
    const device = orchestrator.getCurrentDevice();
    const online = orchestrator
      .getStateStore()
      .getState()
      .devices.filter((d) => d.status === "online").length;

    statsPanel.innerHTML = `
      <div class="stat">
        <label>Total Synced:</label>
        <value>${stats.totalSynced}</value>
      </div>
      <div class="stat">
        <label>Failed Syncs:</label>
        <value>${stats.failedSyncs}</value>
      </div>
      <div class="stat">
        <label>Pending:</label>
        <value>${stats.pendingOperations}</value>
      </div>
      <div class="stat">
        <label>Online Devices:</label>
        <value>${online}</value>
      </div>
      <div class="stat">
        <label>Last Sync:</label>
        <value>${stats.lastSync ? new Date(stats.lastSync).toLocaleTimeString() : "Never"}</value>
      </div>
      <div class="stat">
        <label>Connection:</label>
        <value>${orchestrator.wsHandler?.isConnected() ? "🟢 Connected" : "🔴 Offline"}</value>
      </div>
    `;
  }

  // Update on every state change
  store.subscribeAll(() => updateStats());

  // Initial update
  updateStats();

  return updateStats;
}

// ============================================================================
// EXAMPLE 9: Handle Connection Changes
// ============================================================================

function setupConnectionHandlers(orchestrator) {
  const store = orchestrator.getStateStore();

  if (orchestrator.wsHandler) {
    // Connected
    orchestrator.wsHandler.subscribe("connected", () => {
      console.log("🟢 Connected to sync server");
      showNotification("Connected to real-time sync", "success");

      // Clear any offline messages
      orchestrator.wsHandler.flushMessageQueue();
    });

    // Disconnected
    orchestrator.wsHandler.subscribe("disconnected", () => {
      console.log("🔴 Disconnected from sync server");
      showNotification(
        "Using offline mode - changes will sync when reconnected",
        "info",
      );
    });

    // Polling started (fallback)
    orchestrator.wsHandler.subscribe("polling-started", () => {
      console.log("📡 Switched to polling mode");
      showNotification("Using polling for sync", "info");
    });

    // Connection error
    orchestrator.wsHandler.subscribe("error", (error) => {
      console.error("⚠️ Connection error:", error);
    });
  }
}

// ============================================================================
// EXAMPLE 10: Complete Integration
// ============================================================================

async function initializeGradeFlowMultiDevice() {
  try {
    // Get user ID
    const userId = getCurrentUserId();

    // Setup multi-device sync
    const orchestrator = await setupMultiDeviceSync(userId);

    // Setup UI handlers
    setupTypingIndicators(orchestrator);
    setupRemoteChangeHandling(orchestrator, window.gradeflowSyncManager);
    setupConflictResolution(orchestrator);
    setupConnectionHandlers(orchestrator);
    setupSyncStatusDashboard(orchestrator);

    // Track sessions
    await trackUserSessions(orchestrator);

    // Show online users
    document.addEventListener("DOMContentLoaded", () => {
      displayOnlineUsers(orchestrator, getCurrentClassId());
    });

    // Save orchestrator globally
    window.gradeflowOrchestrator = orchestrator;

    console.log("✅ GradeFlow Multi-Device Sync Initialized");
    return orchestrator;
  } catch (error) {
    console.error("❌ Failed to initialize GradeFlow:", error);

    // Still allow app to work offline
    console.log("⚠️ Running in offline mode");
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function showNotification(message, type = "info") {
  // Implementation depends on your UI framework
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 3000);
}

function showConflictDialog(entity, id, conflicts) {
  // Show modal for conflict resolution
  const dialog = document.createElement("div");
  dialog.className = "conflict-dialog";
  dialog.innerHTML = `
    <h3>Conflict Detected</h3>
    <p>Two versions of ${entity} exist:</p>
    <div class="conflict-options">
      ${conflicts
        .map(
          (v, i) => `
        <div class="option">
          <h4>Version ${i + 1}</h4>
          <pre>${JSON.stringify(v, null, 2)}</pre>
          <button onclick="resolveConflict('${id}', ${i})">Choose</button>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  document.body.appendChild(dialog);
}

function getCurrentUserId() {
  return (
    localStorage.getItem("userId") ||
    "guest_" + Math.random().toString(36).substr(2, 9)
  );
}

function getCurrentClassId() {
  return new URLSearchParams(window.location.search).get("classId");
}

// ============================================================================
// EXPORT
// ============================================================================

// Make available globally
window.gradeflowMultiDevice = {
  setupMultiDeviceSync,
  displayOnlineUsers,
  setupTypingIndicators,
  setupRemoteChangeHandling,
  broadcastDataChange,
  setupConflictResolution,
  trackUserSessions,
  setupSyncStatusDashboard,
  setupConnectionHandlers,
  initializeGradeFlowMultiDevice,
};

// Auto-initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeGradeFlowMultiDevice);
} else {
  initializeGradeFlowMultiDevice().catch(console.error);
}
