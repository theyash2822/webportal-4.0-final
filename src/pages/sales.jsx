import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Pill, Panel, DataTable, TableFilter, Status, ModuleView, Empty, Skeleton, Button, useLabelT } from '../components/kit';
import { useFmt, RecordDrawer, VoucherDrawer, useVoucherSelection, BulkActionBar, voucherRowKey } from './shared';
import { useAuth } from '../contexts/AuthContext';
import api, { unwrapList } from '../services/api';
import { useSalesContext, SalesProvider } from '../contexts/SalesContext';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarIcon, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { useLocation } from 'react-router-dom';
import ModuleLayout, { SALES_TABS } from '../layouts/ModuleLayout';

const amountOf = row => Number(row?.amount ?? row?.total_amount ?? row?.totalAmount ?? 0) || 0;
const normalizeRows = response => unwrapList(response).map((row, index) => ({
  ...row,
  guid: row.guid ?? row.voucher_guid ?? row.voucherGuid,
  id: row.guid ?? row.voucher_guid ?? row.voucherGuid ?? row.id ?? `${row.voucher_number || row.voucherNumber || 'voucher'}-${index}`,
  date: row.date ?? row.voucher_date ?? row.voucherDate,
  voucher_number: row.voucher_number ?? row.voucherNumber ?? row.number ?? '—',
  voucher_type: row.voucher_type ?? row.voucherType,
  party_name: row.party_name ?? row.partyName ?? row.party ?? '—',
  amount: amountOf(row),
  is_cancelled: row.is_cancelled ?? row.isCancelled ?? false,
}));

function useLiveRows(loader) {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const rows = normalizeRows(await loader());
      if (activeRequest === requestId.current) {
        setState({ rows, loading: false, error: '' });
      }
    } catch (error) {
      if (activeRequest === requestId.current) {
        setState({ rows: [], loading: false, error: error?.message || 'Unable to load records.' });
      }
    }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { ...state, retry: load };
}

function requestParams(dateRange) {
  return { fromDate: dateRange?.from, toDate: dateRange?.to, pageSize: 500 };
}

function LoadState({ loading, error, rows, retry, emptyMessage, children }) {
  const lt = useLabelT();
  if (loading) return <Panel><Skeleton rows={6} /></Panel>;
  if (error) return (
    <Panel>
      <Empty message="Could not load records" hint={error} />
      <div className="-mt-8 mb-8 flex justify-center"><Button onClick={retry}>{lt('Retry')}</Button></div>
    </Panel>
  );
  return children;
}

