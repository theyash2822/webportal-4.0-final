import { useEffect, useState } from 'react';
import { Printer, QrCode } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  StatGrid, Button, Panel, DataTable, Pill, KV, Status, Card, Drawer, Tabs,
  Chips, Bar as MiniBar, Toggle, SettingRow, Select, Input, Field, Empty, useLabelT, Modal, Textarea,
} from '../components/kit';
import { useFmt } from './shared';
import { useDrawerParam } from '../components/kit';
import { useAuth } from '../contexts/AuthContext';
import api, { apiGet, unwrapList } from '../services/api';
import BarcodeGunInput from '../components/BarcodeGunInput';
import { printLabels, downloadLabelsPdf } from '../utils/labelPrint';
import { todayLocalISO } from '../utils/periodDates';

// Deep-link bridge: /inventory/<section>/<id> → /inventory/<section>?<key>=<id>
// so path-based links (Quick Search, shared URLs) open the existing query-param drawer.
function useRouteIdDrawer(listPath, key) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    // Treat '+' as space: Tally guids never contain '+', but query-encoded links (?key=a+b) pasted as paths do.
    if (routeId) navigate(`${listPath}?${key}=${encodeURIComponent(routeId.replace(/\+/g, ' '))}`, { replace: true });
  }, [routeId, listPath, key, navigate]);
}

