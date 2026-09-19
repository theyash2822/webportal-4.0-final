import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import api, {
  setWriteAsDemo,
  getWriteAsDemo,
  resolveWriteTarget,
  setWorkspaceId,
} from './api';
import { setAuthToken, setRefreshToken, clearAuthToken } from '../utils/authStorage';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  localStorage.clear();
  clearAuthToken();
  setWriteAsDemo(false);
  setWorkspaceId('ws-ABC');
  setAuthToken('access-1');
  setRefreshToken('refresh-1');
});

afterEach(() => {
  setWriteAsDemo(false);
  vi.unstubAllGlobals();
});

describe('Demo write target', () => {
  it('routes Demo creates to /api/demo/entries and never /tally', async () => {
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/tally/')) {
        return jsonResponse(500, { success: false, error: { message: 'tally must not be called' } });
      }
      return jsonResponse(201, { success: true, data: { id: 1, status: 'DEMO_SIMULATED' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    setWriteAsDemo(true);

    const res = await api.createSalesInvoice({ partyName: 'Practice', total: 10 });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('/api/demo/entries'))).toBe(true);
    expect(urls.some((u) => u.includes('/tally/'))).toBe(false);
  });

  it('keeps real-company creates on /tally', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, tdkReferenceNo: 'TD1' }));
    vi.stubGlobal('fetch', fetchMock);
    setWriteAsDemo(false);
    await api.createSalesInvoice({ partyName: 'Acme' });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/tally\/voucher\/sales/);
  });

  it('resolveWriteTarget is demo-only when type is supported', () => {
    expect(resolveWriteTarget(true, '/tally/voucher/sales', 'sales_invoice').demo).toBe(true);
    expect(resolveWriteTarget(false, '/tally/voucher/sales', 'sales_invoice').demo).toBe(false);
    expect(getWriteAsDemo()).toBe(false);
  });
});

describe('stock create payload', () => {
  it('sends the entered HSN and GST rates', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.hsnCode).toBe('8471');
      expect(body.igstRate).toBe(18);
      return jsonResponse(200, { success: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    await api.createStockItemInTally({
      name: 'Laptop',
      unit: 'Nos',
      hsnCode: '8471',
      igstRate: 18,
      cgstRate: 9,
      sgstRate: 9,
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
