import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { StatGrid, Panel, DataTable, Pill, ModuleView, Empty, Skeleton, Button, Status, Card, useLabelT } from '../components/kit';
import { useFmt, VoucherDrawer, useVoucherSelection, BulkActionBar, voucherRowKey } from './shared';
import { useAuth } from '../contexts/AuthContext';
import api, { unwrapList, mapHomeMetricsToTab } from '../services/api';

const amountOf = row => Number(row?.amount ?? row?.total_amount ?? row?.totalAmount ?? 0) || 0;
const normalizeRows = response => unwrapList(response).map((row, index) => ({
  ...row,
  id: row.id ?? row.guid ?? `${row.voucher_number || row.voucherNumber || 'voucher'}-${index}`,
  date: row.date ?? row.voucher_date ?? row.voucherDate,
  voucher_number: row.voucher_number ?? row.voucherNumber ?? row.number ?? '—',
  voucher_type: row.voucher_type ?? row.voucherType,
  party_name: row.party_name ?? row.partyName ?? row.party ?? '—',
  amount: amountOf(row),
  is_cancelled: row.is_cancelled ?? row.isCancelled ?? false,
}));
const paramsFor = fy => ({ fromDate: fy?.startDate, toDate: fy?.endDate, pageSize: 500 });

function useLiveRows(loader) {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const load = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      setState({ rows: normalizeRows(await loader()), loading: false, error: '' });
    } catch (error) {
      setState({ rows: [], loading: false, error: error?.message || 'Unable to load records.' });
    }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { ...state, retry: load };
}

function LoadState({ loading, error, rows, retry, emptyMessage, children }) {
  const lt = useLabelT();
  if (loading) return <Panel><Skeleton rows={6} /></Panel>;
  if (error) return <Panel><Empty message="Could not load records" hint={error} /><div className="-mt-8 mb-8 flex justify-center"><Button onClick={retry}>{lt('Retry')}</Button></div></Panel>;
  if (!rows.length) return <Panel><Empty message={emptyMessage} hint="No records were returned for the selected financial year." /></Panel>;
  return children;
}

