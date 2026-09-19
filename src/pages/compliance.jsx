import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import api, { apiGet, apiRequest, unwrapList, workspaceStamp, isWorkspaceCurrent } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { StatGrid, Button, Panel, DataTable, TableFilter, Pill, Status, Tabs, Modal, Field, Input, Select, ModuleView, Empty, Skeleton, useLabelT } from '../components/kit';
import { useFmt, RecordDrawer, useVoucherSelection, BulkActionBar, voucherRowKey } from './shared';
import { useSalesContext } from '../contexts/SalesContext';
const number = value => Number(value || 0);
const dataOf = res => res?.data ?? res?.result ?? res ?? {};
const companyId = company => company?.guid || company?.id;
const rangeFor = fy => api.fyReportParams(fy);

function queryPath(path, guid, fy, extra = {}) {
  const qs = new URLSearchParams({ companyGuid: guid });
  const range = rangeFor(fy);
  Object.entries({ ...range, ...extra }).forEach(([key, value]) => value != null && value !== '' && qs.set(key, value));
  return `${path}?${qs}`;
}

async function rootPost(path, body) {
  return apiRequest('POST', path, body);
}

function useLive(loadFn) {
  const { selectedCompany, selectedFY, syncVersion } = useAuth();
  const salesCtx = useSalesContext();
  const guid = companyId(selectedCompany);

  const rangeStart = salesCtx?.dateRange?.from ?? selectedFY?.startDate ?? selectedFY?.begin_date;
  const rangeEnd = salesCtx?.dateRange?.to ?? selectedFY?.endDate ?? selectedFY?.end_date;
  const financialYear = api.fyInfoToParam(selectedFY);
  const effectiveFY = useMemo(() => ({
    startDate: rangeStart,
    endDate: rangeEnd,
    fin_year: financialYear,
  }), [rangeStart, rangeEnd, financialYear]);

  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(() => {
    const stamp = workspaceStamp();
    const identity = `${guid || ''}|${effectiveFY?.startDate || ''}|${effectiveFY?.endDate || ''}|${effectiveFY?.fin_year || ''}`;
    if (!guid) {
      setState({ data: null, loading: false, error: 'Select a company to view compliance data.' });
      return;
    }
    setState({ data: null, loading: true, error: '' });
    Promise.resolve(loadFn(guid, effectiveFY))
      .then(data => {
        if (!isWorkspaceCurrent(stamp)) return;
        setState({ data, loading: false, error: '' });
      })
      .catch(err => {
        if (!isWorkspaceCurrent(stamp)) return;
        setState({ data: null, loading: false, error: err.message || 'Unable to load compliance data.' });
      });
    return identity;
  }, [guid, effectiveFY, loadFn]);
  useEffect(load, [load, syncVersion]);
  return { ...state, retry: load, guid, fy: effectiveFY };
}

function ErrorPanel({ error, retry }) {
  const lt = useLabelT();
  return <Panel><Empty message="Could not load data" hint={error} /><div className="pb-5 text-center"><Button onClick={retry}>{lt('Retry')}</Button></div></Panel>;
}

const GST_TABS = ['Summary', 'GSTR-1', 'GSTR-2A', 'GSTR-3B', 'Unmatched', 'Returns'];

