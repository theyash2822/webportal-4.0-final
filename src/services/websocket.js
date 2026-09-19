// WebSocket Service — mirrors mobile app's websocketService.js
// Events: synced, unpaired, logout, connect, disconnect
// Production: never log business/event payloads.

import { io } from 'socket.io-client';
import { WS_URL } from './api';
import { getAuthToken } from '../utils/authStorage';

const NATIVE_EVENTS = [
  'synced', 'paired', 'unpaired', 'tally_connection', 'logout',
  'voucher:tallySynced', 'workspace_access_denied', 'workspace_registered',
  'invitation', 'membership_changed', 'membership_revoked', 'access_revoked',
  'hard_sync_request', 'hard_sync_status', 'restore_request', 'restore_status',
  'billing_updated', 'workspace_audit', 'invitation_received',
];

function wsLog(event, extra) {
  if (!import.meta.env.DEV) return;
  if (extra) console.info(`[WS] ${event}`, extra);
  else console.info(`[WS] ${event}`);
}

class WebSocketService {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this._workspaceId = null;
    this._bound = false;
  }

  connect(token) {
    if (this.socket?.connected) return;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this._bound = false;
    }

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      wsLog('connected');
      this.socket.emit('register', { token, type: 'web' });
    });

    this.socket.on('reconnect', () => {
      const t = getAuthToken();
      if (t) this.socket.emit('register', { token: t, type: 'web' });
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WS] connect_error', err?.message || 'failed');
    });

    this.socket.on('disconnect', (reason) => {
      wsLog('disconnected', reason);
      this._emit('disconnect', { reason });
    });

    NATIVE_EVENTS.forEach((evt) => {
      this.socket.on(evt, (data) => {
        wsLog(evt);
        this._emit(evt, data);
      });
    });
    this._bound = true;
  }

  /**
   * Join workspace:<id> (+ authorized company rooms).
   * Server leaves the previous workspace room on register; we also emit leave for clarity.
   */
  registerWorkspace(workspaceId) {
    if (!this.socket?.connected || !workspaceId) return;
    if (this._workspaceId && this._workspaceId !== workspaceId) {
      this.socket.emit('workspace:leave', { workspaceId: this._workspaceId });
    }
    this._workspaceId = workspaceId;
    this.socket.emit('workspace:register', { workspaceId });
  }

  leaveWorkspace(workspaceId) {
    const id = workspaceId || this._workspaceId;
    if (!this.socket?.connected || !id) return;
    this.socket.emit('workspace:leave', { workspaceId: id });
    if (this._workspaceId === id) this._workspaceId = null;
  }

  registerCompany(companyGuid) {
    if (!this.socket?.connected || !companyGuid) return;
    this.socket.emit('company:register', { companyGuid });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this._bound = false;
    }
    this._workspaceId = null;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  _emit(event, data) {
    this.handlers.get(event)?.forEach(h => h(data));
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

const wsService = new WebSocketService();
export default wsService;
