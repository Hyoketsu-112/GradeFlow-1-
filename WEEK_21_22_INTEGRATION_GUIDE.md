# Week 21-22: Multi-Device Sync Integration Guide

## Overview

The multi-device sync system introduces real-time synchronization across multiple browser tabs, windows, and devices. It builds on Week 19-20's offline-first infrastructure by adding device awareness, presence broadcasting, and cross-device coordination.

**New Components:**

1. **DeviceManager** - Register and track devices
2. **DeviceStateStore** - Centralized state management
3. **PresenceManager** - Real-time activity tracking
4. **WebSocketHandler** - Real-time communication
5. **DeviceSyncOrchestrator** - Main coordinator

## Architecture

```
┌─────────────────────────────────────────────────────┐
│          Application Layer (Your Code)              │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│     DeviceSyncOrchestrator (Coordinates Everything) │
└┬──────────────┬──────────────┬──────────────────────┘
 │              │              │
 ▼              ▼              ▼
DeviceManager  Presence        WebSocket
(Tracking)     Manager         Handler
               (Activity)      (Real-time)
 │              │              │
 └──────────────┼──────────────┘
                │
        ┌───────▼────────┐
        │ StateStore     │
        │ (Pub/Sub)      │
        └────────────────┘
```

## Installation/Loading

### In HTML:

```html
<!-- Week 19-20 (Offline-First) -->
<script src="sync-indexeddb.js"></script>
<script src="sync-queue.js"></script>
<script src="sync-conflict-resolver.js"></script>
<script src="sync-manager.js"></script>

<!-- Week 21-22 (Multi-Device) -->
<script src="device-state-store.js"></script>
<script src="device-manager.js"></script>
<script src="presence-manager.js"></script>
<script src="websocket-handler.js"></script>
<script src="device-sync-orchestrator.js"></script>
```

## Quick Start

### 1. Initialize Orchestrator

```javascript
// Initialize (without WebSocket - local only)
const orchestrator = await getDeviceSyncOrchestrator().init({
  userId: "user_123",
  deviceName: "My Computer",
  syncInterval: 5000,
});

// OR with WebSocket for real-time
const orchestrator = await getDeviceSyncOrchestrator().init({
  userId: "user_123",
  deviceName: "My Computer",
  wsUrl: "wss://your-backend.com/ws/sync",
  syncInterval: 5000,
});
```

### 2. Subscribe to Events

```javascript
const unsubscribe = orchestrator.subscribe("device-updated", (device) => {
  console.log("Device updated:", device);
});

// Listen to all events
orchestrator.subscribeAll(({ eventType, data }) => {
  console.log(`Event: ${eventType}`, data);
});
```

### 3. Get Current State

```javascript
// Current device
const device = orchestrator.getCurrentDevice();

// Online devices
const onlineDevices = await orchestrator.getOnlineDevices();

// Current presence
const presence = orchestrator.getCurrentPresence();

// State store
const store = orchestrator.getStateStore();
const state = store.getState();
```

## Components Deep Dive

### DeviceManager

Manages device registration and lifecycle.

```javascript
const manager = new DeviceManager("gradeflow-devices");
await manager.init();

// Register device
const device = await manager.registerDevice("user_123", {
  name: "Chrome on Windows",
  type: "desktop",
});

// Get online devices
const online = await manager.getOnlineDevices("user_123");

// Create session
const session = await manager.createSession(device.id);

// End session
await manager.endSession(session.id);

// Mark offline
await manager.markOffline(device.id);
```

**Key Methods:**

- `registerDevice()` - Register/get current device
- `getDevice()` - Get device by ID
- `getUserDevices()` - Get all devices for user
- `getOnlineDevices()` - Get devices seen in last 5 minutes
- `updateLastSeen()` - Update device timestamp
- `createSession()` - Create session record
- `getDeviceSessions()` - Get device session history

### DeviceStateStore

Centralized, reactive state management.

```javascript
const store = getDeviceStateStore();
await store.init();

// Set current device
store.setCurrentDevice(device);

// Update device
store.updateDevice(device);

// Update presence
store.updatePresence(deviceId, {
  status: "online",
  currentView: "classes",
});

// Add conflict
store.addConflict({
  entityType: "score",
  entityId: "score_123",
  version1: { value: 85, timestamp: 1000 },
  version2: { value: 90, timestamp: 2000 },
});

// Subscribe to specific events
store.subscribe("device-updated", (device) => {
  console.log("Device updated:", device);
});

// Listen to all events
store.subscribeAll(({ eventType, data }) => {
  console.log(`${eventType}:`, data);
});
```