function LiveVoucherRegister({ rows, testid, numberLabel = 'Voucher No.', statusMode = 'document' }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useState(null);
  const [statusFilter, setStatusFilter] = useState([]);
  const { selectedKeys, toggleRow, toggleAll, clear } = useVoucherSelection();
  const rowStatus = row => statusMode === 'payment'
    ? String(row.payment_status || (Math.abs(Number(row.outstanding_amount) || 0) > 0.005 ? 'unpaid' : 'paid')).toLowerCase()
    : String(row.status || '').toLowerCase();
  const statusValues = statusMode === 'payment'
    ? ['paid', 'unpaid']
    : [...new Set(rows.map(rowStatus).filter(Boolean))];
  const filteredRows = statusFilter.length === 0
    ? rows
    : rows.filter(row => statusFilter.includes(rowStatus(row)));
  const statusOptions = [
    { value: 'all', label: 'All', count: rows.length },
    ...statusValues.map(value => ({
      value,
      label: value.replace(/(^|[-_ ])\w/g, match => match.toUpperCase()).replace(/[-_]/g, ' '),
      count: rows.filter(row => rowStatus(row) === value).length,
    })),
  ];
  return (
    <>
      <DataTable
        testid={testid}
        rows={filteredRows}
        onRowClick={setActive}
        selectable
        selectedKeys={selectedKeys}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        rowKey={voucherRowKey}
        searchKeys={['voucher_number', 'party_name', 'date']}
        toolbar={<TableFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} testid={`${testid}-status-filter`} />}
        bottomOverlay={<BulkActionBar rows={filteredRows} selectedKeys={selectedKeys} onClear={clear} onToggleAll={toggleAll} testid={`${testid}-bulk-bar`} />}
        columns={[
          { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
          { key: 'voucher_number', label: numberLabel, width: 130 },
          { key: 'party_name', label: 'Party' },
          { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
          { key: 'status', label: 'Status', width: 110, render: r => statusMode === 'payment'
            ? <Pill tone={rowStatus(r) === 'paid' ? 'pos' : 'neg'}>{lt(rowStatus(r) === 'paid' ? 'Paid' : 'Unpaid')}</Pill>
            : r.status ? <Status value={r.status} /> : '—' },
        ]}
        footer={visible => `${lt('Total')} ${money(visible.reduce((sum, row) => sum + amountOf(row), 0))}`}
      />
      <VoucherDrawer voucher={active} onClose={() => setActive(null)} />
    </>
  );
}

function SalesActions() {
  const { dateRange, setRange, openIrnGenerator, alerts } = useSalesContext();
  const { selectedFY } = useAuth();
  const lt = useLabelT();
  const location = useLocation();
  const hasIrnBlockers = alerts.some(alert => ['EINVOICE_MISSING_GSTIN', 'EINVOICE_MISSING_PLACE'].includes(alert.type));

  const presets = [
    { label: 'Today', get: () => [format(new Date(), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd')] },
    { label: 'Last 7 Days', get: () => [format(subDays(new Date(), 6), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd')] },
    { label: 'Last 30 Days', get: () => [format(subDays(new Date(), 29), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd')] },
    { label: 'This Month', get: () => [format(startOfMonth(new Date()), 'yyyy-MM-dd'), format(endOfMonth(new Date()), 'yyyy-MM-dd')] },
    { label: 'This FY', get: () => [selectedFY?.startDate, selectedFY?.endDate] },
  ];

  const [calOpen, setCalOpen] = useState(false);
  const [tempRange, setTempRange] = useState(null);

  const applyPreset = (p) => {
    const [from, to] = p.get();
    setRange(from, to, p.label);
    setCalOpen(false);
  };

  const handleApplyCustom = () => {
    if (tempRange?.from && tempRange?.to) {
      setRange(format(tempRange.from, 'yyyy-MM-dd'), format(tempRange.to, 'yyyy-MM-dd'), 'Custom');
    }
    setCalOpen(false);
  };

  const handleOpenChange = (open) => {
    setCalOpen(open);
    if (!open) {
      setTempRange(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Popover open={calOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="secondary" className="font-semibold" data-testid="sales-date-range">
            <CalendarIcon size={14} className="mr-1 text-ink-soft" />
            {lt(dateRange.preset === 'Custom' ? `${dateRange.from} to ${dateRange.to}` : dateRange.preset)}
            <ChevronDown size={14} className="ml-1 text-ink-faint" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="z-[200] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-xl">
          <div className="bg-surface">
            <div className="flex flex-wrap gap-1.5 border-b border-line bg-cream/40 p-3" aria-label={lt('Date range')}>
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${dateRange.preset === p.label ? 'border-ink bg-ink font-bold text-white' : 'border-line bg-surface font-semibold text-ink-soft hover:border-ink/30 hover:text-ink'}`}
                >
                  {lt(p.label)}
                </button>
              ))}
              <button
                onClick={() => { setTempRange({ from: dateRange.from ? parseISO(dateRange.from) : undefined, to: dateRange.to ? parseISO(dateRange.to) : undefined }); }}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${dateRange.preset === 'Custom' ? 'border-ink bg-ink font-bold text-white' : 'border-line bg-surface font-semibold text-ink-soft hover:border-ink/30 hover:text-ink'}`}
              >
                {lt('Custom')}
              </button>
            </div>
            <div className="overflow-x-auto px-3 pb-3 pt-2">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange.from ? parseISO(dateRange.from) : new Date()}
                selected={tempRange || { from: dateRange.from ? parseISO(dateRange.from) : undefined, to: dateRange.to ? parseISO(dateRange.to) : undefined }}
                onSelect={setTempRange}
                numberOfMonths={1}
              />
              <div className="mt-2 flex justify-end gap-2 border-t border-line px-1 pt-3">
                <Button variant="ghost" onClick={() => setCalOpen(false)}>{lt('Cancel')}</Button>
                <Button variant="primary" onClick={handleApplyCustom} disabled={!tempRange?.from || !tempRange?.to}>{lt('Apply')}</Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {location.pathname === '/sales/einvoice' && (
        <Button
          variant="primary"
          data-testid="sales-generate-irn"
          onClick={openIrnGenerator}
          disabled={hasIrnBlockers}
          title={hasIrnBlockers ? lt('Complete required details before generating IRN.') : undefined}
        >
          {lt('Generate IRN')}
        </Button>
      )}
    </div>
  );
}

export function SalesLayout() {
  return (
    <SalesProvider>
      <ModuleLayout title="Sales" tabs={SALES_TABS} Kpis={SalesKpis} Actions={SalesActions} />
    </SalesProvider>
  );
}

// Sleek 6-KPI strip matching the mobile Sales screen cards — same /sales/home-metrics source.
export function SalesKpis() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const { dateRange, setAlerts } = useSalesContext();
  const location = useLocation();

  const guid = selectedCompany?.guid;

  const activeTab = SALES_TABS.find(tab =>
    tab.to === '/sales' ? location.pathname === '/sales' : location.pathname.startsWith(tab.to)
  ) || SALES_TABS[0];
  const tabId = activeTab.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!guid) { setData(null); setAlerts([]); setError(''); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    setAlerts([]);
    api.fetchSalesTabMetrics(guid, tabId, dateRange?.from, dateRange?.to)
      .then(res => {
        if (alive) {
          setData(res?.data || null);
          setAlerts(res?.data?.alerts || []);
        }
      })
      .catch(err => {
        if (alive) {
          setData(null);
          setAlerts([]);
          setError(err?.message || 'Unable to load Sales summary.');
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [guid, tabId, dateRange?.from, dateRange?.to, reloadKey, setAlerts]);

  const kpis = data?.kpis || [];
  const gridClass = kpis.length >= 5 ? 'xl:grid-cols-5' : kpis.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3';

  return (
    <div className="space-y-4 mb-6">
      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-neg/20 bg-neg-bg px-4 py-3 text-neg sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid="sales-summary-error">
          <span className="text-sm font-semibold">{lt(error)}</span>
          <Button variant="secondary" onClick={() => setReloadKey(key => key + 1)}>{lt('Retry')}</Button>
        </div>
      )}

      {/* KPI Strip */}
      <Card className={`grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 ${gridClass}`} data-testid="sales-kpi-strip">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="relative min-w-0 bg-surface px-6 py-5">
              <span className="mt-2.5 block h-5 w-14 animate-pulse rounded-md bg-cream" />
              <span className="mt-2 block h-8 w-24 animate-pulse rounded-md bg-cream" />
            </div>
          ))
        ) : kpis.map((kpi, i) => {
          const rising = Boolean(kpi.trend_positive);
          const lowerIsBetter = ['pending', 'pending-irn', 'cancelled', 'errors'].includes(kpi.id);
          const positive = lowerIsBetter ? !rising : rising;
          const tones = ['#447B4B', '#3963E4', '#B07C24', '#B14435', '#5B5B5B'];
          return (
            <div key={kpi.id || i} className="relative min-w-0 bg-surface px-6 py-5" data-testid={`sales-kpi-${kpi.label?.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
              <span className="absolute inset-y-5 left-3 w-1 rounded-full" style={{ background: tones[i % tones.length] }} />
              <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-ink-soft">{lt(kpi.label)}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="display block text-xl font-bold leading-none text-ink tabular tracking-tight">
                  {kpi.format === 'currency'
                    ? mc(Number(kpi.value) || 0)
                    : kpi.format === 'percent'
                      ? `${Number(kpi.value || 0).toFixed(1)}%`
                      : Number(kpi.value || 0).toLocaleString('en-IN')}
                </span>
                {kpi.trend_pct != null && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${positive ? 'bg-pos-bg text-pos' : 'bg-neg-bg text-neg'}`}>
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

function SalesVoucherView({ title, sub, testid, tableTestid, emptyMessage, numberLabel, load, statusMode }) {
  const data = useLiveRows(load);
  return (
    <ModuleView title={title} sub={sub} testid={testid}>
      <LoadState {...data} emptyMessage={emptyMessage}>
        <LiveVoucherRegister rows={data.rows} testid={tableTestid} numberLabel={numberLabel} statusMode={statusMode} />
      </LoadState>
    </ModuleView>
  );
}

export function SalesInvoices() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid
    ? api.fetchSalesInvoices(selectedCompany.guid, requestParams(dateRange))
    : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Sales invoices" sub="Outward supply vouchers" testid="sales-invoices-view" tableTestid="sales-invoices-table" emptyMessage="No sales invoices" load={loader} statusMode="payment" />;
}

/** Mobile sales register — GET /api/sales/vouchers + /counts */
export function SalesRegister() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const [counts, setCounts] = useState(null);
  const [active, setActive] = useState(null);
  const loader = useCallback(async () => {
    if (!selectedCompany?.guid) return [];
    const range = { from: dateRange?.from, to: dateRange?.to };
    const [vouchers, countsRes] = await Promise.all([
      api.fetchSalesVouchers(selectedCompany.guid, { ...range, limit: 500 }),
      api.fetchSalesVoucherCounts(selectedCompany.guid, range).catch(() => null),
    ]);
    setCounts(countsRes?.data || countsRes || null);
    return vouchers;
  }, [selectedCompany?.guid, dateRange?.from, dateRange?.to]);
  const data = useLiveRows(loader);
  const { selectedKeys, toggleRow, toggleAll, clear } = useVoucherSelection();
  const countEntries = counts && typeof counts === 'object'
    ? Object.entries(counts).filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    : [];
  return (
    <ModuleView title="Sales register" sub="All sales vouchers — same as mobile /api/sales/vouchers" testid="sales-register-view">
      {countEntries.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" data-testid="sales-register-counts">
          {countEntries.map(([key, value]) => (
            <Pill key={key} tone="neutral">{lt(key)}: {value}</Pill>
          ))}
        </div>
      )}
      <LoadState {...data} emptyMessage="No sales vouchers">
        <BulkActionBar rows={data.rows} selectedKeys={selectedKeys} onClear={clear} testid="sales-register-bulk-bar" />
        <DataTable
          testid="sales-register-table"
          rows={data.rows}
          onRowClick={setActive}
          selectable
          selectedKeys={selectedKeys}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          rowKey={voucherRowKey}
          searchKeys={['voucher_number', 'party_name', 'voucher_type']}
          columns={[
            { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
            { key: 'voucher_number', label: 'Voucher', width: 130 },
            { key: 'voucher_type', label: 'Type', render: r => <Pill tone="neutral">{r.voucher_type || '—'}</Pill> },
            { key: 'party_name', label: 'Party' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
          ]}
          footer={visible => `${lt('Total')} ${money(visible.reduce((sum, row) => sum + amountOf(row), 0))}`}
        />
        <VoucherDrawer voucher={active} onClose={() => setActive(null)} />
      </LoadState>
    </ModuleView>
  );
}

export function SalesOrders() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchSalesOrders(selectedCompany.guid, requestParams(dateRange)) : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Sales Orders" sub="Confirmed orders pending dispatch" testid="sales-orders-view" tableTestid="sales-orders-table" emptyMessage="No sales orders" numberLabel="Order No." load={loader} />;
}

export function CreditNotes() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchCreditNotes(selectedCompany.guid, requestParams(dateRange)) : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Credit notes" sub="Sales returns and rate adjustments" testid="credit-notes-view" tableTestid="credit-notes-table" emptyMessage="No credit notes" numberLabel="Note No." load={loader} />;
}

export function DeliveryNotes() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid ? api.fetchDeliveryNotes(selectedCompany.guid, requestParams(dateRange)) : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Delivery notes" sub="Goods dispatched against orders" testid="delivery-notes-view" tableTestid="delivery-notes-table" emptyMessage="No delivery notes" numberLabel="Note No." load={loader} />;
}

export function Proforma() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid
    ? api.fetchProforma(selectedCompany.guid, requestParams(dateRange))
    : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Proforma invoices" sub="Pre-invoice documents shared with buyers" testid="proforma-view" tableTestid="proforma-table" emptyMessage="No proforma invoices" numberLabel="Proforma No." load={loader} />;
}

export function Quotations() {
  const { selectedCompany } = useAuth();
  const { dateRange } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid
    ? api.fetchQuotations(selectedCompany.guid, requestParams(dateRange))
    : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  return <SalesVoucherView title="Quotations" sub="Price offers awaiting confirmation" testid="quotations-view" tableTestid="quotations-table" emptyMessage="No quotations" numberLabel="Quotation No." load={loader} />;
}

export function SalesEwayBill() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const { dateRange, alerts } = useSalesContext();
  const loader = useCallback(() => selectedCompany?.guid
    ? api.fetchSalesEwaybills(selectedCompany.guid, requestParams(dateRange))
    : Promise.resolve([]), [selectedCompany?.guid, dateRange]);
  const data = useLiveRows(loader);
  const [active, setActive] = useState(null);
  const [attentionFilter, setAttentionFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const selection = useVoucherSelection();
  const pendingAlert = alerts.find(alert => alert.type === 'EWAY_BILL_PENDING');
  const attentionOptions = [
    { value: 'all', label: 'All E-Way Bills', count: data.rows.length },
    ...(pendingAlert ? [{ value: 'pending', label: 'Pending E-Way Bill', count: pendingAlert.count, tone: 'warning' }] : []),
  ];
  const statusOptions = [
    { value: 'all', label: 'All', count: data.rows.length },
    { value: 'generated', label: 'Generated', count: data.rows.filter(row => row.ewb_status === 'generated').length },
    { value: 'pending', label: 'Pending', count: data.rows.filter(row => row.ewb_status === 'pending').length },
  ].filter(option => option.value === 'all' || option.count > 0);
  const filteredRows = data.rows.filter(row =>
    (attentionFilter.length === 0 || (attentionFilter.includes('pending') && row.ewb_status === 'pending')) &&
    (statusFilter.length === 0 || statusFilter.includes(row.ewb_status))
  );
  return (
    <ModuleView title="E-Way Bills from sales" sub="Generated against outward invoices" testid="sales-ewb-view">
      <LoadState {...data} emptyMessage="No sales invoices in this period">
        <DataTable
          testid="sales-ewb-table"
          rows={filteredRows}
          onRowClick={setActive}
          selectable
          selectedKeys={selection.selectedKeys}
          onToggleRow={selection.toggleRow}
          onToggleAll={selection.toggleAll}
          rowKey={voucherRowKey}
          searchKeys={['voucher_number', 'party_name', 'ewb_number']}
          toolbar={<>
            {attentionOptions.length > 1 && <TableFilter label="Attention" value={attentionFilter} onChange={setAttentionFilter} options={attentionOptions} notification testid="sales-ewb-attention-filter" />}
            <TableFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} testid="sales-ewb-status-filter" />
          </>}
          bottomOverlay={<BulkActionBar rows={filteredRows} selectedKeys={selection.selectedKeys} onClear={selection.clear} onToggleAll={selection.toggleAll} docLabel="E-Way Bills" testid="sales-ewb-bulk-bar" />}
          columns={[
            { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
            { key: 'voucher_number', label: 'Invoice No.' },
            { key: 'party_name', label: 'Party' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
            { key: 'ewb_number', label: 'EWB No.', render: r => r.ewb_number || '—' },
            { key: 'status', label: 'Status', sortable: false, render: r => r.ewb_status === 'generated'
              ? <Pill tone="pos">{lt('Generated')}</Pill>
              : r.ewb_status === 'pending'
                ? <Pill tone="warn">{lt('Pending')}</Pill>
                : '—' },
          ]}
          pageSize={14}
        />
        {active && <VoucherDrawer voucher={active} onClose={() => setActive(null)} />}
      </LoadState>
    </ModuleView>
  );
}