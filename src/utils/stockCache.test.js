/**
 * A Tally company GUID is unique only inside one workspace. Two workspaces that
 * sync the same Tally company would otherwise read each other's cached stock.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setWorkspaceId } from '../services/api';
import { stockCacheKey, readStockCache, writeStockCache, invalidateStockCache } from './stockCache';

const GUID = 'aaaaaaaa-1111-4111-8111-111111111111';
const FY = '2025-2026';

describe('stock cache key', () => {
  beforeEach(() => {
    localStorage.clear();
    setWorkspaceId(null);
  });

  it('includes the active workspace', () => {
    setWorkspaceId('ws-ABC');
    expect(stockCacheKey(GUID, FY)).toContain('ws-ABC');
  });

  it('gives two workspaces different keys for the same company and FY', () => {
    setWorkspaceId('ws-ABC');
    const abc = stockCacheKey(GUID, FY);
    setWorkspaceId('ws-XYZ');
    const xyz = stockCacheKey(GUID, FY);
    expect(abc).not.toBe(xyz);
  });

  it('does not serve one workspace the other workspace entry', () => {
    setWorkspaceId('ws-ABC');
    writeStockCache(GUID, FY, [{ name: 'ABC item' }]);
    setWorkspaceId('ws-XYZ');
    expect(readStockCache(GUID, FY)).toBeNull();

    writeStockCache(GUID, FY, [{ name: 'XYZ item' }]);
    expect(readStockCache(GUID, FY)).toEqual([{ name: 'XYZ item' }]);
    setWorkspaceId('ws-ABC');
    expect(readStockCache(GUID, FY)).toEqual([{ name: 'ABC item' }]);
  });

  it('still clears every workspace entry for a company on sync', () => {
    setWorkspaceId('ws-ABC');
    writeStockCache(GUID, FY, [{ name: 'ABC item' }]);
    setWorkspaceId('ws-XYZ');
    writeStockCache(GUID, FY, [{ name: 'XYZ item' }]);

    invalidateStockCache(GUID);

    expect(readStockCache(GUID, FY)).toBeNull();
    setWorkspaceId('ws-ABC');
    expect(readStockCache(GUID, FY)).toBeNull();
  });
});
