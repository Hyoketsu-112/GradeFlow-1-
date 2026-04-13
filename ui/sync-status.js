/**
 * 🔄 Sync Status UI Component
 * 
 * Displays sync status in UI:
 * - Synced (green checkmark)
 * - Syncing (blue spinner)
 * - Offline (yellow warning)
 * - Error (red X)
 * - Pending count
 * 
 * Usage:
 *   const statusUI = new SyncStatusUI('sync-indicator-id', syncEngine);
 *   statusUI.initialize();
 */

class SyncStatusUI {
  constructor(elementId, syncEngine) {
    this.element = document.getElementById(elementId);
    this.syncEngine = syncEngine;
    
    if (!this.element) {
      console.warn(`Sync status element #${elementId} not found`);
      return;
    }
    
    this.currentStatus = 'ready';
    this.currentMessage = '';
    this.pendingCount = 0;
  }
  
  /**
   * Initialize - Listen to sync engine events
   */
  initialize() {
    if (!this.element) return;
    
    // Listen to sync engine status changes
    this.syncEngine.on('onStatusChange', (data) => this.updateStatus(data));
    this.syncEngine.on('onSyncStart', (data) => this.showSyncing(data));
    this.syncEngine.on('onSyncEnd', (data) => this.showSyncComplete(data));
    this.syncEngine.on('onError', (data) => this.showError(data));
    this.syncEngine.on('onConflict', (data) => this.showConflict(data));
    
    // Create UI element
    this.render();
    
    console.log('✓ Sync Status UI initialized');
  }
  
  /**
   * UPDATE STATUS - Generic status update
   */
  updateStatus(data) {
    this.currentStatus = data.status;
    this.currentMessage = data.message || '';
    this.pendingCount = data.pendingCount || 0;
    
    this.render();
  }
  
  /**
   * SHOW SYNCING - Display while sync in progress
   */
  showSyncing(data) {
    this.currentStatus = 'syncing';
    this.currentMessage = `Syncing ${data.pendingCount} change${data.pendingCount !== 1 ? 's' : ''}...`;
    this.pendingCount = data.pendingCount;
    
    this.render();
  }
  
  /**
   * SHOW SYNC COMPLETE - Display after successful sync
   */
  showSyncComplete(data) {
    if (data.failedCount > 0) {
      this.currentStatus = 'partial';
      this.currentMessage = `${data.syncedCount} synced, ${data.failedCount} failed`;
    } else {
      this.currentStatus = 'synced';
      this.currentMessage = data.syncedCount > 0 
        ? `${data.syncedCount} change${data.syncedCount !== 1 ? 's' : ''} synced`
        : 'All synced';
    }
    
    this.pendingCount = data.totalPending;
    
    this.render();
    
    // Auto-hide success message after 3 seconds
    if (this.currentStatus === 'synced') {
      setTimeout(() => {
        this.currentMessage = '';
        this.render();
      }, 3000);
    }
  }
  
  /**
   * SHOW ERROR - Display sync error
   */
  showError(data) {
    this.currentStatus = 'error';
    this.currentMessage = `Sync error: ${data.error?.message || 'Unknown error'}`;
    
    this.render();
  }
  
  /**
   * SHOW CONFLICT - Display conflict resolution
   */
  showConflict(data) {
    this.currentStatus = 'conflict';
    this.currentMessage = `Conflict in ${data.table}, applying remote version`;
    
    this.render();
    
    // Clear message after 5 seconds
    setTimeout(() => {
      this.currentMessage = '';
      this.currentStatus = 'synced';
      this.render();
    }, 5000);
  }
  
  /**
   * RENDER - Update DOM
   */
  render() {
    if (!this.element) return;
    
    const icon = this.getIcon();
    const color = this.getColor();
    const text = this.getText();
    
    this.element.innerHTML = `
      <div class="sync-status ${this.currentStatus}" style="color: ${color};">
        <span class="sync-icon">${icon}</span>
        <span class="sync-text">${text}</span>
        ${this.pendingCount > 0 ? `<span class="sync-badge">${this.pendingCount}</span>` : ''}
      </div>
    `;
    
    // Add styles if not already present
    this.ensureStyles();
  }
  