function Shell({ title, sub, actions, children, testid }) {
  const lt = useLabelT();
  return (
    <div className="space-y-5" data-testid={testid || 'inventory-panel'}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && <h2 className="display text-xl font-bold text-ink">{lt(title)}</h2>}
            {sub && <p className="mt-1 text-[13px] text-ink-soft">{typeof sub === 'string' ? lt(sub) : sub}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

const num = value => Number(value || 0);
const rowId = (r, i) => r.id || r.guid || r.stockGuid || r.stock_guid || r.voucherGuid || r.voucher_guid || `${i}`;
const withIds = rows => (rows || []).map((r, i) => ({ ...r, id: rowId(r, i) }));
const fyValue = fy => fy?.fin_year || fy?.financialYear || (fy?.startDate ? `${fy.startDate.slice(0, 4)}-${Number(fy.startDate.slice(0, 4)) + 1}` : '');
const queryPath = (path, companyGuid, params = {}) => {
  const q = new URLSearchParams();
  if (companyGuid) q.set('companyGuid', companyGuid);
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== null && value !== '' && q.set(key, value));
  return `${path}?${q.toString()}`;
};
const responseData = res => res?.data?.data ?? res?.data ?? res?.result ?? res ?? {};

function useLive(loader, deps) {
  const lt = useLabelT();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    Promise.resolve().then(loader).then(data => {
      if (current) setState({ loading: false, error: '', data });
    }).catch(error => {
      if (current) setState({ loading: false, error: error?.message || lt('Unable to load inventory data'), data: null });
    });
    return () => { current = false; };
    // Callers provide the request dependencies explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, retry]);
  return { ...state, retry: () => setRetry(n => n + 1) };
}

function Gate({ state, empty, children }) {
  const lt = useLabelT();
  if (state.loading) return <Card><Empty message="Loading inventory…" hint="Fetching the latest data from TallyDekho." /></Card>;
  if (state.error) return <Card><Empty message="Could not load inventory" hint={state.error} /><div className="mt-3 text-center"><Button onClick={state.retry}>{lt('Retry')}</Button></div></Card>;
  if (empty) return <Card><Empty message="No inventory data" hint="No records are available for this company and financial year." /></Card>;
  return children;
}

function useStockItems() {
  const { selectedCompany, selectedFY } = useAuth();
  const guid = selectedCompany?.guid;
  return useLive(async () => {
    if (!guid) throw new Error('Select a company to view inventory.');
    const res = await api.fetchStocks({ companyGuid: guid, page: 1, pageSize: 1000, fy: fyValue(selectedFY) });
    return withIds(unwrapList(res));
  }, [guid, fyValue(selectedFY)]);
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
export function InventoryOverview() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const state = useLive(async () => {
    if (!selectedCompany?.guid) throw new Error('Select a company to view inventory.');
    return responseData(await api.fetchStockSummary(selectedCompany.guid));
  }, [selectedCompany?.guid]);
  const d = state.data || {};
  const trend = withIds(d.trend || d.movement || []);
  const categories = d.categories || d.composition || [];
  return (
    <Shell title="Inventory overview" sub="Position across all items and godowns" testid="inventory-overview-page">
      <Gate state={state} empty={!state.loading && !state.error && !d.totalItems && !d.totalValue}>
        <>
          <StatGrid cols={5} items={[
            { label: 'Stock value', value: mc(num(d.totalValue)), sub: 'Closing valuation', tone: '#3963E4' },
            { label: 'Total quantity', value: num(d.totalQty).toLocaleString('en-IN'), sub: 'All units', tone: '#181818' },
            { label: 'Items', value: num(d.totalItems), sub: <>{categories.length} {lt('categories')}</>, tone: '#3963E4' },
            { label: 'Below reorder', value: num(d.lowStock), sub: 'Needs purchase', tone: '#BB7836' },
            { label: 'Out of stock', value: num(d.outOfStock), sub: 'Reconcile', tone: '#B14435' },
          ]} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Stock value trend" sub="Latest inventory movement" testid="movement-panel">
              {trend.length ? <ResponsiveContainer width="100%" height={230}>
                <BarChart data={trend}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#447B4B" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer> : <Empty message="No movement history" />}
            </Panel>
            <Panel title="Value by category" sub="Closing valuation split" testid="valuation-split-panel">
              {categories.length ? <div className="space-y-4">{categories.map((v, i) => (
                <div key={v.label || v.name || i}>
                  <div className="mb-1.5 flex justify-between"><span>{v.label || v.name}</span><b>{mc(num(v.value))}</b></div>
                  <MiniBar pct={num(v.value) / Math.max(num(categories[0]?.value), 1) * 100} color={v.color || '#3963E4'} />
                </div>
              ))}</div> : <Empty message="No category valuation" />}
            </Panel>
          </div>
        </>
      </Gate>
    </Shell>
  );
}

/* ── Barcode gun scan box — type/scan a code + Enter to jump to the item ──── */
function BarcodeScanBox({ onFound }) {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const [status, setStatus] = useState(null);
  const submit = async (code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed || !selectedCompany?.guid) return;
    setStatus('busy');
    try {
      const res = await api.lookupBarcode(selectedCompany.guid, trimmed);
      const data = res?.data || res;
      if (data?.found && data?.item?.stockGuid) {
        setStatus(null);
        onFound(data.item.stockGuid);
      } else {
        setStatus('notfound');
      }
    } catch {
      setStatus('notfound');
    }
  };
  return (
    <div data-testid="barcode-scan-box">
      <BarcodeGunInput testid="barcode-scan-input" onScan={submit} placeholder="Click here, then scan…" />
      {status === 'notfound' && (
        <span className="mt-1 block text-[12px] text-[#B14435]" data-testid="barcode-scan-error">{lt('No item with this barcode')}</span>
      )}
    </div>
  );
}

/* ── Items + detail ───────────────────────────────────────────────────────── */
export function StockItems() {
  const { money } = useFmt();
  const lt = useLabelT();
  const state = useStockItems();
  const [cat, setCat] = useState('All');
  const [active, setActive] = useDrawerParam('item');
  useRouteIdDrawer('/inventory/items', 'item');
  const items = state.data || [];
  const cats = ['All', ...new Set(items.map(i => i.category).filter(Boolean))];
  const rows = cat === 'All' ? items : items.filter(i => i.category === cat);
  return (
    <Shell title="Stock Items" sub={<>{rows.length} {lt('items')} · {money(rows.reduce((s, r) => s + num(r.closing_value), 0))} {lt('closing value')}</>} actions={<BarcodeScanBox onFound={guid => setActive(guid)} />} testid="stock-items-page">
      <Gate state={state} empty={!items.length}>
        <>
          <Chips options={cats} value={cat} onChange={setCat} testid="items-category-chips" />
          <DataTable testid="stock-items-table" rows={rows} onRowClick={r => setActive(r.guid || r.id)} pageSize={14} columns={[
            { key: 'name', label: 'Item', render: r => <span className="font-medium">{r.displayName || r.name}</span> },
            { key: 'alias', label: 'Alias' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
            { key: 'closing_qty', label: 'Qty', align: 'right' },
            { key: 'closing_rate', label: 'Rate', align: 'right', render: r => money(num(r.closing_rate)) },
            { key: 'closing_value', label: 'Value', align: 'right', render: r => money(num(r.closing_value)) },
            { key: 'status', label: 'Status', render: r => <Status value={r.status || (num(r.closing_qty) < 0 ? 'Negative' : num(r.reorder_level) && num(r.closing_qty) <= num(r.reorder_level) ? 'Low' : 'In stock')} /> },
          ]} footer={f => <>{lt('Value')} {money(f.reduce((s, r) => s + num(r.closing_value), 0))}</>} />
          {active && <ItemPanel id={active} onClose={() => setActive(null)} />}
        </>
      </Gate>
    </Shell>
  );
}

export function ItemPanel({ id, onClose }) {
  const { money, date, mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY, showToast } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', hsn: '', gstRate: '', alias: '' });
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const state = useLive(async () => {
    const companyGuid = selectedCompany?.guid;
    const detailRes = await api.fetchStockDetails({ companyGuid, stockGuid: id });
    const detail = responseData(detailRes);
    const item = detail.stock || detail.item || detail;
    const [godownRes, ledgerRes, moveRes] = await Promise.all([
      api.fetchStockGodowns(companyGuid, id),
      apiGet(queryPath('/api/stocks/ledger', companyGuid, { item: item.name, fy: fyValue(selectedFY), limit: 50 })),
      api.fetchStockMovements(companyGuid, id).catch(() => null),
    ]);
    const movements = withIds(unwrapList(moveRes).length ? unwrapList(moveRes) : (responseData(moveRes).items || detail.movements || []));
    return {
      item,
      godowns: withIds(unwrapList(godownRes)),
      ledger: withIds(unwrapList(ledgerRes).length ? unwrapList(ledgerRes) : movements),
      movements,
    };
  }, [selectedCompany?.guid, id, fyValue(selectedFY)]);
  const item = state.data?.item || {};
  const godowns = state.data?.godowns || [];
  const ledger = state.data?.ledger || [];
  const movements = state.data?.movements || [];

  const openEdit = () => {
    setEditForm({
      name: item.name || item.displayName || '',
      hsn: item.hsn || '',
      gstRate: String(item.gst_rate ?? item.igstRate ?? ''),
      alias: item.alias || '',
    });
    setEditErr('');
    setEditing(true);
  };

  const saveAlter = async () => {
    if (!selectedCompany?.guid || !editForm.name.trim()) {
      setEditErr(lt('Item name is required'));
      return;
    }
    setSaving(true);
    setEditErr('');
    try {
      const rate = Number(editForm.gstRate) || 0;
      await api.alterStockItemInTally({
        companyGuid: selectedCompany.guid,
        companyName: selectedCompany.name || '',
        stockGuid: id,
        name: editForm.name.trim(),
        alias: editForm.alias.trim() || undefined,
        hsnCode: editForm.hsn.trim() || undefined,
        igstRate: rate,
        cgstRate: rate / 2,
        sgstRate: rate / 2,
      });
      showToast?.(lt('Stock item alter queued to Tally'), 'success');
      setEditing(false);
      state.retry?.();
    } catch (e) {
      setEditErr(e?.message || lt('Unable to alter stock item'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open size="xl" eyebrow="Stock item" onClose={onClose} testid="item-panel" title={item.displayName || item.name || 'Stock item'} sub={<>{item.category || lt('Uncategorised')} · {item.unit || '—'} · {lt('HSN')} {item.hsn || '—'}</>} footer={<><Button onClick={openEdit}>{lt('Edit in Tally')}</Button><Button onClick={onClose}>{lt('Close')}</Button></>}>
      <Gate state={state} empty={!item.name}>
        <div className="space-y-5">
          {editing && (
            <Panel title={lt('Alter stock item')} sub="POST /tally/master/stock-item-alter">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name"><Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} data-testid="stock-alter-name" /></Field>
                <Field label="Alias"><Input value={editForm.alias} onChange={e => setEditForm({ ...editForm, alias: e.target.value })} /></Field>
                <Field label="HSN"><Input value={editForm.hsn} onChange={e => setEditForm({ ...editForm, hsn: e.target.value })} /></Field>
                <Field label="GST rate %"><Input type="number" value={editForm.gstRate} onChange={e => setEditForm({ ...editForm, gstRate: e.target.value })} /></Field>
              </div>
              {editErr && <p className="mt-2 text-[13px] text-neg">{editErr}</p>}
              <div className="mt-3 flex gap-2">
                <Button variant="primary" disabled={saving} onClick={saveAlter}>{saving ? lt('Saving…') : lt('Queue alter')}</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>{lt('Cancel')}</Button>
              </div>
            </Panel>
          )}
          <StatGrid cols={4} items={[
            { label: 'Closing qty', value: `${num(item.closing_qty)} ${item.unit || ''}`, sub: 'Current balance', tone: num(item.closing_qty) < 0 ? '#B14435' : '#181818' },
            { label: 'Rate', value: money(num(item.closing_rate)), sub: 'Closing rate', tone: '#3963E4' },
            { label: 'Value', value: mc(num(item.closing_value)), sub: 'Closing value', tone: '#3963E4' },
            { label: 'Reorder level', value: num(item.reorder_level), sub: 'Item master', tone: '#BB7836' },
          ]} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Item master"><KV label="Alias" value={item.alias || '—'} /><KV label="Unit" value={item.unit || '—'} /><KV label="Category" value={item.category || '—'} /><KV label="HSN" value={item.hsn || '—'} code /><KV label="GST rate" value={`${num(item.gst_rate)}%`} /><KV label="Expiry" value={item.expiry ? date(item.expiry) : '—'} /><KV label="Barcode" value={item.barcode || '—'} code /></Panel>
            <div className="space-y-4 xl:col-span-2">
              <Panel title="Godown-wise balance"><DataTable testid="item-godowns-table" rows={godowns} columns={[
                { key: 'warehouse', label: 'Warehouse', render: r => r.warehouse || r.name },
                { key: 'qty', label: 'Qty', align: 'right' }, { key: 'value', label: 'Value', align: 'right', render: r => money(num(r.value)) },
              ]} /></Panel>
              <Panel title="Stock ledger"><DataTable testid="item-ledger-table" rows={ledger} pageSize={6} columns={[
                { key: 'date', label: 'Date', render: r => date(r.date) },
                { key: 'voucherNumber', label: 'Voucher', render: r => r.voucherNumber || r.voucher_number },
                { key: 'voucherType', label: 'Type', render: r => r.voucherType || r.voucher_type },
                { key: 'warehouse', label: 'Warehouse' },
                { key: 'inward', label: 'In', align: 'right', render: r => r.inward || (r.type === 'inward' ? r.qty : '—') },
                { key: 'outward', label: 'Out', align: 'right', render: r => r.outward || (r.type === 'outward' ? r.qty : '—') },
              ]} /></Panel>
              <Panel title="Movements" sub="GET /api/stocks/items/:id/movements">
                <DataTable testid="item-movements-table" rows={movements} pageSize={6} emptyMessage="No movements" columns={[
                  { key: 'date', label: 'Date', render: r => date(r.date || r.voucher_date) },
                  { key: 'voucher_number', label: 'Voucher', render: r => r.voucher_number || r.voucherNumber || '—' },
                  { key: 'type', label: 'Type', render: r => r.type || r.movement_type || r.voucher_type || '—' },
                  { key: 'qty', label: 'Qty', align: 'right', render: r => r.qty ?? r.quantity ?? '—' },
                ]} />
              </Panel>
            </div>
          </div>
        </div>
      </Gate>
    </Drawer>
  );
}

/* ── Warehouses ───────────────────────────────────────────────────────────── */
export function Warehouses() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const [active, setActive] = useDrawerParam('warehouse');
  useRouteIdDrawer('/inventory/warehouses', 'warehouse');
  const state = useLive(async () => {
    if (!selectedCompany?.guid) throw new Error('Select a company to view warehouses.');
    return withIds(unwrapList(await api.fetchWarehouses(selectedCompany.guid)));
  }, [selectedCompany?.guid]);
  const rows = state.data || [];
  return (
    <Shell title="Warehouses" sub={<>{rows.length} {lt('godowns')}</>} testid="warehouses-page">
      <Gate state={state} empty={!rows.length}>
        <>
          <StatGrid items={[
            { label: 'Warehouses', value: rows.length, sub: 'Active godowns', tone: '#181818' },
            { label: 'Total quantity', value: rows.reduce((s, w) => s + num(w.total_qty), 0).toLocaleString('en-IN'), sub: 'Stock held', tone: '#3963E4' },
            { label: 'Distinct item lines', value: rows.reduce((s, w) => s + num(w.skus), 0), sub: 'Across godowns', tone: '#BB7836' },
            { label: 'Stock value', value: mc(rows.reduce((s, w) => s + num(w.value), 0)), sub: 'Where available', tone: '#3963E4' },
          ]} />
          <DataTable testid="warehouses-table" rows={rows} onRowClick={r => setActive(r.id)} columns={[
            { key: 'name', label: 'Warehouse', render: r => <span className="font-medium">{r.name}</span> },
            { key: 'code', label: 'Code' }, { key: 'parent', label: 'Parent' }, { key: 'address', label: 'Address' },
            { key: 'skus', label: 'Items', align: 'right' }, { key: 'total_qty', label: 'Quantity', align: 'right' },
          ]} />
          {active && <WarehousePanel id={active} onClose={() => setActive(null)} />}
        </>
      </Gate>
    </Shell>
  );
}

export function WarehousePanel({ id, onClose }) {
  const { date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const state = useLive(async () => responseData(await apiGet(queryPath(`/api/stocks/warehouses/${encodeURIComponent(id)}`, selectedCompany?.guid))), [selectedCompany?.guid, id]);
  const wh = state.data || {};
  const activity = withIds(wh.activity || wh.recent_activity || []);
  return (
    <Drawer open size="lg" eyebrow="Warehouse" onClose={onClose} testid="warehouse-panel" title={wh.name || 'Warehouse'} sub={<>{wh.parent || lt('Primary')} · {wh.address || lt('No address')}</>} footer={<Button onClick={onClose}>{lt('Close')}</Button>}>
      <Gate state={state} empty={!wh.name}>
        <div className="space-y-5">
          <StatGrid items={[{ label: 'Total quantity', value: num(wh.total_qty), sub: 'Current', tone: '#3963E4' }, { label: 'Items held', value: num(wh.skus), sub: 'Distinct items', tone: '#181818' }]} />
          <Panel title="Recent stock activity"><DataTable testid="warehouse-stock-table" rows={activity} columns={[
            { key: 'stock_name', label: 'Item' }, { key: 'date', label: 'Date', render: r => date(r.date) },
            { key: 'ref', label: 'Voucher' }, { key: 'direction', label: 'Movement' }, { key: 'qty', label: 'Qty', align: 'right' },
          ]} /></Panel>
        </div>
      </Gate>
    </Drawer>
  );
}

function useGet(path, params = {}) {
  const { selectedCompany, selectedFY } = useAuth();
  const guid = selectedCompany?.guid;
  return useLive(async () => {
    if (!guid) throw new Error('Select a company to view inventory.');
    return await apiGet(queryPath(path, guid, { fy: fyValue(selectedFY), ...params }));
  }, [guid, fyValue(selectedFY), JSON.stringify(params), path]);
}

/* ── Ledger, transfers and reports ────────────────────────────────────────── */
export function StockLedger() {
  const { money, date } = useFmt();
  const [item, setItem] = useState('All');
  const stocks = useStockItems();
  const state = useGet('/api/stocks/ledger', { item: item === 'All' ? '' : item, limit: 500 });
  const rows = withIds(unwrapList(state.data).length ? unwrapList(state.data) : responseData(state.data).items || []);
  return <Shell title="Stock Ledger" testid="stock-ledger-page"><Gate state={state} empty={!rows.length}>
    <>
      <Field label="Item" className="w-full sm:w-72"><Select data-testid="stock-ledger-item-select" value={item} onChange={e => setItem(e.target.value)}><option value="All">All items</option>{(stocks.data || []).map(i => <option key={i.id} value={i.name}>{i.name}</option>)}</Select></Field>
      <DataTable testid="stock-ledger-table" rows={rows} pageSize={14} columns={[
        { key: 'date', label: 'Date', render: r => date(r.date) }, { key: 'item', label: 'Item', render: r => r.item || r.itemName || r.stockName },
        { key: 'voucherNumber', label: 'Voucher', render: r => r.voucherNumber || r.voucher_number }, { key: 'voucherType', label: 'Type', render: r => r.voucherType || r.voucher_type },
        { key: 'warehouse', label: 'Warehouse' }, { key: 'inward', label: 'Inward', align: 'right' }, { key: 'outward', label: 'Outward', align: 'right' },
        { key: 'value', label: 'Value', align: 'right', render: r => money(num(r.value || r.amount)) },
      ]} />
    </>
  </Gate></Shell>;
}

export function Transfers() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useDrawerParam('transfer');
  useRouteIdDrawer('/inventory/transfers', 'transfer');
  const state = useGet('/api/stocks/transfer-history', { limit: 500 });
  const rows = withIds(unwrapList(state.data));
  return <Shell title="Stock Transfers" sub={<>{rows.length} {lt('transfers')} · {money(rows.reduce((s, r) => s + num(r.total_value || r.value), 0))} {lt('moved')}</>} testid="transfers-page">
    <Gate state={state} empty={!rows.length}>
      <>
        <StatGrid items={[{ label: 'Transfers', value: rows.length, sub: 'Selected FY', tone: '#181818' }, { label: 'Value moved', value: money(rows.reduce((s, r) => s + num(r.total_value || r.value), 0)), sub: 'Total', tone: '#3963E4' }]} />
        <DataTable testid="transfers-table" rows={rows} onRowClick={r => setActive(r.id)} columns={[
          { key: 'date', label: 'Date', render: r => date(r.date) }, { key: 'voucher_number', label: 'Reference' },
          { key: 'from', label: 'From', render: r => r.from || r.items?.[0]?.from_warehouse },
          { key: 'to', label: 'To', render: r => r.to || r.items?.[0]?.to_warehouse },
          { key: 'item_count', label: 'Lines', align: 'right' }, { key: 'total_value', label: 'Value', align: 'right', render: r => money(num(r.total_value)) },
        ]} />
        {active && <TransferPanel id={active} onClose={() => setActive(null)} />}
      </>
    </Gate>
  </Shell>;
}

export function TransferPanel({ id, onClose }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const state = useGet('/api/stocks/transfer-history', { limit: 500 });
  const t = withIds(unwrapList(state.data)).find(r => String(r.id) === String(id)) || {};
  const lines = withIds(t.items || t.lines || []);
  return <Drawer open size="lg" eyebrow="Stock transfer" onClose={onClose} testid="transfer-panel" title={t.voucher_number || 'Stock transfer'} sub={t.date ? date(t.date) : ''} footer={<Button onClick={onClose}>{lt('Close')}</Button>}>
    <Gate state={state} empty={!t.id}><Panel title="Lines" sub={<>{lines.length} {lt('item lines')}</>}><DataTable testid="transfer-lines-table" rows={lines} columns={[
      { key: 'item', label: 'Item' }, { key: 'from_warehouse', label: 'From' }, { key: 'to_warehouse', label: 'To' },
      { key: 'qty', label: 'Qty', align: 'right' }, { key: 'value', label: 'Value', align: 'right', render: r => money(num(r.value)) },
    ]} /></Panel></Gate>
  </Drawer>;
}

export function Adjustments() {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  useEffect(() => {
    let alive = true;
    if (!selectedCompany?.guid) { setState({ loading: false, error: '', rows: [] }); return; }
    setState(s => ({ ...s, loading: true, error: '' }));
    api.fetchStockAdjustments(selectedCompany.guid, { fromDate: selectedFY?.startDate, toDate: selectedFY?.endDate, pageSize: 200 })
      .then(res => { if (alive) setState({ loading: false, error: '', rows: withIds(unwrapList(res)) }); })
      .catch(err => { if (alive) setState({ loading: false, error: err?.message || lt('Unable to load adjustments'), rows: [] }); });
    return () => { alive = false; };
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  if (state.loading) return <Shell title="Stock Adjustments" testid="adjustments-page"><Card><div className="p-4"><Empty message="Loading…" /></div></Card></Shell>;
  if (state.error) return <Shell title="Stock Adjustments" testid="adjustments-page"><Card><Empty message="Could not load adjustments" hint={state.error} /></Card></Shell>;
  if (!state.rows.length) return <Shell title="Stock Adjustments" sub="Stock journal vouchers from Tally" testid="adjustments-page"><Card><Empty message="No stock adjustments" hint="No stock journal vouchers were found for the selected financial year." /></Card></Shell>;
  return <Shell title="Stock Adjustments" sub="Stock journal vouchers from Tally" testid="adjustments-page">
    <DataTable testid="adjustments-table" rows={state.rows} pageSize={14} columns={[
      { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
      { key: 'voucher_number', label: 'Voucher No.' },
      { key: 'voucher_type', label: 'Type' },
      { key: 'narration', label: 'Narration' },
      { key: 'amount', label: 'Value', align: 'right', render: r => money(num(r.amount)) },
    ]} />
  </Shell>;
}

export function OnHandStock() {
  const { money } = useFmt();
  const state = useStockItems();
  const rows = state.data || [];
  return <Shell title="On-hand Stock" testid="on-hand-page"><Gate state={state} empty={!rows.length}><DataTable testid="on-hand-table" rows={rows} pageSize={14} columns={[
    { key: 'name', label: 'Item' }, { key: 'primary_warehouse', label: 'Warehouse' }, { key: 'category', label: 'Category' },
    { key: 'closing_qty', label: 'On hand', align: 'right', render: r => `${num(r.closing_qty)} ${r.unit || ''}` },
    { key: 'closing_value', label: 'Value', align: 'right', render: r => money(num(r.closing_value)) },
  ]} /></Gate></Shell>;
}

export function NegativeStock() {
  const { money } = useFmt();
  const state = useGet('/api/stocks/negative-stock', { limit: 500 });
  const d = responseData(state.data);
  const rows = withIds(d.items || unwrapList(state.data));
  return <Shell title="Negative Stock" sub="Items showing a negative balance" testid="negative-stock-page"><Gate state={state} empty={!rows.length}><DataTable testid="negative-stock-table" rows={rows} columns={[
    { key: 'itemName', label: 'Item', render: r => r.displayName || r.itemName || r.name },
    { key: 'warehouses', label: 'Warehouse', render: r => r.warehouse || r.warehouses?.map(w => w.warehouse).join(', ') },
    { key: 'closingQty', label: 'Balance', align: 'right', render: r => <span className="text-neg font-medium">{num(r.closingQty ?? r.closing_qty)} {r.unit}</span> },
    { key: 'closingValue', label: 'Value', align: 'right', render: r => money(num(r.closingValue ?? r.closing_value)) },
    { key: 'priority', label: 'Priority', render: r => <Status value={r.priority} /> },
  ]} /></Gate></Shell>;
}

export function AgedItems() {
  const { money } = useFmt();
  const state = useGet('/api/stocks/aged-items', { limit: 500 });
  const rows = withIds(unwrapList(state.data));
  const bucket = r => r.bucket || r.age_bucket || (num(r.ageing_days || r.days_since_movement) > 180 ? '180+' : `${Math.floor(num(r.ageing_days || r.days_since_movement) / 30) * 30}-${Math.floor(num(r.ageing_days || r.days_since_movement) / 30) * 30 + 30}`);
  return <Shell title="Aged Items" sub="Stock ageing by days since last movement" testid="aged-items-page"><Gate state={state} empty={!rows.length}><DataTable testid="aged-items-table" rows={rows} pageSize={14} columns={[
    { key: 'name', label: 'Item', render: r => r.displayName || r.name || r.itemName }, { key: 'category', label: 'Category' },
    { key: 'ageing_days', label: 'Age (days)', align: 'right', render: r => r.ageing_days ?? r.days_since_movement },
    { key: 'bucket', label: 'Bucket', render: r => <Pill>{bucket(r)}</Pill> },
    { key: 'closing_qty', label: 'Qty', align: 'right' }, { key: 'closing_value', label: 'Value', align: 'right', render: r => money(num(r.closing_value || r.value)) },
  ]} /></Gate></Shell>;
}

export function FastSlow() {
  const { money } = useFmt();
  const [tab, setTab] = useState('Fast moving');
  const state = useGet('/api/stocks/fast-slow');
  const d = responseData(state.data);
  const rows = withIds(tab === 'Fast moving' ? d.fast || [] : d.slow || []);
  return <Shell title="Fast / Slow Moving" sub="Ranked by stock turnover ratio" testid="fast-slow-page"><Gate state={state} empty={!rows.length && !(d.fast?.length || d.slow?.length)}>
    <><Tabs tabs={['Fast moving', 'Slow moving']} value={tab} onChange={setTab} testid="fast-slow-tabs" /><DataTable testid="fast-slow-table" rows={rows} columns={[
      { key: 'name', label: 'Item', render: r => r.displayName || r.name || r.itemName }, { key: 'category', label: 'Category' },
      { key: 'rank', label: 'Rank', align: 'right' },
      { key: 'total_outward_qty', label: 'Sold qty', align: 'right' }, { key: 'closing_qty', label: 'On hand', align: 'right' },
      { key: 'closing_value', label: 'Value', align: 'right', render: r => money(num(r.closing_value || r.total_value)) },
    ]} /></>
  </Gate></Shell>;
}

export function ReorderQueue() {
  const { selectedCompany, selectedFY } = useAuth();
  const state = useLive(async () => api.fetchStocks({ companyGuid: selectedCompany?.guid, page: 1, pageSize: 1000, lowStockOnly: true, fy: fyValue(selectedFY) }), [selectedCompany?.guid, fyValue(selectedFY)]);
  const rows = withIds(unwrapList(state.data));
  return <Shell title="Reorder Queue" sub="Items at or below their reorder level" testid="reorder-queue-page"><Gate state={state} empty={!rows.length}><DataTable testid="reorder-queue-table" rows={rows} columns={[
    { key: 'name', label: 'Item' }, { key: 'closing_qty', label: 'On hand', align: 'right' }, { key: 'reorder_level', label: 'Reorder at', align: 'right' },
    { key: 'minimum_order_qty', label: 'Minimum order', align: 'right' }, { key: 'unit', label: 'Unit' },
  ]} /></Gate></Shell>;
}

export function MovementAnalytics() {
  const { money, mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const state = useGet('/api/stocks/movement-analytics');
  const rows = withIds(unwrapList(state.data));
  const [chart, setChart] = useState([]);
  useEffect(() => {
    const guid = selectedCompany?.guid;
    if (!guid) return;
    api.fetchMovementAnalyticsChart(guid, {
      from: selectedFY?.startDate, to: selectedFY?.endDate, fy: fyValue(selectedFY),
    }).then((res) => {
      const series = res?.data?.series || res?.series || unwrapList(res);
      setChart(withIds(Array.isArray(series) ? series : []));
    }).catch(() => setChart([]));
  }, [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  return <Shell title="Movement Analytics" sub="Inward, outward and value trends" testid="movement-analytics-page"><Gate state={state} empty={!rows.length && !chart.length}>
    {chart.length > 0 && (
      <Panel title={lt('Movement chart')} sub="GET /api/stocks/movement-analytics/chart">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="2 5" stroke="rgba(26,26,26,0.07)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => mc(v)} width={56} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => money(v)} />
            <Bar dataKey="inward" name={lt('Inward')} fill="#447B4B" maxBarSize={18} />
            <Bar dataKey="outward" name={lt('Outward')} fill="#B14435" maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    )}
    <DataTable testid="movement-table" rows={rows} pageSize={14} columns={[
      { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'outward_qty', label: 'Outward', align: 'right' },
      { key: 'closing_qty', label: 'On hand', align: 'right' }, { key: 'tr', label: 'Turnover', align: 'right' },
      { key: 'outward_value', label: 'Value moved', align: 'right', render: r => money(num(r.outward_value)) },
    ]} />
  </Gate></Shell>;
}

export function ValuationSummary() {
  const { money } = useFmt();
  const state = useGet('/api/stocks/snapshot');
  const d = responseData(state.data);
  const rows = withIds(d.warehouses || []);
  return <Shell title="Valuation Summary" sub="Closing stock value by warehouse and method" testid="valuation-page"><Gate state={state} empty={!rows.length}><DataTable testid="valuation-table" rows={rows} columns={[
    { key: 'warehouse', label: 'Warehouse' }, { key: 'skus', label: 'Items', align: 'right' },
    { key: 'opening_value', label: 'Opening value', align: 'right', render: r => money(num(r.opening_value)) },
    { key: 'closing_value', label: 'Closing value', align: 'right', render: r => money(num(r.closing_value)) },
  ]} /></Gate></Shell>;
}

export function ExpirySchedule() {
  const { money, date } = useFmt();
  const state = useGet('/api/stocks/expiry-schedule', { limit: 500 });
  const d = responseData(state.data);
  const rows = withIds(d.items || unwrapList(state.data));
  return <Shell title="Expiry Schedule" sub="Batch-wise expiry with days remaining" testid="expiry-page"><Gate state={state} empty={!rows.length}><DataTable testid="expiry-table" rows={rows} pageSize={14} columns={[
    { key: 'item', label: 'Item' }, { key: 'batch', label: 'Batch' },
    { key: 'warehouse', label: 'Warehouse' }, { key: 'expiryDate', label: 'Expiry', render: r => r.expiryDate === '—' ? '—' : date(r.expiryDate) },
    { key: 'daysLeft', label: 'Days left', align: 'right' }, { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'value', label: 'Value', align: 'right', render: r => typeof r.value === 'string' ? r.value : money(num(r.value)) },
  ]} /></Gate></Shell>;
}

export function StockSnapshot() {
  const { money } = useFmt();
  const { selectedFY } = useAuth();
  const [asOn, setAsOn] = useState(selectedFY?.endDate || todayLocalISO());
  const state = useGet('/api/stocks/snapshot', { asOn });
  const d = responseData(state.data);
  const rows = withIds(d.warehouses || []);
  return <Shell title="Stock Snapshot" sub="Point-in-time portfolio position" testid="snapshot-page">
    <Field label="As on date" className="w-full sm:w-56"><Input type="date" data-testid="snapshot-date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
    <Gate state={state} empty={!rows.length}><DataTable testid="snapshot-table" rows={rows} columns={[
      { key: 'warehouse', label: 'Warehouse' }, { key: 'skus', label: 'Items', align: 'right' },
      { key: 'opening_value', label: 'Opening value', align: 'right', render: r => money(num(r.opening_value)) },
      { key: 'closing_value', label: 'Closing value', align: 'right', render: r => money(num(r.closing_value)) },
    ]} /></Gate>
  </Shell>;
}

/* ── Barcodes, labels, print ──────────────────────────────────────────────── */
const SYNC_LABEL = { synced: 'Synced', pending: 'Pending', failed: 'Failed' };

function LinkBarcodeModal({ open, onClose, items, onLink, busy }) {
  const lt = useLabelT();
  const [stockGuid, setStockGuid] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => { if (open) { setStockGuid(''); setCode(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Link barcode" sub="Attach an existing barcode to a stock item" testid="link-barcode-modal"
      footer={<><Button onClick={onClose}>{lt('Cancel')}</Button><Button variant="primary" data-testid="link-barcode-submit" disabled={!stockGuid || !code.trim() || busy} onClick={() => onLink(stockGuid, code.trim())}>{busy ? lt('Linking…') : lt('Link barcode')}</Button></>}>
      <div className="space-y-4">
        <Field label="Stock item">
          <Select value={stockGuid} onChange={e => setStockGuid(e.target.value)} data-testid="link-barcode-item">
            <option value="">{lt('Select item')}</option>
            {items.map(i => <option key={i.stockGuid} value={i.stockGuid}>{i.displayName || i.name}</option>)}
          </Select>
        </Field>
        <Field label="Barcode" hint="Scan with the gun or type the code">
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="8901234567890" data-testid="link-barcode-code" />
        </Field>
      </div>
    </Modal>
  );
}

function ImportBarcodesModal({ open, onClose, onImport, busy, result }) {
  const lt = useLabelT();
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Import barcodes" sub="One line per item: item name, barcode" testid="import-barcodes-modal"
      footer={<><Button onClick={onClose}>{result ? lt('Close') : lt('Cancel')}</Button><Button variant="primary" data-testid="import-barcodes-submit" disabled={!text.trim() || busy} onClick={() => onImport(text)}>{busy ? lt('Importing…') : lt('Import')}</Button></>}>
      <div className="space-y-3">
        <Textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={'Ceiling Fan 1200mm, 8901234567890\nCopper Wire 90m, 8901234567891'} data-testid="import-barcodes-text" />
        {result && (
          <p className="text-[13px] text-ink-soft" data-testid="import-barcodes-result">
            {lt('Imported')} {result.imported} · {lt('Duplicates')} {result.duplicates} · {lt('Invalid')} {result.invalid} · {lt('Needs review')} {result.needsReview}
          </p>
        )}
      </div>
    </Modal>
  );
}

function BarcodeSettingsModal({ open, onClose, companyGuid, onSaved }) {
  const lt = useLabelT();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !companyGuid) return;
    setS(null); setError('');
    api.fetchBarcodeSettings(companyGuid)
      .then(res => setS(res?.data || res))
      .catch(e => setError(e?.message || 'Could not load settings'));
  }, [open, companyGuid]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.updateBarcodeSettings(companyGuid, s);
      onSaved?.();
      onClose();
    } catch (e) { setError(e?.message || 'Could not save settings'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Barcode settings" sub="How barcodes are stored and synced to Tally" testid="barcode-settings-modal"
      footer={<><Button onClick={onClose}>{lt('Cancel')}</Button><Button variant="primary" data-testid="barcode-settings-save" disabled={!s || busy} onClick={save}>{busy ? lt('Saving…') : lt('Save changes')}</Button></>}>
      {error && <p className="mb-3 text-[13px] text-[#B14435]">{error}</p>}
      {!s && !error && <p className="text-[13px] text-ink-faint">{lt('Loading…')}</p>}
      {s && (
        <div className="space-y-4">
          <Field label="Storage mode" hint="Where the barcode lives inside Tally">
            <Select value={s.barcodeStorageMode} onChange={e => setS({ ...s, barcodeStorageMode: e.target.value })} data-testid="barcode-storage-mode">
              <option value="app_only">{lt('App only')}</option>
              <option value="tally_alias">{lt('Tally alias')}</option>
              <option value="tally_part_number">{lt('Tally part number')}</option>
              <option value="tally_udf">{lt('Tally UDF')}</option>
            </Select>
          </Field>
          <Field label="Default barcode type">
            <Select value={s.defaultBarcodeType} onChange={e => setS({ ...s, defaultBarcodeType: e.target.value })} data-testid="barcode-default-type">
              {['CODE128', 'EAN13', 'EAN8', 'UPC', 'QR', 'INTERNAL'].map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <SettingRow title="Auto-sync to Tally" desc="Push new barcodes to Tally automatically" testid="barcode-auto-sync-row">
            <Toggle checked={!!s.autoSyncToTally} onChange={v => setS({ ...s, autoSyncToTally: v })} testid="barcode-auto-sync" />
          </SettingRow>
        </div>
      )}
    </Modal>
  );
}

export function Barcodes() {
  const navigate = useNavigate();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const [statusFilter, setStatusFilter] = useState('All');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(''); // '' | 'all' | 'sync' | 'link' | 'import' | guid of row being generated
  const [note, setNote] = useState('');
  const [modal, setModal] = useState(null); // null | 'link' | 'import' | 'settings'
  const [importResult, setImportResult] = useState(null);
  const [settings, setSettings] = useState({ barcodeStorageMode: 'app_only', defaultBarcodeType: 'CODE128', autoSyncToTally: false });
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(() => {
    if (!guid) return;
    api.fetchBarcodeSettings(guid).then(res => { const s = res?.data || res; if (s?.barcodeStorageMode) setSettings(s); }).catch(() => {});
  }, [guid, settingsTick]);
  // Same convention as mobile: syncTarget follows the saved storage mode.
  const genOpts = { barcodeType: settings.defaultBarcodeType, syncTarget: settings.barcodeStorageMode };

  const state = useLive(async () => {
    if (!guid) throw new Error('Select a company to view inventory.');
    const res = await api.fetchBarcodesList(guid, { status: statusFilter, page: 1, pageSize: 200 });
    return res?.data || {};
  }, [guid, statusFilter, refresh]);
  const d = state.data || {};
  // An item can carry multiple barcode rows — key by barcode mapping id first, else stockGuid.
  const rows = (d.items || []).map((r, i) => ({ ...r, id: r.barcodeId || (r.barcode ? `${r.stockGuid}-${r.barcode}` : r.stockGuid) || `${i}` }));
  const summary = d.summary || {};
  const statuses = d.filters?.statuses?.length ? d.filters.statuses : ['All', 'Linked', 'Unlinked', 'Pending Tally Sync'];
  const reload = () => setRefresh(n => n + 1);

  const run = async (key, fn, okNote) => {
    setBusy(key); setNote('');
    try {
      const res = await fn();
      setNote(okNote(res?.data || res));
      reload();
    } catch (e) { setNote(e?.message || lt('Something went wrong')); }
    setBusy('');
  };

  const generateOne = r => run(r.stockGuid, () => api.generateBarcode(guid, r.stockGuid, genOpts), x => `${lt('Generated')} ${x.barcode || ''}`);
  const generateAll = () => run('all', () => api.generateBarcodesBulk(guid, { all: true, ...genOpts }), x => `${x.generated ?? 0} ${lt('generated')}${x.errors ? ` · ${x.errors} ${lt('errors')}` : ''}`);
  const startBulkJob = () => run('job', async () => {
    const started = await api.startBulkBarcodeJob(guid, { all: true, ...genOpts });
    const jobId = started?.data?.jobId || started?.jobId || started?.data?.id;
    if (!jobId) return started;
    let status = started;
    for (let i = 0; i < 20; i += 1) {
      await new Promise(r => setTimeout(r, 800));
      status = await api.fetchBulkBarcodeJobStatus(jobId, guid);
      const st = status?.data?.status || status?.status;
      if (st === 'done' || st === 'completed' || st === 'failed' || st === 'error') break;
    }
    return status;
  }, x => {
    const d = x?.data || x || {};
    return d.message || `${d.generated ?? d.progress ?? 0} ${lt('via bulk job')}`;
  });
  const downloadTemplate = () => run('template', async () => {
    const csv = await api.downloadBarcodeTemplate(guid);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'barcode-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }, () => lt('Template downloaded'));
  const syncNow = () => run('sync', () => api.pushPendingBarcodes(guid), x => x.message || `${x.synced ?? 0} ${lt('synced')}`);
  const doLink = (stockGuid, code) => run('link', async () => {
    const res = await api.linkBarcode(guid, stockGuid, code, genOpts);
    setModal(null);
    return res;
  }, () => lt('Barcode linked'));
  const doImport = text => run('import', async () => {
    const res = await api.bulkImportBarcodes(guid, text);
    setImportResult((res?.data || res)?.summary || null);
    return res;
  }, x => `${x?.summary?.imported ?? 0} ${lt('imported')}`);

  const locked = busy !== ''; // one barcode mutation at a time — avoids conflicting writes
  return <Shell title="Barcodes" sub="Generate, link and sync barcodes for stock items" testid="barcodes-page" actions={<>
    <Button data-testid="barcode-settings-button" disabled={locked} onClick={() => setModal('settings')}>{lt('Settings')}</Button>
    <Button data-testid="barcode-template-button" disabled={locked} onClick={downloadTemplate}>{busy === 'template' ? lt('Downloading…') : lt('CSV template')}</Button>
    <Button data-testid="barcode-import-button" disabled={locked} onClick={() => { setImportResult(null); setModal('import'); }}>{lt('Import')}</Button>
    <Button data-testid="barcode-link-button" disabled={locked} onClick={() => setModal('link')}>{lt('Link barcode')}</Button>
    <Button data-testid="barcode-sync-button" disabled={locked} onClick={syncNow}>{busy === 'sync' ? lt('Syncing…') : lt('Sync to Tally')}</Button>
    <Button data-testid="barcode-generate-all" disabled={locked} onClick={generateAll}>{busy === 'all' ? lt('Generating…') : lt('Generate all missing')}</Button>
    <Button data-testid="barcode-bulk-job" disabled={locked} onClick={startBulkJob}>{busy === 'job' ? lt('Job running…') : lt('Bulk job')}</Button>
    <Button variant="primary" data-testid="barcode-print-button" onClick={() => navigate('/inventory/print-barcodes')}><Printer size={13} /> {lt('Print barcodes')}</Button>
  </>}>
    <StatGrid cols={4} items={[
      { label: 'Total items', value: summary.totalItems ?? 0 },
      { label: 'Linked', value: summary.linked ?? 0, tone: '#447B4B' },
      { label: 'Unlinked', value: summary.unlinked ?? 0, tone: '#BB7836' },
      { label: 'Pending Tally sync', value: summary.pendingTallySync ?? 0, tone: '#B14435' },
    ]} />
    {note && <p className="text-[13px] text-ink-soft" data-testid="barcodes-note">{note}</p>}
    <Chips options={statuses} value={statusFilter} onChange={setStatusFilter} testid="barcodes-status-chips" />
    <Gate state={state} empty={!rows.length}>
      <DataTable testid="barcodes-table" rows={rows} pageSize={14} columns={[
        { key: 'displayName', label: 'Item', render: r => <span className="font-medium">{r.displayName || r.name}</span> },
        { key: 'sku', label: 'SKU' },
        { key: 'barcode', label: 'Barcode', render: r => r.barcode ? <span className="mono text-[12px]">{r.barcode}</span> : <span className="text-ink-faint">—</span> },
        { key: 'barcodeType', label: 'Type', render: r => r.barcodeType || '—' },
        { key: 'currentQty', label: 'Qty', align: 'right' },
        { key: 'tallySyncStatus', label: 'Tally sync', render: r => r.barcode ? <Status value={SYNC_LABEL[r.tallySyncStatus] || 'OK'} /> : <span className="text-ink-faint">—</span> },
        { key: 'act', label: '', sortable: false, render: r => r.barcode
          ? <Button data-testid={`barcode-label-${r.stockGuid}`} onClick={() => navigate(`/inventory/label-preview?item=${encodeURIComponent(r.name)}`)}><QrCode size={12} /> {lt('Label')}</Button>
          : <Button data-testid={`barcode-generate-${r.stockGuid}`} disabled={locked} onClick={() => generateOne(r)}>{busy === r.stockGuid ? lt('Generating…') : lt('Generate')}</Button> },
      ]} />
    </Gate>
    <LinkBarcodeModal open={modal === 'link'} onClose={() => setModal(null)} items={rows.filter(r => !r.barcode)} onLink={doLink} busy={busy === 'link'} />
    <ImportBarcodesModal open={modal === 'import'} onClose={() => setModal(null)} onImport={doImport} busy={busy === 'import'} result={importResult} />
    <BarcodeSettingsModal open={modal === 'settings'} onClose={() => setModal(null)} companyGuid={guid} onSaved={() => { setSettingsTick(n => n + 1); reload(); }} />
  </Shell>;
}

export function PrintBarcodes() {
  const navigate = useNavigate();
  const lt = useLabelT();
  const state = useStockItems();
  const rows = state.data || [];
  const [selected, setSelected] = useState([]);
  const [copies, setCopies] = useState(2);
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const selectedRows = rows.filter(r => selected.includes(r.id));
  const printSelected = () => {
    selectedRows.forEach(r => {
      printLabels({ itemName: r.name, barcode: r.barcode || r.guid, copies });
    });
  };
  const downloadSelected = async () => {
    for (const r of selectedRows) {
      await downloadLabelsPdf({ itemName: r.name, barcode: r.barcode || r.guid, copies });
    }
  };
  return <Shell title="Print Barcodes" sub={<>{selected.length} {lt('items selected')} · {selected.length * copies} {lt('labels')}</>} testid="print-barcodes-page" actions={<>
    <Button onClick={() => navigate('/inventory/label-preview')}>{lt('Preview label')}</Button>
    <Button disabled={!selectedRows.length} onClick={downloadSelected} data-testid="download-labels-pdf">{lt('Download PDF')}</Button>
    <Button variant="primary" data-testid="print-now-button" disabled={!selectedRows.length} onClick={printSelected}><Printer size={13} /> {lt('Print now')}</Button>
  </>}>
    <Field label="Copies per item" className="w-36"><Input type="number" min="1" value={copies} onChange={e => setCopies(num(e.target.value))} /></Field>
    <Gate state={state} empty={!rows.length}><DataTable testid="print-items-table" rows={rows} columns={[
      { key: 'select', label: '', sortable: false, render: r => <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /> },
      { key: 'name', label: 'Item' }, { key: 'barcode', label: 'Barcode' }, { key: 'closing_qty', label: 'Qty', align: 'right' },
    ]} /></Gate>
  </Shell>;
}

export function LabelPreview() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const state = useStockItems();
  const [params] = useSearchParams();
  const wanted = params.get('item');
  const item = (wanted && state.data?.find(r => r.name === wanted)) || state.data?.[0];
  const [label, setLabel] = useState(null);
  useEffect(() => {
    const guid = selectedCompany?.guid;
    const stockGuid = item?.guid || item?.stockGuid || item?.id;
    if (!guid || !stockGuid) { setLabel(null); return; }
    api.fetchBarcodesByGuids(guid, [stockGuid])
      .then(res => {
        const rows = unwrapList(res);
        const first = rows[0] || res?.data?.[0] || res?.data?.items?.[0];
        setLabel(first || null);
      })
      .catch(() => setLabel(null));
  }, [selectedCompany?.guid, item?.guid, item?.stockGuid, item?.id]);
  const barcode = label?.barcode || item?.barcode || item?.guid;
  const name = label?.displayName || label?.name || item?.name;
  return (
    <Shell title="Label Preview" sub="POST /api/inventory/barcodes/by-guids" testid="label-preview-page" actions={<>
      <Button disabled={!barcode} onClick={() => printLabels({ itemName: name, barcode, barcodeType: label?.barcodeType })} data-testid="label-print-btn"><Printer size={13} /> {lt('Print')}</Button>
      <Button variant="primary" disabled={!barcode} onClick={() => downloadLabelsPdf({ itemName: name, barcode })} data-testid="label-pdf-btn">{lt('Download PDF')}</Button>
    </>}>
      <Gate state={state} empty={!item}>
        <Card>
          <div className="mx-auto max-w-xs border-2 border-ink p-5 text-center">
            <b>{name}</b>
            <div className="my-4 text-3xl tracking-[.25em]">||||||||</div>
            <div className="tabular">{barcode}</div>
            {label?.barcodeType && <p className="mt-2 text-[11px] text-ink-soft">{lt(label.barcodeType)}</p>}
          </div>
        </Card>
      </Gate>
    </Shell>
  );
}

export function PrintSettings() {
  const [s, setS] = useState({ size: '50 × 25 mm', dpi: '203', gap: '2', showPrice: true, showHsn: true, showCompany: true });
  return <Shell title="Print Settings" testid="print-settings-page"><Card>
    <SettingRow title="Label size"><Select className="w-44" value={s.size} onChange={e => setS({ ...s, size: e.target.value })}>{['50 × 25 mm', '40 × 20 mm', '100 × 50 mm'].map(o => <option key={o}>{o}</option>)}</Select></SettingRow>
    <SettingRow title="Printer DPI"><Select className="w-44" value={s.dpi} onChange={e => setS({ ...s, dpi: e.target.value })}>{['203', '300', '600'].map(o => <option key={o}>{o}</option>)}</Select></SettingRow>
    <SettingRow title="Gap between labels (mm)"><Input className="w-24" type="number" value={s.gap} onChange={e => setS({ ...s, gap: e.target.value })} /></SettingRow>
    <SettingRow title="Print selling price"><Toggle checked={s.showPrice} onChange={v => setS({ ...s, showPrice: v })} testid="toggle-price" /></SettingRow>
    <SettingRow title="Print HSN code"><Toggle checked={s.showHsn} onChange={v => setS({ ...s, showHsn: v })} testid="toggle-hsn" /></SettingRow>
    <SettingRow title="Print company name"><Toggle checked={s.showCompany} onChange={v => setS({ ...s, showCompany: v })} testid="toggle-company" /></SettingRow>
  </Card></Shell>;
}

export function StockReports() {
  const { mc } = useFmt();
  const { selectedCompany } = useAuth();
  const state = useLive(async () => {
    if (!selectedCompany?.guid) throw new Error('Select a company to view reports.');
    return responseData(await api.fetchStockSummary(selectedCompany.guid));
  }, [selectedCompany?.guid]);
  const d = state.data || {};
  return <Shell title="Stock Reports" sub="Every inventory report now lives in the rail on the left" testid="stock-reports-page"><Gate state={state} empty={!d.totalItems && !d.totalValue}><StatGrid items={[
    { label: 'Stock value', value: mc(num(d.totalValue)), sub: 'Closing valuation', tone: '#3963E4' }, { label: 'Items', value: num(d.totalItems), sub: 'Stock masters', tone: '#181818' },
    { label: 'Below reorder', value: num(d.lowStock), sub: 'Needs purchase', tone: '#BB7836' }, { label: 'Out of stock', value: num(d.outOfStock), sub: 'Reconcile', tone: '#B14435' },
  ]} /></Gate></Shell>;
}

export function StockSettings() {
  const { selectedCompany } = useAuth();
  const lt = useLabelT();
  const state = useGet('/api/inventory/settings');
  const initial = responseData(state.data);
  const [s, setS] = useState({ valuation: 'FIFO', negative: false, batch: false, expiry: false });
  useEffect(() => {
    if (state.data) setS(v => ({ ...v, ...initial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);
  return <Shell title="Stock Settings" sub={<>{lt('Inventory behaviour for')} {selectedCompany?.name || lt('this company')}</>} testid="stock-settings-page"><Gate state={state} empty={false}><Card>
    <SettingRow title="Valuation method"><Select className="w-44" data-testid="valuation-select" value={s.valuation || s.valuation_method || 'FIFO'} onChange={e => setS({ ...s, valuation: e.target.value })}>{['FIFO', 'LIFO', 'Avg. Cost', 'Std. Cost'].map(o => <option key={o}>{o}</option>)}</Select></SettingRow>
    <SettingRow title="Allow negative stock"><Toggle checked={Boolean(s.negative ?? s.allow_negative_stock)} onChange={v => setS({ ...s, negative: v })} testid="toggle-negative" /></SettingRow>
    <SettingRow title="Maintain batches"><Toggle checked={Boolean(s.batch ?? s.maintain_batches)} onChange={v => setS({ ...s, batch: v })} testid="toggle-batch" /></SettingRow>
    <SettingRow title="Track expiry dates"><Toggle checked={Boolean(s.expiry ?? s.track_expiry)} onChange={v => setS({ ...s, expiry: v })} testid="toggle-expiry" /></SettingRow>
    <p className="pt-3 text-xs text-ink-soft">{lt('Settings are read from the live company. Saving requires the inventory settings write contract.')}</p>
  </Card></Gate></Shell>;
}