export function GST() {
  const lt = useLabelT();
  const { money, mc, date } = useFmt();
  const [tab, setTab] = useState('Summary');
  const [detailVersion, setDetailVersion] = useState(0);
  const load = useCallback(async (guid, fy) => {
    const r = rangeFor(fy);
    const [summaryRes, gstReportRes] = await Promise.all([
      api.fetchGSTSummary({ companyGuid: guid, fromDate: r.from, toDate: r.to }),
      api.fetchGSTReport(guid, { from: r.from, to: r.to, fy: fy?.fin_year || fy?.finYear }).catch(() => null),
    ]);
    return { summary: dataOf(summaryRes), gstReport: dataOf(gstReportRes) };
  }, []);
  const { data, loading, error, retry, guid, fy } = useLive(load);
  const [detail, setDetail] = useState({ rows: [], loading: false, error: '' });
  useEffect(() => {
    if (!guid || tab !== 'Unmatched') return;
    let active = true;
    setDetail({ rows: [], loading: true, error: '' });
    const r = rangeFor(fy);
    api.fetchUnmatchedInvoices(guid, { from: r.from, to: r.to, fy: fy?.finYear || fy?.fin_year || fy?.name, limit: 200 })
      .then(res => {
        if (!active) return;
        const rows = unwrapList(res).map((row, i) => ({
          id: row.guid || row.id || i,
          ...row,
          invoice: row.invoice || row.voucher_number,
          party: row.party || row.party_name,
        }));
        setDetail({ rows, loading: false, error: '' });
      })
      .catch(err => active && setDetail({ rows: [], loading: false, error: err.message || 'Unable to load unmatched invoices.' }));
    return () => { active = false; };
  }, [guid, fy, tab, detailVersion]);

  useEffect(() => {
    if (!guid || !['GSTR-1', 'GSTR-2A', 'GSTR-3B'].includes(tab)) return;
    let active = true;
    setDetail({ rows: [], loading: true, error: '' });
    apiGet(queryPath('/api/reports/gst-detail', guid, fy, { type: tab }))
      .then(res => active && setDetail({ rows: unwrapList(res), loading: false, error: '' }))
      .catch(err => active && setDetail({ rows: [], loading: false, error: err.message || lt('Unable to load GST detail.') }));
    return () => { active = false; };
  }, [guid, fy, tab, detailVersion]);

  const legacy = { ...(data?.gstReport || {}), ...(data?.summary || {}) };
  const g = {
    cgst: number(legacy.cgst),
    sgst: number(legacy.sgst),
    igst: number(legacy.igst),
    outputTax: number(legacy.outputTax ?? legacy.gstCollected ?? legacy.total),
    inputTax: number(legacy.inputTax ?? legacy.itcBalance),
    netPayable: number(legacy.netPayable ?? legacy.total),
    unmatchedCount: number(legacy.unmatchedCount),
  };
  const rows = detail.rows.map((r, i) => ({
    id: r.guid || r.id || i, ...r,
    invoice: r.invoice || r.voucher_number, party: r.party || r.party_name,
    gstin: r.gstin || r.party_gstin, place: r.place || r.place_of_supply,
    taxable: number(r.taxable ?? r.taxable_amount), cgst: number(r.cgst ?? r.cgst_amount),
    sgst: number(r.sgst ?? r.sgst_amount), igst: number(r.igst ?? r.igst_amount),
    total: number(r.total ?? r.amount),
  }));
  const detailColumns = [
    { key: 'date', label: 'Date', render: r => date(r.date) },
    { key: 'invoice', label: 'Invoice' }, { key: 'party', label: 'Party' },
    { key: 'gstin', label: 'GSTIN' }, { key: 'place', label: 'Place of supply' },
    { key: 'taxable', label: 'Taxable', align: 'right', render: r => money(r.taxable) },
    { key: 'cgst', label: 'CGST', align: 'right', render: r => money(r.cgst) },
    { key: 'sgst', label: 'SGST', align: 'right', render: r => money(r.sgst) },
    { key: 'igst', label: 'IGST', align: 'right', render: r => money(r.igst) },
    { key: 'total', label: 'Total', align: 'right', render: r => money(r.total) },
  ];
  if (error) return <ModuleView title="GST" sub="Returns and reconciliation" testid="gst-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="GST" sub="Returns and reconciliation for the selected financial year" testid="gst-view">
      <StatGrid cols={5} items={[
        { label: 'Output tax', value: mc(g.outputTax), sub: 'GST collected on sales', tone: '#B14435' },
        { label: 'Input credit', value: mc(g.inputTax), sub: 'ITC on purchases', tone: '#447B4B' },
        { label: 'Net payable', value: mc(g.netPayable), sub: 'After ITC offset', tone: '#181818' },
        { label: 'CGST', value: mc(g.cgst), sub: 'Selected FY', tone: '#3963E4' },
        { label: 'IGST', value: mc(g.igst), sub: 'Selected FY', tone: '#BB7836' },
      ]} />
      <Tabs tabs={GST_TABS} value={tab} onChange={setTab} testid="gst-tabs" />
      {tab === 'Summary' && <Panel title="Tax split"><DataTable testid="gst-split-table" loading={loading} rows={[
        { id: 1, head: lt('CGST'), amount: g.cgst }, { id: 2, head: lt('SGST'), amount: g.sgst },
        { id: 3, head: lt('IGST'), amount: g.igst }, { id: 4, head: lt('Total GST'), amount: g.outputTax },
      ]} columns={[{ key: 'head', label: 'Head' }, { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) }]} /></Panel>}
      {['GSTR-1', 'GSTR-2A', 'GSTR-3B'].includes(tab) && <Panel title={`${tab} detail`} sub="Live voucher-level GST data">
        {detail.error ? <ErrorPanel error={detail.error} retry={() => setDetailVersion(v => v + 1)} /> : <DataTable testid={`${tab.toLowerCase().replace('-', '')}-table`} rows={rows} loading={detail.loading} emptyMessage={`No ${tab} records found`} columns={detailColumns} pageSize={12} />}
      </Panel>}
      {tab === 'Unmatched' && (
        <Panel title="Unmatched GST entries" sub="Live /api/reports/unmatched">
          {detail.error ? <ErrorPanel error={detail.error} retry={() => setDetailVersion(v => v + 1)} /> : (
            <DataTable
              testid="gst-unmatched-table"
              rows={detail.rows}
              loading={detail.loading}
              emptyMessage="No unmatched GST entries"
              columns={detailColumns}
              pageSize={12}
            />
          )}
        </Panel>
      )}
      {tab === 'Returns' && <Panel title="All returns"><Empty message="GST filing history is not available" hint="No backend endpoint currently provides return due dates or filing status." /></Panel>}
    </ModuleView>
  );
}

/** Compliance alerts — GET /api/alerts (mobile parity) */
export function ComplianceAlerts() {
  const lt = useLabelT();
  const { date } = useFmt();
  const load = useCallback(async (guid, fy) => {
    const r = rangeFor(fy);
    const res = await api.fetchAlerts(guid, { from: r.from, to: r.to, fy: fy?.fin_year || fy?.finYear });
    const list = unwrapList(res);
    const nested = res?.data?.alerts || res?.alerts;
    return Array.isArray(nested) ? nested : list;
  }, []);
  const { data, loading, error, retry } = useLive(load);
  const rows = (data || []).map((row, i) => ({
    id: row.id || row.type || i,
    type: row.type || row.code || 'Alert',
    message: row.message || row.title || row.description || '—',
    count: number(row.count),
    severity: row.severity || row.level || 'info',
    date: row.date || row.created_at || '',
  }));
  if (error) return <ModuleView title="Compliance alerts" sub="Live /api/alerts" testid="compliance-alerts-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="Compliance alerts" sub="Same alerts feed as mobile" testid="compliance-alerts-view">
      <Panel>
        {loading ? <Skeleton rows={5} /> : (
          <DataTable
            testid="compliance-alerts-table"
            rows={rows}
            emptyMessage="No compliance alerts"
            columns={[
              { key: 'type', label: 'Type', render: r => <Pill tone={r.severity === 'warning' || r.severity === 'error' ? 'warn' : 'neutral'}>{r.type}</Pill> },
              { key: 'message', label: 'Message' },
              { key: 'count', label: 'Count', align: 'right' },
              { key: 'date', label: 'Date', render: r => (r.date ? date(r.date) : '—') },
            ]}
          />
        )}
      </Panel>
    </ModuleView>
  );
}

