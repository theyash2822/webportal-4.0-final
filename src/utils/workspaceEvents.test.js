/**
 * Socket events arrive on one user-scoped connection. Applying an event raised
 * for workspace ABC while XYZ is on screen is how pairing state bled across
 * workspaces, so the guard is pinned here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkspaceId } from '../services/api';
import { eventWorkspaceId, isEventForActiveWorkspace } from './workspaceEvents';

describe('workspace-scoped socket events', () => {
  beforeEach(() => {
    setWorkspaceId('ws-ABC');
  });

  it('ignores an event raised for a different workspace', () => {
    expect(isEventForActiveWorkspace({ status: 'CONNECTED', workspaceId: 'ws-XYZ' })).toBe(false);
  });

  it('accepts an event raised for the active workspace', () => {
    expect(isEventForActiveWorkspace({ status: 'CONNECTED', workspaceId: 'ws-ABC' })).toBe(true);
    expect(isEventForActiveWorkspace({ status: 'CONNECTED', workspace_id: 'ws-ABC' })).toBe(true);
  });

  it('ignores an event that names no workspace', () => {
    expect(isEventForActiveWorkspace({ status: 'CONNECTED' })).toBe(false);
    expect(isEventForActiveWorkspace({ status: 'CONNECTED', workspaceId: null })).toBe(false);
    expect(isEventForActiveWorkspace({ status: 'CONNECTED', workspaceId: '' })).toBe(false);
    expect(isEventForActiveWorkspace(undefined)).toBe(false);
  });

  it('ignores every event while no workspace is selected', () => {
    setWorkspaceId(null);
    expect(isEventForActiveWorkspace({ workspaceId: 'ws-ABC' })).toBe(false);
  });

  it('can be pointed at an explicit workspace id', () => {
    expect(isEventForActiveWorkspace({ workspaceId: 'ws-XYZ' }, 'ws-XYZ')).toBe(true);
    expect(isEventForActiveWorkspace({ workspaceId: 'ws-ABC' }, 'ws-XYZ')).toBe(false);
  });

  it('reads the workspace id under either casing', () => {
    expect(eventWorkspaceId({ workspaceId: 'a' })).toBe('a');
    expect(eventWorkspaceId({ workspace_id: 'b' })).toBe('b');
    expect(eventWorkspaceId({})).toBeNull();
  });
});
