// WebSocket Service — mirrors mobile app's websocketService.js
// Events: synced, unpaired, logout, connect, disconnect

import { io } from 'socket.io-client';
import { WS_URL } from './api';
import { getAuthToken } from '../utils/authStorage';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
  }

  connect(token) {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.info('[WS] connected', this.socket.id);
      // Register as web client (same as mobile's 'register' event)
      this.socket.emit('register', { token, type: 'web' });
    });

    this.socket.on('reconnect', () => {
      const t = getAuthToken();
      if (t) this.socket.emit('register', { token: t, type: 'web' });
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WS] connect_error', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.info('[WS] disconnected', reason);
      this._emit('disconnect', { reason });
    });

    // ── Key events (same as mobile) ────────────────────────────────────────
    this.socket.on('synced', (data) => {
      console.info('[WS] synced', data);
      this._emit('synced', data);
    });

    // Mobile paired with desktop — web portal needs to update its paired state
    this.socket.on('paired', (data) => {
      console.info('[WS] paired', data);
      this._emit('paired', data);
    });

    this.socket.on('unpaired', (data) => {
      console.warn('[WS] unpaired', data);
      this._emit('unpaired', data);
    });

    this.socket.on('tally_connection', (data) => {
      console.info('[WS] tally_connection', data);
      this._emit('tally_connection', data);
    });

    this.socket.on('logout', (data) => {
      console.warn('[WS] logout', data);
      this._emit('logout', data);
    });

    this.socket.on('voucher:tallySynced', (data) => {
      console.info('[WS] voucher:tallySynced', data);
      this._emit('voucher:tallySynced', data);
    });

    this.socket.on('workspace_access_denied', (data) => {
      console.warn('[WS] workspace_access_denied', data);
      this._emit('workspace_access_denied', data);
    });

    this.socket.on('workspace_registered', (data) => {
      this._emit('workspace_registered', data);
    });

    // MD §39 — invitations / membership / hard-sync / restore / billing refresh
    ['invitation', 'membership_changed', 'membership_revoked', 'access_revoked',
      'hard_sync_request', 'hard_sync_status', 'restore_request', 'restore_status', 'billing_updated',
      'workspace_audit', 'invitation_received'].forEach((evt) => {
      this.socket.on(evt, (data) => {
        console.info(`[WS] ${evt}`, data);
        this._emit(evt, data);
      });
    });
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
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Subscribe to events
  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler); // returns unsubscribe fn
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
