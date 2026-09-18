/**
 * Socket events are delivered on a single user-scoped connection, so an event
 * raised for workspace ABC arrives while the UI may already be showing XYZ.
 * Anything that mutates workspace state must prove the event belongs to the
 * workspace on screen — an unattributed event proves nothing and is dropped.
 */
import { getWorkspaceId } from '../services/api';

export function eventWorkspaceId(payload) {
  const id = payload?.workspaceId ?? payload?.workspace_id;
  return id == null || id === '' ? null : String(id);
}

export function isEventForActiveWorkspace(payload, activeWorkspaceId) {
  const active = activeWorkspaceId === undefined ? getWorkspaceId() : activeWorkspaceId;
  const eventWs = eventWorkspaceId(payload);
  if (!active || !eventWs) return false;
  return eventWs === String(active);
}