function LiveRegister({ rows, testid, numberLabel = 'Voucher No.' }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useState(null);
  const { selectedKeys, toggleRow, toggleAll, clear } = useVoucherSelection();
  return (
    <>
      <BulkActionBar rows={rows} selectedKeys={selectedKeys} onClear={clear} testid={`${testid}-bulk-bar`} />
      <DataTable testid={testid} rows={rows} onRowClick={setActive} selectable selectedKeys={selectedKeys} onToggleRow={toggleRow} onToggleAll={toggleAll} rowKey={voucherRowKey} searchKeys={['voucher_number', 'party_name', 'date']} columns={[
        { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
        { key: 'voucher_number', label: numberLabel, width: 130 },
        { key: 'party_name', label: 'Supplier' },
        { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
        { key: 'status', label: 'Status', width: 110, render: r => r.is_cancelled ? <Pill tone="neg">{lt('Cancelled')}</Pill> : r.status ? <Status value={r.status} /> : <Pill tone="pos">{lt('Synced')}</Pill> },
      ]} footer={visible => `${lt('Total')} ${money(visible.reduce((sum, row) => sum + row.amount, 0))}`} />
      <VoucherDrawer voucher={active} onClose={() => setActive(null)} />
    </>
  );
}

export function PurchaseKpis() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const guid = selectedCompany?.guid;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!guid) { setData(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    api.fetchPurchaseHomeMetrics(guid, selectedFY?.startDate, selectedFY?.endDate)
      .then(res => { if (alive) setData(mapHomeMetricsToTab(res?.data || res)); })
      .catch(err => { if (alive) { setData(null); setError(err?.message || 'Unable to load Purchase summary.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [guid, selectedFY?.startDate, selectedFY?.endDate, reloadKey]);

  const kpis = data?.kpis?.length ? data.kpis : [
    { id: 'today', label: 'Today', value: 0, format: 'currency' },
    { id: 'mtd', label: 'MTD', value: 0, format: 'currency' },
    { id: 'ytd', label: 'YTD', value: 0, format: 'currency' },
  ];
  const gridClass = kpis.length >= 5 ? 'xl:grid-cols-5' : kpis.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3';

  return (
    <div className="space-y-4 mb-6">
      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-neg/20 bg-neg-bg px-4 py-3 text-neg sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="purchase-summary-error">
          <span className="text-sm font-semibold">{lt(error)}</span>
          <Button variant="secondary" onClick={() => setReloadKey(k => k + 1)}>{lt('Retry')}</Button>
        </div>
      )}
      <Card className={`grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 ${gridClass}`} data-testid="purchase-kpi-strip">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="relative min-w-0 bg-surface px-6 py-5">
              <span className="mt-2.5 block h-5 w-14 animate-pulse rounded-md bg-cream" />
              <span className="mt-2 block h-8 w-24 animate-pulse rounded-md bg-cream" />
            </div>
          ))
        ) : kpis.map((kpi, i) => {
          const rising = Boolean(kpi.trend_positive);
          const tones = ['#B14435', '#181818', '#3963E4', '#BB7836', '#5B5B5B'];
          return (
            <div key={kpi.id || i} className="relative min-w-0 bg-surface px-6 py-5" data-testid={`purchase-kpi-${kpi.id || i}`}>
              <span className="absolute inset-y-5 left-3 w-1 rounded-full" style={{ background: tones[i % tones.length] }} />
              <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-ink-soft">{lt(kpi.label)}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="display block text-xl font-bold leading-none text-ink tabular tracking-tight">
                  {kpi.format === 'currency' ? mc(Number(kpi.value) || 0) : Number(kpi.value || 0).toLocaleString('en-IN')}
                </span>
                {kpi.trend_pct != null && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${rising ? 'bg-pos-bg text-pos' : 'bg-neg-bg text-neg'}`}>
                    {rising ? <ArrowUp size={10} strokeWidth={3} /> : <ArrowDown size={10} strokeWidth={3} />}
                    {Math.abs(kpi.trend_pct)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function PurchaseVoucherView({ title, sub, testid, tableTestid, emptyMessage, numberLabel, load }) {
  const data = useLiveRows(load);
  return <ModuleView title={title} sub={sub} testid={testid}><LoadState {...data} emptyMessage={emptyMessage}><LiveRegister rows={data.rows} testid={tableTestid} numberLabel={numberLabel} /></LoadState></ModuleView>;
}

export function PurchaseInvoices() {
  const { selectedCompany, selectedFY } = useAuth();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchPurchaseInvoices(selectedCompany.guid, paramsFor(selectedFY)) : Promise.resolve([]), [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  return <PurchaseVoucherView title="Purchase invoices" sub="Inward supply vouchers" testid="purchase-invoices-view" tableTestid="purchase-invoices-table" emptyMessage="No purchase invoices" load={loader} />;
}

export function PurchaseRegister() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [counts, setCounts] = useState(null);
  const loader = useCallback(async () => {
    if (!selectedCompany?.guid) return [];
    const range = { from: selectedFY?.startDate, to: selectedFY?.endDate };
    const [vouchers, countsRes] = await Promise.all([
      api.fetchPurchaseVouchers(selectedCompany.guid, { ...range, limit: 500 }),
      api.fetchPurchaseVoucherCounts(selectedCompany.guid, range).catch(() => null),
    ]);
    setCounts(countsRes?.data || countsRes || null);
    return vouchers;
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  const data = useLiveRows(loader);
  const { selectedKeys, toggleRow, toggleAll, clear } = useVoucherSelection();
  const countEntries = counts && typeof counts === 'object'
    ? Object.entries(counts).filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    : [];
  return (
    <ModuleView title="Purchase register" sub="Inward vouchers — same as mobile /api/purchase/vouchers" testid="purchase-register-view">
      {countEntries.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" data-testid="purchase-register-counts">
          {countEntries.map(([key, value]) => (
            <Pill key={key} tone="neutral">{lt(key)}: {value}</Pill>
          ))}
        </div>
      )}
      <LoadState {...data} emptyMessage="No purchase register entries">
        <Panel>
        <BulkActionBar rows={data.rows} selectedKeys={selectedKeys} onClear={clear} testid="purchase-register-bulk-bar" />
        <DataTable testid="purchase-register-table" rows={data.rows} selectable selectedKeys={selectedKeys} onToggleRow={toggleRow} onToggleAll={toggleAll} rowKey={voucherRowKey} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) },
          { key: 'voucher_number', label: 'Voucher' },
          { key: 'party_name', label: 'Supplier' },
          { key: 'voucher_type', label: 'Type', render: r => <Pill tone="warn">{r.voucher_type || '—'}</Pill> },
          { key: 'amount', label: 'Total', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
        ]} footer={visible => `${lt('Gross')} ${money(visible.reduce((sum, row) => sum + row.amount, 0))}`} /></Panel>
      </LoadState>
    </ModuleView>
  );
}

export function PurchaseOrders() {
  const { selectedCompany, selectedFY } = useAuth();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchPurchaseOrders(selectedCompany.guid, paramsFor(selectedFY)) : Promise.resolve([]), [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  return <PurchaseVoucherView title="Purchase orders" sub="Orders placed with suppliers" testid="purchase-orders-view" tableTestid="purchase-orders-table" emptyMessage="No purchase orders" numberLabel="Order No." load={loader} />;
}

export function DebitNotes() {
  const { selectedCompany, selectedFY } = useAuth();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchDebitNotes(selectedCompany.guid, paramsFor(selectedFY)) : Promise.resolve([]), [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  return <PurchaseVoucherView title="Debit notes" sub="Purchase returns and supplier adjustments" testid="debit-notes-view" tableTestid="debit-notes-table" emptyMessage="No debit notes" numberLabel="Note No." load={loader} />;
}