**Events:**

- `current-device-changed`
- `device-updated`
- `device-removed`
- `presence-updated`
- `session-started`
- `session-ended`
- `conflict-detected`
- `conflict-resolved`
- `sync-stats-updated`
- `state-cleared`

### PresenceManager

Real-time activity tracking.

```javascript
const presence = new PresenceManager(deviceId, userId);
await presence.init();

// Set view
presence.setCurrentView("classes", { classId: "class_123" });

// Set viewing entity
presence.setCurrentEntity("class", "class_123");

// Mark as typing
presence.setTyping("input_field_123");

// Stop typing
presence.stopTyping();

// Set editing
presence.setEditing("class_123");

// Set idle
presence.setIdle();

// Select items
presence.selectItems(["item_1", "item_2"]);

// Get presence
const presenceData = presence.getPresence();

// Subscribe to updates
presence.subscribe("presence-updated", (p) => {
  console.log("Presence updated:", p);
});

// Go offline
presence.goOffline();

// Go online
presence.goOnline();

// Cleanup
presence.destroy();
```

**Presence Object:**

```javascript
{
  deviceId: 'device_123',
  userId: 'user_123',
  status: 'online',
  currentView: 'classes',
  currentEntity: { type: 'class', id: 'class_123' },
  typing: false,
  typingEntity: null,
  lastActivity: 1234567890,
  activityType: 'viewing', // idle, viewing, editing, typing
  cursorPosition: null,
  selectedItems: []
}
```

### WebSocketHandler

Real-time communication with fallback.

```javascript
const ws = new WebSocketHandler("wss://backend.com/ws/sync", {
  autoReconnect: true,
  maxReconnectDelay: 30000,
  fallbackToPoll: true,
  pollInterval: 5000,
});

// Connect
await ws.connect();

// Send message
await ws.send("device-update", {
  deviceId: "device_123",
  status: "online",
});

// Subscribe to channel
ws.subscribe("device-update", (data) => {
  console.log("Device update:", data);
});

// Send with acknowledgment
try {
  await ws.send("critical-update", data, { requireAck: true });
  console.log("Message acknowledged");
} catch (error) {
  console.log("Message timeout");
}

// Get status
const status = ws.getStatus();
console.log("Connected:", status.connected);
console.log("Queued messages:", status.queuedMessages);

// Disconnect
ws.disconnect();
```

**Features:**

- Automatic reconnection with exponential backoff
- Message queueing when offline
- Heartbeat mechanism
- Channel-based subscriptions
- Fallback to polling if WebSocket unavailable

### DeviceSyncOrchestrator

Main coordinator connecting everything.

```javascript
const orchestrator = new DeviceSyncOrchestrator({
  userId: "user_123",
  dbName: "gradeflow",
  wsUrl: "wss://backend.com/ws/sync",
  syncInterval: 5000,
});

await orchestrator.init();

// Subscribe to events
orchestrator.subscribe("sync-tick", (data) => {
  console.log("Sync happened, online devices:", data.onlineDevices);
});

// Broadcast sync operation
await orchestrator.broadcastSyncOperation({
  type: "insert",
  entity: "class",
  data: classData,
  timestamp: Date.now(),
});

// Report conflict
await orchestrator.reportConflict({
  entityType: "score",
  entityId: "score_123",
  version1: v1,
  version2: v2,
  reason: "Different values on different devices",
});

// Get online devices
const online = await orchestrator.getOnlineDevices();

// Get current device
const device = orchestrator.getCurrentDevice();

// Get status
const status = orchestrator.getStatus();

// Cleanup on page unload (automatic)
orchestrator.cleanup();
```

## Integration with Week 19-20

The multi-device system works alongside the offline-first system:

```javascript
// Initialize offline-first (Week 19-20)
const syncManager = new SyncManager("gradeflow", 1);
await syncManager.init();

// Initialize multi-device (Week 21-22)
const orchestrator = new DeviceSyncOrchestrator({
  userId: currentUserId,
  wsUrl: websocketUrl,
  syncInterval: 5000,
});
await orchestrator.init();

// When data changes locally
async function handleDataChange(entity, data) {
  // Queue for sync (Week 19-20)
  await syncManager.queueOperation({
    type: "insert",
    entity,
    data,
    timestamp: Date.now(),
  });

  // Broadcast to other devices (Week 21-22)
  await orchestrator.broadcastSyncOperation({
    type: "insert",
    entity,
    data,
    timestamp: Date.now(),
  });
}

// Listen to sync events (Week 19-20)
syncManager.subscribe("sync-complete", (result) => {
  console.log("Synced with Supabase:", result);
});

// Listen to device events (Week 21-22)
orchestrator.subscribe("remote-operation", (data) => {
  console.log("Another device made a change:", data);
  // Apply remote change locally
});
```

