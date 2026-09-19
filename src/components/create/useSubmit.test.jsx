import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmit } from './common.jsx';

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ pairingStatus: 'CONNECTED', selectedCompany: { guid: 'R', is_demo: false } }),
}));
vi.mock('../kit', () => ({
  useLabelT: () => (s) => s,
  Field: () => null,
  Input: () => null,
  Select: () => null,
  Button: () => null,
  Toggle: () => null,
}));

describe('useSubmit single-flight', () => {
  it('runs the mutation only once when called twice before it settles', async () => {
    const { result } = renderHook(() => useSubmit());
    let resolve;
    const fn = vi.fn(() => new Promise((r) => { resolve = r; }));

    let first;
    let second;
    await act(async () => {
      first = result.current.run(fn);
      second = result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ success: true, tdkReferenceNo: 'TD1' });
      await first;
      await second;
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