  /**
   * GET ICON - Status icon
   */
  getIcon() {
    switch (this.currentStatus) {
      case 'synced':
        return '✓';
      case 'syncing':
        return '⟳';
      case 'offline':
        return '⚠';
      case 'error':
      case 'partial':
        return '✗';
      case 'conflict':
        return '↔';
      case 'ready':
      default:
        return '○';
    }
  }
  
  /**
   * GET COLOR - Status color
   */
  getColor() {
    switch (this.currentStatus) {
      case 'synced':
        return '#22c55e';  // Green
      case 'syncing':
        return '#3b82f6';  // Blue
      case 'offline':
        return '#f59e0b';  // Amber
      case 'error':
        return '#ef4444';  // Red
      case 'partial':
        return '#f97316';  // Orange
      case 'conflict':
        return '#8b5cf6';  // Purple
      case 'ready':
      default:
        return '#9ca3af';  // Gray
    }
  }
  
  /**
   * GET TEXT - Status text
   */
  getText() {
    if (this.currentMessage) {
      return this.currentMessage;
    }
    
    switch (this.currentStatus) {
      case 'synced':
        return 'Synced';
      case 'syncing':
        return 'Syncing...';
      case 'offline':
        return 'Offline mode';
      case 'error':
        return 'Sync error';
      case 'partial':
        return 'Partial sync';
      case 'conflict':
        return 'Resolving conflict...';
      case 'ready':
      default:
        return 'Ready';
    }
  }
  
  /**
   * ENSURE STYLES - Add CSS if needed
   */
  ensureStyles() {
    if (document.getElementById('sync-status-styles')) {
      return; // Already added
    }
    
    const style = document.createElement('style');
    style.id = 'sync-status-styles';
    style.textContent = `
      .sync-status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        user-select: none;
        transition: all 0.3s ease;
      }
      
      .sync-status.syncing .sync-icon {
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .sync-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        background: currentColor;
        color: white;
        border-radius: 50%;
        font-size: 10px;
        font-weight: bold;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * SHOW NOTIFICATION - Toast-like notification
   */
  showNotification(message, type = 'info', duration = 3000) {
    const notifEl = document.createElement('div');
    notifEl.className = `sync-notification sync-notification-${type}`;
    notifEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notifEl.textContent = message;
    
    document.body.appendChild(notifEl);
    
    setTimeout(() => {
      notifEl.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notifEl.remove(), 300);
    }, duration);
  }
  
  /**
   * GET STATUS - Current status info
   */
  getStatus() {
    return {
      status: this.currentStatus,
      message: this.currentMessage,
      pendingCount: this.pendingCount
    };
  }
  
  /**
   * DESTROY - Cleanup
   */
  destroy() {
    if (this.element) {
      this.element.innerHTML = '';
    }
  }
}

/**
 * OFFLINE INDICATOR - Simple online/offline badge
 */
class OfflineIndicator {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.isOnline = navigator.onLine;
    
    if (!this.element) {
      console.warn(`Offline indicator element #${elementId} not found`);
      return;
    }
  }
  
  initialize() {
    if (!this.element) return;
    
    window.addEventListener('online', () => this.setOnline());
    window.addEventListener('offline', () => this.setOffline());
    
    this.render();
    console.log('✓ Offline indicator initialized');
  }
  
  setOnline() {
    this.isOnline = true;
    this.render();
  }
  
  setOffline() {
    this.isOnline = false;
    this.render();
  }
  
  render() {
    if (!this.element) return;
    
    this.element.innerHTML = `
      <div class="offline-indicator ${this.isOnline ? 'online' : 'offline'}">
        <span class="status-dot"></span>
        <span class="status-text">${this.isOnline ? 'Online' : 'Offline'}</span>
      </div>
    `;
    
    this.ensureStyles();
  }
  
  ensureStyles() {
    if (document.getElementById('offline-indicator-styles')) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = 'offline-indicator-styles';
    style.textContent = `
      .offline-indicator {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }
      
      .offline-indicator.online {
        color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
      }
      
      .offline-indicator.offline {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }
      
      .status-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
    `;
    document.head.appendChild(style);
  }
  
  destroy() {
    if (this.element) {
      this.element.innerHTML = '';
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SyncStatusUI, OfflineIndicator };
}
