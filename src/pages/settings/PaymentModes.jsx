/**
 * Payment mode → supporting ledger map (MD §22).
 * Lets Collection Agent post Receipts without full bank ledger access.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, Button, Input, useLabelT } from '../../components/kit';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import api from '../../services/api';

const DEFAULT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];

function unwrap(res) {
  return res?.data ?? res;
}

export function SettingsPaymentModes() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const { currentWorkspace, can } = useWorkspace();
  const [rows, setRows] = useState(DEFAULT_MODES.map((m) => ({ paymentMode: m, ledgerGuid: '', ledgerName: '' })));
  const [banks, setBanks] = useState([]);
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });
  const wsId = currentWorkspace?.id;
  const guid = selectedCompany?.guid;
  const canEdit = can('workspace.settings.manage') || can('workspace.settings.view');

  const load = useCallback(async () => {
    if (!wsId || !guid) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [mapRes, bankRes] = await Promise.all([
        api.fetchPaymentModeMap(wsId, guid).catch(() => ({ data: [] })),
        api.fetchBankLedgers(guid, 'all').catch(() => ({ data: [] })),
      ]);
      const mapped = unwrap(mapRes);
      const list = Array.isArray(mapped) ? mapped : (mapped?.mappings || mapped?.map || []);
      const byMode = Object.fromEntries((list || []).map((r) => [r.payment_mode || r.paymentMode, r]));
      setRows(DEFAULT_MODES.map((m) => {
        const hit = byMode[m];
        return {
          paymentMode: m,
          ledgerGuid: hit?.ledger_guid || hit?.ledgerGuid || '',
          ledgerName: hit?.ledger_name || hit?.ledgerName || '',
        };
      }));
      const bankList = unwrap(bankRes);
      const arr = Array.isArray(bankList) ? bankList : (bankList?.ledgers || bankList?.banks || []);
      setBanks(arr);
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [wsId, guid]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!can('workspace.settings.manage')) {
      setState((s) => ({ ...s, error: lt('Not allowed. Ask your Workspace administrator.') }));
      return;
    }
    setState((s) => ({ ...s, saving: true, error: '', message: '' }));
    try {
      await api.putPaymentModeMap(wsId, guid, {
        mappings: rows.map((r) => ({
          paymentMode: r.paymentMode,
          ledgerGuid: r.ledgerGuid || null,
          ledgerName: r.ledgerName || null,
        })),
      });
      setState((s) => ({ ...s, saving: false, message: lt('Payment mode map saved.') }));
    } catch (err) {
      setState((s) => ({ ...s, saving: false, error: err?.data?.error?.message || err.message }));
    }
  };

  if (!guid) {
    return (
      <div className="space-y-4" data-testid="settings-payment-modes">
        <h2 className="text-base font-semibold text-ink">{lt('Payment modes')}</h2>
        <Card className="p-5"><p className="text-sm text-ink-soft">{lt('Select a company first.')}</p></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="settings-payment-modes">
      <div>
        <h2 className="text-base font-semibold text-ink">{lt('Payment modes')}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {lt('Map Cash / UPI / Bank Transfer / Cheque to supporting ledgers for')} {selectedCompany?.name}
        </p>
      </div>
      {state.error && <p className="text-sm font-medium text-alert">{state.error}</p>}
      {state.message && <p className="text-sm font-medium text-emerald-700">{state.message}</p>}
      {state.loading ? <p className="text-sm text-ink-soft">{lt('Loading…')}</p> : (
        <Card className="space-y-4 p-5">
          {rows.map((r, idx) => (
            <div key={r.paymentMode} className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <p className="pt-3 text-sm font-semibold text-ink">{r.paymentMode}</p>
              <div className="space-y-2">
                <select
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                  value={r.ledgerGuid}
                  disabled={!can('workspace.settings.manage')}
                  onChange={(e) => {
                    const g = e.target.value;
                    const hit = banks.find((b) => (b.guid || b.ledger_guid) === g);
                    setRows((prev) => prev.map((row, i) => (i === idx ? {
                      ...row,
                      ledgerGuid: g,
                      ledgerName: hit?.name || hit?.ledger_name || row.ledgerName,
                    } : row)));
                  }}
                >
                  <option value="">{lt('— Select ledger —')}</option>
                  {banks.map((b) => {
                    const id = b.guid || b.ledger_guid;
                    return <option key={id} value={id}>{b.name || b.ledger_name || id}</option>;
                  })}
                </select>
                <Input
                  placeholder={lt('Or ledger name')}
                  value={r.ledgerName}
                  disabled={!can('workspace.settings.manage')}
                  onChange={(e) => setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ledgerName: e.target.value } : row)))}
                />
              </div>
            </div>
          ))}
          {can('workspace.settings.manage') && (
            <Button variant="primary" disabled={state.saving || !canEdit} onClick={save}>
              {state.saving ? lt('Saving…') : lt('Save mapping')}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

export default SettingsPaymentModes;