function GenerateModal({ open, onClose, kind, rows, onGenerated }) {
  const lt = useLabelT();
  const [voucherGuid, setVoucherGuid] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [distance, setDistance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const { selectedCompany } = useAuth();
  useEffect(() => {
    if (open) {
      setVoucherGuid(rows[0]?.guid || '');
      setResult(null);
      setError('');
    }
  }, [open, rows]);
  const submit = async () => {
    if (!voucherGuid) return setError(lt('Choose an eligible invoice.'));
    setSubmitting(true);
    setError('');
    try {
      const payload = { companyGuid: companyId(selectedCompany), voucherGuid };
      const res = await rootPost(kind === 'E-Invoice' ? '/api/einvoice/generate' : '/api/ewaybills/generate', payload);
      setResult(dataOf(res));
      onGenerated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} testid="generate-modal" title={`Generate ${kind}`} sub={result ? 'Generated successfully' : 'Choose an eligible outward invoice'} footer={result
      ? <Button variant="primary" data-testid="generate-done" onClick={onClose}>{lt('Done')}</Button>
      : <><Button onClick={onClose}>{lt('Cancel')}</Button><Button variant="primary" data-testid="generate-submit" disabled={submitting || !rows.length} onClick={submit}>{lt(submitting ? 'Generating…' : 'Generate')}</Button></>}>
      {result ? <div className="py-6 text-center"><p className="text-sm font-semibold text-ink">{lt(kind === 'E-Invoice' ? 'E-Invoice generated' : 'E-Way Bill generated')}</p><p className="mt-1 text-[13px] text-ink-soft tabular">{result.irn || result.ewbNo || result.ewb_no}</p></div> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Invoice"><Select data-testid="gen-invoice" value={voucherGuid} onChange={e => setVoucherGuid(e.target.value)}>{rows.map(v => <option key={v.guid} value={v.guid}>{v.voucher_number}</option>)}</Select></Field>
          <Field label="Party"><Select data-testid="gen-party" value={voucherGuid} onChange={() => {}} disabled>{rows.map(v => <option key={v.guid} value={v.guid}>{v.party_name || '—'}</option>)}</Select></Field>
          {kind === 'E-Way Bill' && <><Field label="Vehicle number"><Input data-testid="gen-vehicle" value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder={lt('Uses synced dispatch details')} disabled /></Field><Field label="Distance (km)"><Input type="number" data-testid="gen-distance" value={distance} onChange={e => setDistance(e.target.value)} placeholder={lt('Uses synced dispatch details')} disabled /></Field><Field label="Transport mode"><Select data-testid="gen-mode" value="Road" disabled><option value="Road">{lt('Road')}</option></Select></Field></>}
          {!rows.length && <p className="text-[13px] text-ink-soft sm:col-span-2">{lt('No eligible pending invoices.')}</p>}
          {error && <p className="text-[13px] text-neg sm:col-span-2">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function normalizeInvoice(r, i) {
  const status = r.einvoice_status || (r.irn ? 'Generated' : 'Pending');
  return { id: r.guid || r.id || i, ...r, invoice: r.voucher_number, party: r.party_name, amount: number(r.amount), status: `${status}`.replace(/^./, c => c.toUpperCase()) };
}

export function EInvoice() {
  const lt = useLabelT();
  const { money, mc, date } = useFmt();
  const { selectedCompany, showToast } = useAuth();
  const salesCtx = useSalesContext();
  const [localGen, setLocalGen] = useState(false);
  const [active, setActive] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const selection = useVoucherSelection();
  const load = useCallback(async (guid, fy) => {
    const [generated, pending, status] = await Promise.all([
      apiGet(queryPath('/api/einvoice/generated', guid, fy, { limit: 100 })),
      apiGet(queryPath('/api/einvoice/pending', guid, fy)),
      apiGet(queryPath('/api/einvoice/status', guid, fy)),
    ]);
    return { generated: unwrapList(generated), pending: unwrapList(pending), status: dataOf(status), meta: pending?.meta };
  }, []);
  const { data, loading, error, retry } = useLive(load);
  const rows = [...(data?.generated || []), ...(data?.pending || [])].map(normalizeInvoice);
  const alertCounts = new Map((salesCtx?.alerts || []).map(alert => [alert.type, alert.count]));
  const attentionOptions = [
    { value: 'all', label: 'All invoices', count: rows.length },
    ...(alertCounts.get('EINVOICE_MISSING_GSTIN') ? [{ value: 'missing-gstin', label: 'Missing customer GSTIN', count: alertCounts.get('EINVOICE_MISSING_GSTIN'), tone: 'warning' }] : []),
    ...(alertCounts.get('EINVOICE_MISSING_PLACE') ? [{ value: 'missing-place', label: 'Missing Place of Supply', count: alertCounts.get('EINVOICE_MISSING_PLACE'), tone: 'warning' }] : []),
    ...(alertCounts.get('EINVOICE_PENDING') ? [{ value: 'pending-irn', label: 'Pending IRN', count: alertCounts.get('EINVOICE_PENDING'), tone: 'warning' }] : []),
    ...(alertCounts.get('EINVOICE_FAILED') ? [{ value: 'failed', label: 'Generation failed', count: alertCounts.get('EINVOICE_FAILED'), tone: 'critical' }] : []),
  ];
  const matchesAttention = row => {
    if (attentionFilter.length === 0) return true;
    return attentionFilter.some(filter => {
      if (filter === 'missing-gstin') return !String(row.party_gstin || '').trim();
      if (filter === 'missing-place') return !String(row.place_of_supply || '').trim();
      if (filter === 'pending-irn') return !String(row.irn || '').trim();
      if (filter === 'failed') return Boolean(row.error_message) || String(row.status).toLowerCase() === 'error';
      return false;
    });
  };
  const statusValues = [...new Set(rows.map(row => String(row.status || '').toLowerCase()).filter(Boolean))];
  const statusOptions = [
    { value: 'all', label: 'All', count: rows.length },
    ...statusValues.map(value => ({ value, label: value.replace(/^./, char => char.toUpperCase()), count: rows.filter(row => String(row.status).toLowerCase() === value).length })),
  ];
  const filteredRows = rows.filter(row =>
    matchesAttention(row) && (statusFilter.length === 0 || statusFilter.includes(String(row.status).toLowerCase()))
  );
  const genOpen = salesCtx ? salesCtx.irnGenerateOpen : localGen;
  const closeGenerator = salesCtx ? salesCtx.closeIrnGenerator : () => setLocalGen(false);

  const cancelIrn = async () => {
    if (!active?.irn || !selectedCompany?.guid) return;
    setCancelBusy(true);
    try {
      await api.cancelEInvoice({
        companyGuid: selectedCompany.guid,
        voucherGuid: active.guid || active.id,
        irn: active.irn,
      });
      showToast?.(lt('E-Invoice cancel requested'), 'success');
      setActive(null);
      retry();
    } catch (err) {
      showToast?.(err?.message || lt('Cancel failed'), 'error');
    } finally {
      setCancelBusy(false);
    }
  };

  if (error) return <ModuleView title="E-Invoice" sub="IRN generation against outward invoices" testid="einvoice-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;
  return (
    <ModuleView title="E-Invoice" sub="IRN generation against outward invoices" testid="einvoice-view" actions={!salesCtx ? <Button variant="primary" data-testid="einvoice-generate-button" onClick={() => setLocalGen(true)}><Plus size={13} /> {lt('Generate IRN')}</Button> : null}>
      {!salesCtx && <StatGrid items={[
        { label: 'Generated', value: number(data?.status?.generated_count), sub: 'With IRN', tone: '#447B4B' },
        { label: 'Pending', value: number(data?.status?.pending_count), sub: 'To generate', tone: '#BB7836' },
        { label: 'Failed', value: number(data?.status?.error_count), sub: 'Retry needed', tone: '#B14435' },
        { label: 'Value covered', value: mc(rows.filter(r => r.irn).reduce((s, r) => s + r.amount, 0)), sub: 'This FY', tone: '#181818' },
      ]} />}
      <DataTable
        testid="einvoice-table"
        rows={filteredRows}
        loading={loading}
        emptyMessage={data?.meta?.message || 'No e-invoice records found'}
        pageSize={12}
        onRowClick={setActive}
        selectable
        selectedKeys={selection.selectedKeys}
        onToggleRow={selection.toggleRow}
        onToggleAll={selection.toggleAll}
        rowKey={voucherRowKey}
        searchKeys={['invoice', 'party', 'date', 'irn', 'ack_no']}
        toolbar={<>
          {salesCtx && attentionOptions.length > 1 && <TableFilter label="Attention" value={attentionFilter} onChange={setAttentionFilter} options={attentionOptions} notification testid="einvoice-attention-filter" />}
          <TableFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} testid="einvoice-status-filter" />
        </>}
        bottomOverlay={<BulkActionBar rows={filteredRows} selectedKeys={selection.selectedKeys} onClear={selection.clear} onToggleAll={selection.toggleAll} docLabel="invoices" testid="einvoice-bulk-bar" />}
        columns={[
        { key: 'date', label: 'Date', render: r => date(r.date) }, { key: 'invoice', label: 'Invoice' }, { key: 'party', label: 'Party' },
        { key: 'irn', label: 'IRN', render: r => r.irn ? <span className="mono text-[11px]">{r.irn}</span> : '—' },
        { key: 'ack_no', label: 'Ack no.', render: r => r.ack_no || '—' },
        { key: 'amount', label: 'Value', align: 'right', render: r => money(r.amount) },
        { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
      ]} />
      <GenerateModal open={genOpen} onClose={closeGenerator} kind="E-Invoice" rows={(data?.pending || [])} onGenerated={retry} />
      {active && (
        <RecordDrawer
          record={active}
          onClose={() => setActive(null)}
          title={active.invoice}
          sub={<>{lt('E-Invoice')} · {date(active.date)}</>}
          actions={active.irn ? (
            <Button data-testid="einvoice-cancel-button" disabled={cancelBusy} onClick={cancelIrn}>
              {cancelBusy ? lt('Cancelling…') : lt('Cancel IRN')}
            </Button>
          ) : null}
          fields={[
            ['Party', active.party], ['Invoice value', money(active.amount), true], ['IRN', active.irn || lt('Not generated'), true],
            ['Ack. number', active.ack_no || '—', true], ['Status', <Status key="st" value={active.status} />],
          ]}
        />
      )}
    </ModuleView>
  );
}

export function EInvoiceCoverage() {
  const lt = useLabelT();
  const { money } = useFmt();
  const load = useCallback(async (guid, fy) => {
    const [generated, pending] = await Promise.all([apiGet(queryPath('/api/einvoice/generated', guid, fy, { limit: 100 })), apiGet(queryPath('/api/einvoice/pending', guid, fy))]);
    return { generated: unwrapList(generated), pending: unwrapList(pending) };
  }, []);
  const { data, loading, error, retry } = useLive(load);
  if (error) return <ModuleView title="E-Invoice coverage" sub="Invoices above the e-invoicing threshold" testid="einvoice-coverage-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;
  const generated = data?.generated || [], pending = data?.pending || [], all = [...generated, ...pending];
  return <ModuleView title="E-Invoice coverage" sub="Invoices above the e-invoicing threshold" testid="einvoice-coverage-view"><Panel><DataTable testid="einvoice-compliance-table" loading={loading} rows={[
    { id: 1, head: lt('Invoices requiring IRN'), count: all.length, value: all.reduce((s, r) => s + number(r.amount), 0) },
    { id: 2, head: lt('IRN generated'), count: generated.length, value: generated.reduce((s, r) => s + number(r.amount), 0) },
    { id: 3, head: lt('Missing IRN'), count: pending.length, value: pending.reduce((s, r) => s + number(r.amount), 0) },
  ]} columns={[{ key: 'head', label: 'Particulars' }, { key: 'count', label: 'Invoices', align: 'right' }, { key: 'value', label: 'Value', align: 'right', render: r => money(r.value) }]} /></Panel></ModuleView>;
}

function normalizeEwb(r, i) {
  const status = r.ewb_status || (r.ewb_number ? 'Generated' : 'Pending');
  return {
    id: r.guid || r.id || i, ...r, ewb_no: r.ewb_no || r.ewb_number, invoice: r.voucher_number,
    party: r.party_name, distance: number(r.distance ?? r.distance_km), vehicle: r.vehicle || r.vehicle_no,
    amount: number(r.amount), status: `${status}`.replace(/^./, c => c.toUpperCase()),
  };
}

export function EWayBill() {
  const lt = useLabelT();
  const { money, mc, date } = useFmt();
  const { selectedCompany, showToast } = useAuth();
  const salesCtx = useSalesContext();
  const [gen, setGen] = useState(false);
  const [active, setActive] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const selection = useVoucherSelection();
  const load = useCallback(async (guid, fy) => {
    const [generated, pending, status] = await Promise.all([
      apiGet(queryPath('/api/ewaybills', guid, fy, { limit: 100 })),
      apiGet(queryPath('/api/ewaybills/pending', guid, fy, { limit: 100 })),
      apiGet(queryPath('/api/ewaybills/status', guid, fy)),
    ]);
    return { generated: unwrapList(generated), pending: unwrapList(pending), status: dataOf(status), meta: generated?.meta };
  }, []);
  const { data, loading, error, retry } = useLive(load);
  const rows = [...(data?.generated || []), ...(data?.pending || [])].map(normalizeEwb);
  const pendingAlert = (salesCtx?.alerts || []).find(alert => alert.type === 'EWAY_BILL_PENDING');
  const attentionOptions = [
    { value: 'all', label: 'All E-Way Bills', count: rows.length },
    ...(pendingAlert ? [{ value: 'pending', label: 'Pending E-Way Bill', count: pendingAlert.count, tone: 'warning' }] : []),
  ];
  const statusValues = [...new Set(rows.map(row => String(row.status || '').toLowerCase()).filter(Boolean))];
  const statusOptions = [
    { value: 'all', label: 'All', count: rows.length },
    ...statusValues.map(value => ({ value, label: value.replace(/^./, char => char.toUpperCase()), count: rows.filter(row => String(row.status).toLowerCase() === value).length })),
  ];
  const filteredRows = rows.filter(row =>
    (attentionFilter.length === 0 || (attentionFilter.includes('pending') && String(row.status).toLowerCase() === 'pending')) &&
    (statusFilter.length === 0 || statusFilter.includes(String(row.status).toLowerCase()))
  );
  if (error) return <ModuleView title="E-Way Bill" sub="Consignment documents and validity" testid="ewb-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;

  const cancelEwb = async () => {
    if (!active?.ewb_no || !selectedCompany?.guid) return;
    setCancelBusy(true);
    try {
      await api.cancelEWayBill({
        companyGuid: selectedCompany.guid,
        voucherGuid: active.guid || active.id,
        ewbNo: active.ewb_no,
        ewb_number: active.ewb_no,
      });
      showToast?.(lt('E-Way Bill cancel requested'), 'success');
      setActive(null);
      retry();
    } catch (err) {
      showToast?.(err?.message || lt('Cancel failed'), 'error');
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <ModuleView title="E-Way Bill" sub="Consignment documents and validity" testid="ewb-view" actions={<Button variant="primary" data-testid="ewb-generate-button" onClick={() => setGen(true)}><Plus size={13} /> {lt('Generate EWB')}</Button>}>
      <StatGrid cols={5} items={[
        { label: 'Generated', value: number(data?.status?.generated_count), sub: 'Bills', tone: '#447B4B' },
        { label: 'Pending', value: number(data?.status?.pending_count), sub: 'To generate', tone: '#BB7836' },
        { label: 'Expiring', value: number(data?.status?.expiring_count), sub: 'Within 24 hours', tone: '#B14435' },
        { label: 'Distance', value: `${rows.reduce((s, r) => s + r.distance, 0)} km`, sub: 'Recorded', tone: '#3963E4' },
        { label: 'Value', value: mc(rows.reduce((s, r) => s + r.amount, 0)), sub: 'Consignments', tone: '#181818' },
      ]} />
      <DataTable
        testid="ewb-table"
        rows={filteredRows}
        loading={loading}
        emptyMessage={data?.meta?.message || 'No e-way bill records found'}
        pageSize={12}
        onRowClick={setActive}
        selectable
        selectedKeys={selection.selectedKeys}
        onToggleRow={selection.toggleRow}
        onToggleAll={selection.toggleAll}
        rowKey={voucherRowKey}
        searchKeys={['invoice', 'party', 'date', 'ewb_no', 'vehicle']}
        toolbar={<>
          {salesCtx && attentionOptions.length > 1 && <TableFilter label="Attention" value={attentionFilter} onChange={setAttentionFilter} options={attentionOptions} notification testid="ewb-attention-filter" />}
          <TableFilter label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} testid="ewb-status-filter" />
        </>}
        bottomOverlay={<BulkActionBar rows={filteredRows} selectedKeys={selection.selectedKeys} onClear={selection.clear} onToggleAll={selection.toggleAll} docLabel="E-Way Bills" testid="ewb-bulk-bar" />}
        columns={[
        { key: 'date', label: 'Date', render: r => date(r.date) }, { key: 'ewb_no', label: 'EWB No.', render: r => r.ewb_no || '—' },
        { key: 'invoice', label: 'Invoice' }, { key: 'party', label: 'Party' }, { key: 'distance', label: 'Km', align: 'right' },
        { key: 'vehicle', label: 'Vehicle' }, { key: 'valid_till', label: 'Valid till', render: r => r.valid_till ? date(r.valid_till) : '—' },
        { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
      ]} />
      <GenerateModal open={gen} onClose={() => setGen(false)} kind="E-Way Bill" rows={data?.pending || []} onGenerated={retry} />
      {active && (
        <RecordDrawer
          record={active}
          onClose={() => setActive(null)}
          title={active.ewb_no || active.invoice}
          sub={<>{lt('E-Way Bill')} · {date(active.date)}</>}
          actions={active.ewb_no ? (
            <Button data-testid="ewb-cancel-button" disabled={cancelBusy} onClick={cancelEwb}>
              {cancelBusy ? lt('Cancelling…') : lt('Cancel EWB')}
            </Button>
          ) : null}
          fields={[
            ['Invoice', active.invoice], ['Party', active.party], ['Distance', `${active.distance} km`, true], ['Vehicle', active.vehicle || '—', true],
            ['Consignment value', money(active.amount), true], ['Valid till', active.valid_till ? date(active.valid_till) : '—', true], ['Status', <Status key="st" value={active.status} />],
          ]}
        />
      )}
    </ModuleView>
  );
}

export function EWayBillCoverage() {
  const lt = useLabelT();
  const { money } = useFmt();
  const load = useCallback(async (guid, fy) => {
    const [generated, pending, status] = await Promise.all([apiGet(queryPath('/api/ewaybills', guid, fy, { limit: 100 })), apiGet(queryPath('/api/ewaybills/pending', guid, fy, { limit: 100 })), apiGet(queryPath('/api/ewaybills/status', guid, fy))]);
    return { generated: unwrapList(generated), pending: unwrapList(pending), status: dataOf(status) };
  }, []);
  const { data, loading, error, retry } = useLive(load);
  if (error) return <ModuleView title="E-Way Bill coverage" sub="Consignments above ₹50,000" testid="ewb-coverage-view"><ErrorPanel error={error} retry={retry} /></ModuleView>;
  const generated = data?.generated || [], pending = data?.pending || [], all = [...generated, ...pending];
  return <ModuleView title="E-Way Bill coverage" sub="Consignments above ₹50,000" testid="ewb-coverage-view"><Panel><DataTable testid="ewb-compliance-table" loading={loading} rows={[
    { id: 1, head: lt('Consignments requiring EWB'), count: all.length, value: all.reduce((s, r) => s + number(r.amount), 0) },
    { id: 2, head: lt('EWB generated'), count: generated.length, value: generated.reduce((s, r) => s + number(r.amount), 0) },
    { id: 3, head: lt('Missing EWB'), count: pending.length, value: pending.reduce((s, r) => s + number(r.amount), 0) },
    { id: 4, head: lt('Expiring bills'), count: number(data?.status?.expiring_count), value: 0 },
  ]} columns={[{ key: 'head', label: 'Particulars' }, { key: 'count', label: 'Count', align: 'right' }, { key: 'value', label: 'Value', align: 'right', render: r => money(r.value) }]} /></Panel></ModuleView>;
}

const OTHER_TAX_TABS = [
  { label: 'TDS', taxType: 'TDS' },
  { label: 'TCS', taxType: 'TCS' },
  { label: 'VAT', taxType: 'VAT' },
  { label: 'Cess', taxType: 'CESS' },
  { label: 'Excise Duty', taxType: 'EXCISE_DUTY' },
  { label: 'Service Tax', taxType: 'SERVICE_TAX' },
  { label: 'Import Duty', taxType: 'IMPORT_DUTY' },
  { label: 'Export Duty', taxType: 'EXPORT_DUTY' },
  { label: 'WHT', taxType: 'WITHHOLDING_TAX' },
];

const NATURE_TONE = {
  input: 'pos',
  output: 'warn',
  settlement: 'note',
  adjustment: 'neutral',
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function groupTaxTxnsByMonth(txns) {
  const map = new Map();
  for (const txn of txns) {
    const raw = txn.voucher_date ? String(txn.voucher_date).replace(/T.*/, '') : '';
    const d = raw ? new Date(raw) : null;
    let key;
    if (d && !Number.isNaN(d.getTime())) {
      key = `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
    } else if (txn.financial_year) {
      const parts = String(txn.financial_year).split('-');
      key = parts.length === 2 ? `FY ${parts[0]}-${parts[1].slice(2)}` : `FY ${txn.financial_year}`;
    } else {
      key = 'Undated Entries';
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(txn);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

function useOtherTaxesData(activeTaxType, { includeChallans = true } = {}) {
  const { selectedCompany, selectedFY, syncVersion } = useAuth();
  const guid = companyId(selectedCompany);
  const fyParam = api.fyInfoToParam(selectedFY);

  const [summary, setSummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [txns, setTxns] = useState([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsError, setTxnsError] = useState('');
  const [txnsTotal, setTxnsTotal] = useState(0);
  const [challans, setChallans] = useState([]);
  const [hasChallans, setHasChallans] = useState(false);
  const [challansLoading, setChallansLoading] = useState(false);

  const loadSummary = useCallback(() => {
    if (!guid) {
      setSummary([]);
      setSummaryLoading(false);
      setSummaryError('Select a company to view compliance data.');
      return;
    }
    setSummaryLoading(true);
    setSummaryError('');
    api.fetchOtherTaxesSummary({ companyGuid: guid, fy: fyParam })
      .then(res => setSummary(unwrapList(res)))
      .catch(err => setSummaryError(err.message || 'Unable to load other-tax summary.'))
      .finally(() => setSummaryLoading(false));
  }, [guid, fyParam]);

  const loadTxns = useCallback((taxType) => {
    if (!guid || !taxType) return;
    setTxnsLoading(true);
    setTxnsError('');
    api.fetchOtherTaxesTransactions({ companyGuid: guid, fy: fyParam, taxType, limit: 500, page: 1 })
      .then(txnRes => {
        const rows = unwrapList(txnRes);
        setTxns(rows);
        setTxnsTotal(txnRes?.meta?.total ?? rows.length);
      })
      .catch(err => setTxnsError(err.message || 'Unable to load tax transactions.'))
      .finally(() => setTxnsLoading(false));
  }, [guid, fyParam]);

  const loadChallans = useCallback((taxType) => {
    if (!guid || !taxType || !includeChallans) return;
    setChallansLoading(true);
    api.fetchOtherTaxesLateChallans({ companyGuid: guid, fy: fyParam, taxType })
      .then(challanRes => {
        setChallans(challanRes?.data ?? []);
        setHasChallans(Boolean(challanRes?.has_challan_data));
      })
      .catch(() => {
        setChallans([]);
        setHasChallans(false);
      })
      .finally(() => setChallansLoading(false));
  }, [guid, fyParam, includeChallans]);

  const loadTabData = useCallback((taxType) => {
    loadTxns(taxType);
    loadChallans(taxType);
  }, [loadTxns, loadChallans]);

  useEffect(loadSummary, [loadSummary, syncVersion]);
  useEffect(() => {
    setTxns([]);
    setChallans([]);
    setHasChallans(false);
    loadTabData(activeTaxType);
  }, [activeTaxType, loadTabData, syncVersion]);

  const activeTab = OTHER_TAX_TABS.find(t => t.taxType === activeTaxType) || OTHER_TAX_TABS[0];
  const activeSummary = summary.find(s => s.taxType === activeTaxType);

  return {
    guid,
    summary,
    summaryLoading,
    summaryError,
    retrySummary: loadSummary,
    txns,
    txnsLoading,
    txnsError,
    txnsTotal,
    retryTxns: () => loadTxns(activeTaxType),
    challans,
    hasChallans,
    challansLoading,
    activeTab,
    activeSummary,
  };
}

function OtherTaxTabBar({ activeTaxType, onChange, summary, money }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {OTHER_TAX_TABS.map(tab => {
        const tabSummary = summary.find(s => s.taxType === tab.taxType);
        const active = activeTaxType === tab.taxType;
        return (
          <button
            key={tab.taxType}
            type="button"
            onClick={() => onChange(tab.taxType)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              active ? 'border-brand bg-surface text-brand' : 'border-line bg-paper text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
            {tabSummary && number(tabSummary.totalTaxAmount) > 0 && (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-brand/15 text-brand' : 'bg-paper-2 text-ink-soft'}`}>
                {money(number(tabSummary.totalTaxAmount))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function OtherTaxStatsCard({ activeSummary, activeLabel, money, date }) {
  if (!activeSummary) {
    return (
      <Panel>
        <Empty message={`No ${activeLabel} data found`} hint={`No ${activeLabel} entries found in synced Tally vouchers for the selected period.`} />
      </Panel>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="px-4 py-4">
          <p className="text-[11px] font-medium text-ink-soft">Total Tax Amount</p>
          <p className="mt-1.5 text-[15px] font-bold tabular text-ink">{money(number(activeSummary.totalTaxAmount))}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] font-medium text-ink-soft">Vouchers</p>
          <p className="mt-1.5 text-[15px] font-bold tabular text-ink">{number(activeSummary.voucherCount)}</p>
        </div>
      </div>
      <div className="h-px bg-line" />
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="px-4 py-4">
          <p className="text-[11px] font-medium text-ink-soft">Last Transaction</p>
          <p className="mt-1.5 text-[15px] font-bold tabular text-ink">
            {activeSummary.lastTransactionDate ? date(activeSummary.lastTransactionDate) : '—'}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] font-medium text-ink-soft">Tax Type</p>
          <p className="mt-1.5 text-[15px] font-bold text-ink">{activeLabel}</p>
        </div>
      </div>
    </div>
  );
}

export function OtherTaxes() {
  const { money, date } = useFmt();
  const [activeTaxType, setActiveTaxType] = useState(OTHER_TAX_TABS[0].taxType);
  const [collapsedMonths, setCollapsedMonths] = useState(new Set());
  const {
    summary, summaryLoading, summaryError, retrySummary,
    txns, txnsLoading, txnsError, txnsTotal, retryTxns,
    challans, hasChallans, challansLoading,
    activeTab, activeSummary,
  } = useOtherTaxesData(activeTaxType);

  const groupedTxns = useMemo(() => groupTaxTxnsByMonth(txns), [txns]);

  const toggleMonth = (month) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  if (summaryError && !summaryLoading && !summary.length) {
    return (
      <ModuleView title="Other taxes" sub="TDS, TCS and other statutory heads" testid="other-taxes-view">
        <ErrorPanel error={summaryError} retry={retrySummary} />
      </ModuleView>
    );
  }

  return (
    <ModuleView title="Other taxes" sub="TDS, TCS and other statutory heads" testid="other-taxes-view">
      <OtherTaxTabBar activeTaxType={activeTaxType} onChange={setActiveTaxType} summary={summary} money={money} />

      {summaryLoading ? <Skeleton rows={3} /> : (
        <OtherTaxStatsCard activeSummary={activeSummary} activeLabel={activeTab.label} money={money} date={date} />
      )}

      <Panel title="Top 5 Late Challans">
        {challansLoading ? (
          <Skeleton rows={2} />
        ) : !hasChallans ? (
          <p className="py-2 text-sm italic text-ink-faint">Late challans: Not available from current Tally data</p>
        ) : challans.length === 0 ? (
          <p className="py-2 text-sm text-ink-faint">No late challans for {activeTab.label}</p>
        ) : (
          <div className="divide-y divide-line">
            {challans.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 py-3">
                <span className="w-5 text-sm font-bold text-ink-faint">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{item.return_period ?? item.challan_no ?? '—'}</p>
                  <p className="text-xs text-ink-soft">{item.tax_type} · Due: {item.due_date ? date(item.due_date) : '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular text-ink">{money(number(item.tax_amount))}</p>
                  <p className="text-xs text-neg">{item.late_days ?? '—'} days late</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {(txnsTotal > 0 || txnsLoading || txnsError) && (
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-ink">{activeTab.label} Transactions</h3>
          {txnsTotal > 0 && <span className="text-xs text-ink-faint">{txnsTotal} records</span>}
        </div>
      )}

      {txnsLoading ? (
        <Skeleton rows={4} />
      ) : txnsError ? (
        <ErrorPanel error={txnsError} retry={retryTxns} />
      ) : txns.length === 0 ? (
        <Panel><Empty message={`No ${activeTab.label} data in synced Tally vouchers`} /></Panel>
      ) : (
        groupedTxns.map(group => {
          const collapsed = collapsedMonths.has(group.month);
          return (
            <Panel key={group.month}>
              <button
                type="button"
                onClick={() => toggleMonth(group.month)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-bold text-ink">{group.month}</span>
                <span className="text-xs text-ink-faint">{group.items.length} entries {collapsed ? '▾' : '▴'}</span>
              </button>
              {!collapsed && (
                <div className="mt-3 space-y-2">
                  {group.items.map(txn => {
                    const nature = (txn.transaction_nature || 'other').toLowerCase();
                    const tone = NATURE_TONE[nature] || 'neutral';
                    const base = number(txn.taxable_amount);
                    return (
                      <div key={txn.id} className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-bold text-ink">{txn.voucher_number || '—'}</span>
                          <span className="text-ink-faint">·</span>
                          <span className="text-ink-soft">{txn.voucher_type || '—'}</span>
                        </div>
                        <div className="mt-2">
                          <Pill tone={tone}>{nature === 'other' ? (txn.transaction_nature || 'Other') : nature.charAt(0).toUpperCase() + nature.slice(1)}</Pill>
                        </div>
                        <div className="mt-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{txn.party_ledger_name || '—'}</p>
                            <p className="truncate text-xs text-ink-soft">{txn.tax_ledger_name}</p>
                            <p className="text-xs text-ink-faint">{txn.voucher_date ? date(txn.voucher_date) : '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold tabular text-ink">{money(number(txn.tax_amount))}</p>
                            {base > 0 && <p className="text-xs text-ink-soft">Base: {money(base)}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          );
        })
      )}
    </ModuleView>
  );
}

export function ComplianceKpis() {
  const { mc } = useFmt();
  const load = useCallback(async (guid, fy) => {
    const r = rangeFor(fy);
    const [gst, irn, ewb] = await Promise.all([
      api.fetchGSTSummary({ companyGuid: guid, fromDate: r.from, toDate: r.to }),
      apiGet(queryPath('/api/einvoice/status', guid, fy)),
      apiGet(queryPath('/api/ewaybills/status', guid, fy)),
    ]);
    return { gst: dataOf(gst), irn: dataOf(irn), ewb: dataOf(ewb) };
  }, []);
  const { data, loading, error, retry } = useLive(load);
  if (loading) return <Skeleton rows={3} />;
  if (error) return <ErrorPanel error={error} retry={retry} />;
  return <StatGrid items={[
    { label: 'GST total', value: mc(number(data?.gst?.summary?.total)), sub: 'Selected FY', tone: '#B14435' },
    { label: 'GST unmatched', value: number(data?.gst?.summary?.unmatchedCount), sub: 'Needs review', tone: '#BB7836' },
    { label: 'IRN pending', value: number(data?.irn?.pending_count), sub: 'E-Invoice', tone: '#3963E4' },
    { label: 'EWB expiring', value: number(data?.ewb?.expiring_count), sub: 'Within 24 hours', tone: '#181818' },
  ]} />;
}