## Real-World Example: Classroom Editor

```javascript
// Initialize
const orchestrator = await getDeviceSyncOrchestrator().init({
  userId: userId,
  wsUrl: "wss://api.gradeflow.app/ws/sync",
});

// Show who's viewing this class
async function displayViewers(classId) {
  const onlineDevices = await orchestrator.getOnlineDevices();
  const store = orchestrator.getStateStore();

  const viewers = onlineDevices.map((device) => {
    const presence = store.getPresence(device.id);
    return {
      device: device.name,
      viewing: presence.currentEntity?.id === classId,
      typing: presence.typing,
    };
  });

  updateViewersList(viewers);
}

// Track user activity
const inputField = document.getElementById("class-name");
inputField.addEventListener("input", (e) => {
  const presence = orchestrator.getCurrentPresence();
  orchestrator.emitSyncEvent("activity-detected", {
    type: "typing",
    field: "class-name",
    value: e.target.value,
  });
});

// Listen for changes from other devices
orchestrator.subscribe("remote-operation", (data) => {
  const { operation, deviceId } = data;
  const otherDevice = orchestrator.getStateStore().getDevice(deviceId);

  console.log(`${otherDevice.name} made a change:`);
  console.log(operation);

  // Apply remote change
  applyRemoteChange(operation);
});

// Listen for conflicts
orchestrator.subscribe("conflict-detected", (conflict) => {
  console.log("Conflict detected:", conflict);
  showConflictResolutionDialog(conflict);
});
```

## Event Map

| Event                | Source           | Data      | Use Case                  |
| -------------------- | ---------------- | --------- | ------------------------- |
| `device-updated`     | StateStore       | device    | Display device status     |
| `presence-updated`   | StateStore       | presence  | Show who's typing/viewing |
| `conflict-detected`  | StateStore       | conflict  | Handle conflicts          |
| `sync-stats-updated` | StateStore       | stats     | Show sync progress        |
| `remote-operation`   | Orchestrator     | operation | Apply remote changes      |
| `sync-tick`          | Orchestrator     | data      | Periodic sync events      |
| `presence-heartbeat` | PresenceManager  | presence  | Keep-alive signal         |
| `connected`          | WebSocketHandler | null      | WebSocket connected       |
| `disconnected`       | WebSocketHandler | null      | WebSocket disconnected    |

## Best Practices

1. **Initialize Once**: Create orchestrator once per page/app
2. **Subscribe Early**: Set up subscriptions before data changes
3. **Handle Errors**: Always wrap operations in try/catch
4. **Clean Up**: Call `cleanup()` before page unload
5. **Test Offline**: WebSocket will fallback to polling automatically
6. **Monitor Status**: Check `getStatus()` periodically
7. **Merge Conflicts**: Handle conflicts before applying changes
8. **Update Presence**: Keep presence current with user activity

## Debugging

```javascript
// Get full status
console.log(orchestrator.getStatus());

// Check all devices
const devices = orchestrator.getStateStore().getState();
console.log("All devices:", devices);

// Check conflicts
const store = orchestrator.getStateStore();
console.log("Conflicts:", store.getConflicts());

// Check sync stats
console.log("Sync stats:", store.getSyncStats());

// Enable verbose logging
window.DEBUG_SYNC = true;
```

## Performance Considerations

- **Sync Interval**: 5000ms (5 seconds) is default, adjust based on needs
- **Message Queue**: Automatically batches offline messages
- **Presence Heartbeat**: 30 seconds default
- **Inactivity Timeout**: 5 minutes before marking as idle
- **WebSocket**: First fallback is polling every 5 seconds
- **Max Reconnect Delay**: 30 seconds

## Next Steps

1. Test locally with multiple browser tabs
2. Test with WebSocket backend
3. Integrate with UI components
4. Handle conflicts in UI
5. Add device management UI
6. Monitor performance in production

## Testing

See WEEK_21_22_TESTS.md for comprehensive test suite covering:

- Device registration
- Multi-device sync
- Presence broadcasting
- Conflict detection
- Connection handling
- Performance benchmarks
