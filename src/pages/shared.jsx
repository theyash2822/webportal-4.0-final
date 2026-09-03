// Shared page helpers: data hooks, voucher tables, detail drawers, create modals.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import {
  DataTable, Drawer, Modal, Button, Field, Input, Select, Textarea, KV, Status, Pill, Panel, Empty, StatGrid, useLabelT,
} from '../components/kit';
import api from '../services/api';
import { useOpenCreate } from '../components/create/CreateDrawer';
import { emptyLine } from '../components/create/common';
import { buildInvoiceHTML, printInvoice } from '../utils/invoicePrint';

export function useFmt() {
  const { formatAmount, formatAmountCompact, formatDate } = useSettings();
  return {
    money: n => formatAmount(Number(n) || 0),
    mc: n => formatAmountCompact(Number(n) || 0),
    date: formatDate,
  };
}

export function useCompanyMeta() {
  const { selectedCompany, selectedFY } = useAuth();
  const lt = useLabelT();
  const company = selectedCompany;
  const fy = selectedFY?.name || '';
  return { company, fy, subtitle: `${company?.name || lt('No company selected')}${fy ? ` · ${lt('FY')} ${fy}` : ''}` };
}

export function useFY() {
  const { selectedFY } = useAuth();
  return {
    fy: selectedFY,
    rows: rows => rows || [],
    scale: 1,
  };
}

/* ── Bulk selection + share (sales/purchase registers) ────────────────────── */
export const voucherRowKey = r => r.id ?? r.guid ?? `${r.voucher_number}-${r.date}`;

/** Tally voucher id for GET /api/vouchers/:id — skip synthetic list keys from normalizeRows. */
export function resolveVoucherApiId(row) {
  if (!row) return '';
  const guid = row.guid || row.voucher_guid || row.voucherGuid;
  if (guid) return String(guid);
  const vn = String(row.voucher_number || row.voucherNumber || row.number || '');
  const id = row.id != null ? String(row.id) : '';
  if (id && vn && new RegExp(`^${vn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(id)) return vn || id;
  if (id) return id;
  return vn;
}

/** TDK ref for GET /tally/invoice/:ref/preview — mirrors mobile register rows. */
export function resolveTdkRef(row) {
  if (!row) return '';
  const direct = row.tdk_reference_no || row.tdkReferenceNo || row.tdk_ref;
  if (direct) return String(direct);
  const ref = String(row.reference || '');
  if (/^TDK-/i.test(ref)) return ref;
  const num = String(row.voucher_number || row.voucherNumber || '');
  if (/^TD[\d-]/i.test(num)) return num;
  return '';
}

export function useVoucherSelection() {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const toggleRow = useCallback(row => {
    const key = voucherRowKey(row);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const toggleAll = useCallback(visibleRows => {
    setSelectedKeys(prev => {
      const keys = visibleRows.map(voucherRowKey);
      const allSelected = keys.length > 0 && keys.every(k => prev.has(k));
      const next = new Set(prev);
      keys.forEach(k => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelectedKeys(new Set()), []);
  return { selectedKeys, toggleRow, toggleAll, clear };
}

const csvCell = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Action bar shown while rows are selected: share the batch on WhatsApp or download a CSV. */
export function BulkActionBar({ rows, selectedKeys, onClear, onToggleAll, docLabel = 'invoices', testid = 'bulk-action-bar' }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { t } = useTranslation();
  const { selectedCompany } = useAuth();
  const [pdfBusy, setPdfBusy] = useState('');
  const [pdfNote, setPdfNote] = useState('');
  const selected = (rows || []).filter(r => selectedKeys.has(voucherRowKey(r)));
  useEffect(() => {
    if (!selected.length) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClear?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected.length, onClear]);
  if (!selected.length) return null;

  const buildSummary = () => {
    const lines = selected.map(r =>
      `• ${r.voucher_number || '—'} · ${date(r.date)}${r.party_name ? ` · ${r.party_name}` : ''} · ${money(r.party_amount ?? r.amount)}`
    );
    const total = selected.reduce((s, r) => s + (Number(r.party_amount ?? r.amount) || 0), 0);
    return [
      `*${selected.length} ${lt(docLabel)}*`,
      selectedCompany?.name,
      '',
      ...lines,
      '',
      `${lt('Total')}: ${money(total)}`,
    ].filter(l => l !== null && l !== undefined).join('\n');
  };

  const buildPdf = async (mode) => {
    setPdfBusy(mode); setPdfNote('');
    try {
      const { buildInvoicesPdf, downloadBlob, sharePdfOrDownload } = await import('../services/invoicePdf');
      const { blob, filename, failures } = await buildInvoicesPdf({
        rows: selected,
        companyGuid: selectedCompany?.guid,
        docLabel,
        onProgress: (i, n) => setPdfNote(t('portal.labels.preparing-invoice-i-of-n', 'Preparing invoice {{i}} of {{n}}…', { i, n })),
      });
      if (mode === 'share') {
        const outcome = await sharePdfOrDownload({ blob, filename, text: buildSummary() });
        setPdfNote(outcome === 'downloaded'
          ? lt('PDF downloaded — attach it in WhatsApp to send the invoices.')
          : '');
      } else {
        downloadBlob(blob, filename);
        setPdfNote('');
      }
      if (failures.length) setPdfNote(`${lt('Could not include')}: ${failures.join(', ')}`);
    } catch (e) {
      setPdfNote(e.message || lt('Failed to generate PDF'));
    } finally {
      setPdfBusy('');
    }
  };

  const shareWhatsApp = () => buildPdf('share');

  const download = () => {
    const header = ['Date', 'Voucher No.', 'Party', 'Amount', 'Status'].map(lt);
    const body = selected.map(r => [
      date(r.date), r.voucher_number || '', r.party_name || '',
      Number(r.party_amount ?? r.amount) || 0,
      r.is_cancelled ? 'Cancelled' : r.status || '',
    ].map(csvCell).join(','));
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(docLabel || 'invoices').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-testid={testid}
      className="flex w-full max-w-[760px] flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(26,26,26,0.90)] px-4 py-3 text-white shadow-xl backdrop-blur-xl"
    >
      <span className="text-[13px] font-semibold text-white tabular" data-testid={`${testid}-count`}>
        {selected.length} {lt('selected')}
      </span>
      {pdfNote && (
        <span className="text-[12px] text-white/70" data-testid={`${testid}-pdf-note`}>{pdfNote}</span>
      )}
      <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
        {onToggleAll && selected.length < rows.length && (
          <Button className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20" data-testid={`${testid}-select-all`} onClick={() => onToggleAll(rows)}>
            {lt('Select All')}
          </Button>
        )}
        <Button className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20" data-testid={`${testid}-whatsapp`} disabled={!!pdfBusy} onClick={shareWhatsApp}>
          {pdfBusy === 'share' ? lt('Preparing…') : lt('Share on WhatsApp')}
        </Button>
        <Button className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20" data-testid={`${testid}-pdf`} disabled={!!pdfBusy} onClick={() => buildPdf('download')}>
          {pdfBusy === 'download' ? lt('Preparing…') : lt('Download PDF')}
        </Button>
        <Button className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20" data-testid={`${testid}-download`} onClick={download}>{lt('Download CSV')}</Button>
        <Button className="h-9 border-white/15 bg-white text-ink hover:bg-cream" data-testid={`${testid}-clear`} onClick={onClear}>{lt('Clear')}</Button>
      </div>
    </div>
  );
}

/* ── Voucher register ─────────────────────────────────────────────────────── */
export function VoucherRegister({
  rows, testid, dateLabel = 'Date', numberLabel = 'Voucher No.', partyLabel = 'Party',
  showStatus = true, extraColumns = [], toolbar, emptyMessage, scroll,
}) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useState(null);
  const { selectedKeys, toggleRow, toggleAll, clear } = useVoucherSelection();
  const data = rows || [];

  const columns = [
    { key: 'date', label: dateLabel, width: 110, render: r => <span className="tabular text-ink-soft">{date(r.date)}</span> },
    { key: 'voucher_number', label: numberLabel, width: 130, render: r => <span className="text-[13px] font-medium tabular">{r.voucher_number}</span> },
    { key: 'party_name', label: partyLabel, render: r => <span className="truncate">{r.party_name}</span> },
    ...extraColumns,
    { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
    ...(showStatus ? [{ key: 'status', label: 'Status', width: 110, render: r => <Status value={r.is_cancelled ? 'Cancelled' : r.status || 'Synced'} /> }] : []),
  ];

  return (
    <>
      <BulkActionBar rows={data} selectedKeys={selectedKeys} onClear={clear} testid={`${testid}-bulk-bar`} />
      <DataTable
        testid={testid}
        columns={columns}
        rows={data}
        scroll={scroll}
        onRowClick={setActive}
        selectable
        selectedKeys={selectedKeys}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        rowKey={voucherRowKey}
        searchKeys={['voucher_number', 'party_name', 'date']}
        emptyMessage={emptyMessage}
        toolbar={toolbar}
        footer={f => `${lt('Total')} ${money(f.reduce((s, r) => s + (r.amount || 0), 0))}`}
      />
      <VoucherDrawer voucher={active} onClose={() => setActive(null)} />
    </>
  );
}

/* Labels whose values are codes, not prose or money — these get the monospace stack. */
const CODE_LABELS = new Set([
  'GSTIN', 'PAN', 'HSN', 'Barcode', 'Reference', 'IRN', 'Ack. number', 'Ack no.',
  'EWB No.', 'E-Way Bill', 'Vehicle', 'Challan', 'IFSC', 'Account number', 'Invoice',
]);

/** Generic record drawer for non-voucher rows (day book, expenses, e-invoice, EWB). */
export function RecordDrawer({ record, onClose, title, sub, fields, actions }) {
  const lt = useLabelT();
  if (!record) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      testid="record-drawer"
      title={title}
      sub={sub}
      footer={<>{actions}{<Button onClick={onClose}>{lt('Close')}</Button>}</>}
    >
      <div>
        {fields.map(([label, value, mono]) => (
          <KV key={label} label={label} value={value} mono={mono} code={CODE_LABELS.has(label)} />
        ))}
      </div>
    </Drawer>
  );
}

/* ── Party / ledger detail panels (stack over whatever is behind them) ────── */
export function PartyPanel({ id, onClose }) {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const [party, setParty] = useState(null);
  const [rows, setRows] = useState([]);
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!id || !selectedCompany?.guid) return;
    setLoading(true); setError('');
    try {
      const partiesRes = await api.fetchParties({ companyGuid: selectedCompany.guid, searchText: String(id), pageSize: 50 });
      const parties = api.unwrapList(partiesRes);
      const found = parties.find(p => String(p.id) === String(id) || p.guid === id || p.name === id) || parties[0] || { name: String(id) };
      const voucherRes = await api.fetchLedgerVouchers({
        companyGuid: selectedCompany.guid, ledgerName: found.name, page: 1, pageSize: 100,
        fromDate: selectedFY?.startDate, toDate: selectedFY?.endDate,
      });
      setParty(found);
      setRows(api.unwrapList(voucherRes).filter(v =>
        (!selectedFY?.startDate || v.date >= selectedFY.startDate) &&
        (!selectedFY?.endDate || v.date <= selectedFY.endDate)
      ));
    } catch (e) {
      setError(e.message || lt('Failed to load party'));
    } finally { setLoading(false); }
  }, [id, selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  useEffect(() => { load(); }, [load]);
  if (!id) return null;

  return (
    <Drawer
      open
      size="xl"
      eyebrow="Party"
      onClose={onClose}
      testid="party-panel"
      title={party?.name || String(id)}
      sub={[party?.parent || party?.type, party?.city, party?.gstin].filter(Boolean).join(' · ')}
      footer={<Button onClick={onClose}>{lt('Close')}</Button>}
    >
      {loading ? <p className="py-8 text-center text-[13px] text-ink-soft">{lt('Loading party…')}</p> : error ? (
        <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />
      ) : !party ? <Empty message="Party not found" /> : <div className="space-y-5">
        <StatGrid items={[
           { label: 'Outstanding', value: mc(party.outstanding ?? party.closing_balance), sub: 'Current', tone: '#BB7836' },
           { label: 'Closing balance', value: mc(party.balance ?? party.closing_balance), sub: (party.balance ?? party.closing_balance) < 0 ? 'Credit' : 'Debit', tone: '#181818' },
          { label: 'Vouchers', value: rows.length, sub: 'This FY', tone: '#3963E4' },
          { label: 'Turnover', value: mc(rows.reduce((s, v) => s + v.amount, 0)), sub: 'This FY', tone: '#447B4B' },
        ]} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel title="Party details" testid="party-details-panel">
            <KV label="GSTIN" value={party.gstin} code />
             <KV label="Group" value={party.parent || party.type} />
            <KV label="Phone" value={party.phone} mono />
            <KV label="City" value={party.city} />
              <KV label="Party type" value={<Pill tone={(party.party_type === 'customer' || /debtor/i.test(party.parent || '')) ? 'pos' : 'warn'}>{party.party_type || party.parent || lt('Party')}</Pill>} />
          </Panel>
          <div className="xl:col-span-2">
            <Panel title="Statement" sub="Ledger movement for this party">
              <DataTable
                testid="party-statement-table"
                rows={rows}
                scroll
                pageSize={20}
                onRowClick={setVoucher}
                columns={[
                  { key: 'date', label: 'Date', render: r => date(r.date) },
                  { key: 'voucher_number', label: 'Voucher' },
                  { key: 'voucher_type', label: 'Type' },
                  { key: 'amount', label: 'Amount', align: 'right', render: r => money(r.amount) },
                ]}
              />
            </Panel>
          </div>
        </div>
      </div>}
      <VoucherDrawer voucher={voucher} onClose={() => setVoucher(null)} />
    </Drawer>
  );
}

export function LedgerPanel({ id, onClose }) {
  const { money, mc, date } = useFmt();
  const lt = useLabelT();
  const { t } = useTranslation();
  const { selectedCompany, selectedFY } = useAuth();
  const [ledger, setLedger] = useState(null);
  const [entries, setEntries] = useState([]);
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remind, setRemind] = useState({ sending: false, msg: '', err: false });
  const load = useCallback(async () => {
    if (!id || !selectedCompany?.guid) return;
    setLoading(true); setError('');
    try {
      let ledgerRow;
      if (typeof id === 'object') ledgerRow = id;
      else {
        // A string id is usually a guid — resolve it directly first (searchText only matches names).
        try {
          const d = await api.fetchLedgerDetails({ companyGuid: selectedCompany.guid, ledgerGuid: String(id) });
          ledgerRow = d?.data?.ledger;
        } catch { /* fall through to name search */ }
        if (!ledgerRow) {
          const listRes = await api.fetchLedgers({ companyGuid: selectedCompany.guid, searchText: String(id), pageSize: 50, from: selectedFY?.startDate, to: selectedFY?.endDate });
          ledgerRow = api.unwrapList(listRes).find(l => String(l.id) === String(id) || l.guid === id || l.name === id) || api.unwrapList(listRes)[0];
        }
      }
       if (!ledgerRow) throw new Error(lt('Ledger not found'));
      const detailRes = ledgerRow.guid ? await api.fetchLedgerDetails({ companyGuid: selectedCompany.guid, ledgerGuid: ledgerRow.guid }) : null;
      const detail = detailRes?.data?.ledger || ledgerRow;
      const vouchersRes = await api.fetchLedgerVouchers({ companyGuid: selectedCompany.guid, ledgerName: detail.name, page: 1, pageSize: 100 });
      setLedger(detail);
      setEntries(api.unwrapList(vouchersRes).filter(v =>
        (!selectedFY?.startDate || v.date >= selectedFY.startDate) &&
        (!selectedFY?.endDate || v.date <= selectedFY.endDate)
      ).map(v => ({
        ...v,
        debit: Number(v.debit ?? (v.dr_cr === 'Dr' ? v.amount : 0)) || 0,
        credit: Number(v.credit ?? (v.dr_cr === 'Cr' ? v.amount : 0)) || 0,
        running: Number(v.running ?? v.running_balance ?? v.balance) || 0,
      })));
    } catch (e) { setError(e.message || lt('Failed to load ledger')); }
    finally { setLoading(false); }
  }, [id, selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate]);
  useEffect(() => { load(); }, [load]);
  if (!id) return null;

  return (
    <Drawer
      open
      size="xl"
      eyebrow="Ledger"
      onClose={onClose}
      testid="ledger-panel"
      title={ledger?.name || String(id)}
       sub={ledger ? t('portal.labels.ledger-closing-amount-type', '{{ledger}} · closing {{amount}} {{type}}', {
         ledger: ledger.parent || ledger.group || lt('Ledger'),
         amount: money(ledger.closing_balance ?? ledger.balance),
         type: ledger.balance_type || ledger.type || '',
       }) : ''}
      footer={(() => {
        // Mobile parity: WhatsApp payment reminder needs only a 10-digit phone on the ledger.
        const rawPhone = ledger?.phone || ledger?.mobile || '';
        const digits = String(rawPhone).replace(/\D/g, '');
        const canRemind = digits.length >= 10;
        const closing = Number(ledger?.closing_balance ?? ledger?.balance) || 0;
        const sendReminder = async () => {
          const last10 = digits.slice(-10);
          const amount = Math.abs(closing);
           if (!window.confirm(t(
             'portal.labels.send-whatsapp-payment-reminder-to-name-amount-amount-phone-phone',
             'Send WhatsApp payment reminder to {{name}}?\nAmount: {{amount}}\nPhone: +91 {{phone}}',
             { name: ledger.name, amount: money(amount), phone: last10 },
           ))) return;
          setRemind({ sending: true, msg: '', err: false });
          try {
            await api.sendPaymentReminder(selectedCompany.guid, { ledgerName: ledger.name, mobile: last10, amount });
             setRemind({ sending: false, msg: lt('Reminder sent via WhatsApp ✓'), err: false });
          } catch (e) {
             setRemind({ sending: false, msg: e.message || lt('Failed to send reminder'), err: true });
          }
        };
        return (
          <div className="flex w-full items-center gap-3">
            {remind.msg && <span data-testid="reminder-status" className={`text-[12px] ${remind.err ? 'text-neg' : 'text-pos'}`}>{remind.msg}</span>}
            <div className="ml-auto flex items-center gap-2">
              {canRemind && (
                <Button data-testid="ledger-remind-button" variant="primary" disabled={remind.sending} onClick={sendReminder}>
                   {remind.sending ? lt('Sending…') : lt('Send Payment Reminder')}
                </Button>
              )}
               <Button onClick={onClose}>{lt('Close')}</Button>
            </div>
          </div>
        );
      })()}
    >
       {loading ? <p className="py-8 text-center text-[13px] text-ink-soft">{lt('Loading ledger…')}</p> : error ? (
         <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />
      ) : !ledger ? <Empty message="Ledger not found" /> : <div className="space-y-5">
        <StatGrid items={[
           { label: 'Opening', value: mc(ledger.fy_opening_abs ?? ledger.opening_balance), sub: 'FY start', tone: 'rgba(26,26,26,0.4)' },
          { label: 'Debit', value: mc(entries.reduce((s, e) => s + e.debit, 0)), sub: 'This FY', tone: '#447B4B' },
          { label: 'Credit', value: mc(entries.reduce((s, e) => s + e.credit, 0)), sub: 'This FY', tone: '#B14435' },
           { label: 'Closing', value: mc(ledger.closing_balance ?? ledger.balance), sub: ledger.balance_type || ledger.type, tone: '#181818' },
        ]} />
        <Panel title="Ledger statement" sub="Voucher-wise movement">
          <DataTable
            testid="ledger-statement-table"
            rows={entries}
            scroll
            pageSize={22}
            onRowClick={setVoucher}
            columns={[
              { key: 'date', label: 'Date', render: r => date(r.date) },
              { key: 'voucher_number', label: 'Voucher' },
              { key: 'party_name', label: 'Particulars' },
              { key: 'voucher_type', label: 'Type' },
              { key: 'debit', label: 'Debit', align: 'right', render: r => (r.debit ? money(r.debit) : '—') },
              { key: 'credit', label: 'Credit', align: 'right', render: r => (r.credit ? money(r.credit) : '—') },
              { key: 'running', label: 'Balance', align: 'right', render: r => money(r.running) },
            ]}
          />
        </Panel>
      </div>}
      <VoucherDrawer voucher={voucher} onClose={() => setVoucher(null)} />
    </Drawer>
  );
}

export function VoucherDrawer({ voucher, onClose, onVoucherChanged }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const openCreate = useOpenCreate();
  const [party, setParty] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [tallyBusy, setTallyBusy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const detailReq = useRef(0);
  const previewReq = useRef(0);
  const previewPanelRef = useRef(null);
  const voucherRef = useRef(voucher);
  voucherRef.current = voucher;
  const companyGuidRef = useRef(selectedCompany?.guid);
  companyGuidRef.current = selectedCompany?.guid;
  const voucherKey = voucher?.guid || voucher?.voucher_guid || voucher?.voucher_number || voucher?.id || '';

  const fetchDetail = useCallback(async () => {
    const row = voucherRef.current;
    const companyGuid = companyGuidRef.current;
    if (!row || !companyGuid) return;
    const voucherId = resolveVoucherApiId(row);
    if (!voucherId) { setDetail(row); setDetailError(''); setLoading(false); return; }
    const seq = ++detailReq.current;
    setLoading(true);
    setDetailError('');
    try {
      const res = await api.fetchVoucherDetail({ companyGuid, voucherId });
      if (seq !== detailReq.current) return;
      const payload = res?.data || {};
      // Keep list-row fields (tdk_reference_no, current_entry_type…) — the detail payload may not repeat them.
      setDetail({ ...row, ...(payload.voucher || {}), items: payload.items || payload.voucher?.items || [], ledger_entries: payload.ledger_entries || [] });
      setDetailError('');
    } catch (e) {
      if (seq !== detailReq.current) return;
      // List row is still usable — keep soft error, don't wipe the drawer.
      setDetail(row);
      setDetailError(e.message || 'Failed to load voucher');
    } finally {
      if (seq === detailReq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!voucherKey || !selectedCompany?.guid) return;
    previewReq.current += 1;
    setDetail(null);
    setDetailError('');
    setPreviewError('');
    setPreviewHtml('');
    setTallyBusy('');
    setParty(null);
    fetchDetail();
    // fetchDetail is stable (empty deps) — must NOT depend on lt/load or we get an infinite refetch loop.
  }, [voucherKey, selectedCompany?.guid, fetchDetail]);

  useEffect(() => {
    if (!previewHtml) return;
    previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewHtml]);

  if (!voucher) return null;
  const row = detail || voucher;
  const items = row.items || [];

  /* Convert / create-from actions (mobile parity). Eligibility mirrors mobile:
   * proforma → convert needs a TDK ref and a not-yet-regular entry; orders just prefill. */
  const vt = (row.voucher_type || '').toLowerCase();
  const tdkRef = resolveTdkRef(row);
  const isProforma = vt.includes('proforma')
    || (!!tdkRef && row.original_entry_type === 'optional' && vt.includes('sales') && !vt.includes('order'));
  // Mirrors mobile eligibility: proforma type, still optional (never converted), TDK ref,
  // and present in the synced register (rows only exist here after a Tally sync).
  const stillOptional = row.is_optional === true || row.is_optional === 't'
    || row.original_entry_type === 'optional' || vt.includes('proforma');
  const canConvertProforma = isProforma && stillOptional && !!tdkRef
    && row.current_entry_type !== 'regular'
    && row.conversion_status !== 'converted'
    && !row.is_cancelled;
  const isSalesOrder = vt.includes('sales order') && !row.is_cancelled;
  const isPurchaseOrder = vt.includes('purchase order') && !row.is_cancelled;
  const prefillLines = () => (items || [])
    .filter(it => it.name || it.item_name)
    .map(it => ({
      ...emptyLine(),
      name: it.name || it.item_name,
      qty: Math.abs(parseFloat(it.qty ?? it.actual_qty ?? it.billed_qty)) || 1,
      rate: Math.abs(parseFloat(it.rate)) || '',
      unit: it.unit || '',
      godown: it.godown || it.godown_name || '',
    }));
  const startInvoice = (kind, extra) => {
    // Sales/purchase ledger comes from the source voucher's item allocations
    // (never the party ledger); GST rows from its ledger entries.
    const itemLedger = (items || []).map(it => it.ledger_name).find(n => n && n !== row.party_name) || '';
    const taxes = (row.ledger_entries || [])
      .filter(e => /\b(gst|igst|cgst|sgst|utgst|cess)\b/i.test(e.ledger_name || ''))
      .map(e => ({ ledgerName: e.ledger_name, taxRate: '', taxAmount: Math.abs(parseFloat(e.amount)) || '' }));
    openCreate(kind, {
      party: row.party_name || '',
      narration: row.narration || '',
      ledger: itemLedger,
      date: row.date || '',
      taxes,
      lines: prefillLines(),
      ...extra,
    });
    onClose();
  };

  const handlePrint = async () => {
    setPrinting(true);
    setPreviewError('');
    try {
      const voucherId = resolveVoucherApiId(row);
      // Fetch full voucher (company/party GST/gst details), print profile and logo in parallel.
      const [fullRes, profileRes, logoRes] = await Promise.allSettled([
        api.fetchVoucherFull(selectedCompany.guid, voucherId),
        api.fetchPrintProfile(selectedCompany.guid),
        api.fetchCompanyLogo(selectedCompany.guid),
      ]);
      const full = fullRes.status === 'fulfilled' ? (fullRes.value?.data || {}) : {};
      const html = buildInvoiceHTML({
        voucher: { ...row, ...(full.voucher || {}) },
        company: full.company || selectedCompany || {},
        party: full.party || {},
        gst: full.gst || null,
        items: (full.items && full.items.length ? full.items : items),
        ledgerEntries: full.ledger_entries || row.ledger_entries || [],
        eInvoice: full.e_invoice || null,
        eWayBill: full.e_way_bill || null,
        profile: profileRes.status === 'fulfilled' ? (profileRes.value?.data || {}) : {},
        logoUrl: logoRes.status === 'fulfilled' ? (logoRes.value?.data?.logo_url || '') : '',
        formatDate: date,
      });
      printInvoice(html);
    } catch (e) {
      setPreviewError(e.message || lt('Failed to prepare invoice for printing'));
    } finally {
      setPrinting(false);
    }
  };

  const handleTallyPreview = async () => {
    if (!tdkRef || !selectedCompany?.guid) {
      setPreviewError(lt('Tally preview needs a TDK reference on this voucher'));
      return;
    }
    const seq = ++previewReq.current;
    setTallyBusy('preview');
    setPreviewError('');
    setDetailError(''); // dismiss detail banner once user opens preview
    setPreviewHtml(''); // clear previous voucher's preview immediately
    try {
      const res = await api.fetchTallyInvoicePreview(tdkRef, selectedCompany.guid);
      if (seq !== previewReq.current) return;
      const doc = res?.data || res || {};
      // Mobile renders this as a VoucherDocument UI — not raw JSON / not HTML.
      // Map the same snapshot into our print template for an on-screen invoice preview.
      const company = doc.company || {
        name: doc.companyName || selectedCompany.name,
        gstin: doc.gstin, pan: doc.pan, phone: doc.phone, email: doc.email,
        address: doc.address || doc.state, state: doc.state,
      };
      const partyInfo = doc.party || doc.billing || {
        name: doc.partyName || row.party_name,
        address: doc.billing?.address || doc.shipping?.address,
        gstin: doc.partyGstin || doc.billing?.gstin,
      };
      const previewItems = (doc.items || []).map((it, i) => ({
        id: it.id || i,
        name: it.name || it.itemName || it.item_name,
        hsn: it.hsn,
        qty: it.qty ?? it.billedQty ?? it.billed_qty,
        unit: it.unit,
        rate: it.rate,
        discount: it.discount,
        amount: it.amount ?? it.lineTotal,
      }));
      const taxes = doc.taxes || [];
      const gst = {
        cgst_amount: taxes.find(t => /cgst/i.test(t.name || t.ledgerName || ''))?.amount,
        sgst_amount: taxes.find(t => /sgst/i.test(t.name || t.ledgerName || ''))?.amount,
        igst_amount: taxes.find(t => /igst/i.test(t.name || t.ledgerName || ''))?.amount,
        taxable_amount: doc.totals?.taxable ?? doc.totals?.subtotal,
        place_of_supply: doc.metadata?.placeOfSupply || doc.tallyMeta?.placeOfSupply,
      };
      const html = buildInvoiceHTML({
        voucher: {
          voucher_number: doc.documentNumber || doc.voucherNumber || row.voucher_number,
          voucher_type: doc.tallyVoucherType || doc.documentTitle || row.voucher_type,
          date: doc.date || row.date,
          amount: doc.totals?.grandTotal ?? doc.totals?.total ?? row.amount,
          party_amount: doc.totals?.grandTotal ?? doc.totals?.total ?? row.amount,
          reference: doc.reference || doc.tdkRef || tdkRef,
          narration: doc.narration,
        },
        company: {
          ...company,
          name: company.name || company.formal_name || selectedCompany.name,
          address: company.address || [company.addressLine1, company.addressLine2, company.city, company.state, company.pincode].filter(Boolean).join(', '),
        },
        party: {
          ...partyInfo,
          name: partyInfo.name || partyInfo.ledgerName || row.party_name,
          address: partyInfo.address || [partyInfo.addressLine1, partyInfo.addressLine2, partyInfo.city, partyInfo.state, partyInfo.pincode].filter(Boolean).join(', '),
        },
        gst,
        items: previewItems,
        ledgerEntries: (doc.ledgerEntries || []).map(e => ({
          ledger_name: e.ledgerName || e.ledger_name || e.name,
          amount: e.amount,
        })),
        eInvoice: doc.eInvoice || null,
        eWayBill: doc.eWayBill || doc.dispatchDetails || null,
        profile: {},
        logoUrl: '',
        formatDate: date,
      });
      setPreviewHtml(html);
      setPreviewError('');
      setDetailError('');
    } catch (e) {
      if (seq !== previewReq.current) return;
      setPreviewHtml('');
      setPreviewError(e.message || lt('Tally preview failed'));
    } finally {
      if (seq === previewReq.current) setTallyBusy('');
    }
  };

  const canCancel = !row.is_cancelled && !String(row.status || '').toLowerCase().includes('cancel')
    && !!(resolveVoucherApiId(row) || tdkRef);

  const handleCancel = async () => {
    if (!selectedCompany?.guid || !canCancel || cancelling) return;
    const voucherId = resolveVoucherApiId(row);
    const confirmMsg = lt('Cancel this voucher in Tally? This cannot be undone from the portal.');
    if (!window.confirm(confirmMsg)) return;
    setCancelling(true);
    setPreviewError('');
    try {
      await api.cancelVoucher({
        companyGuid: selectedCompany.guid,
        companyName: selectedCompany.name || selectedCompany.companyName || '',
        voucherGuid: voucherId || undefined,
        tdkRef: tdkRef || undefined,
        voucherNumber: row.voucher_number || row.voucherNumber || undefined,
        voucherType: row.voucher_type || row.voucherType || undefined,
      });
      onVoucherChanged?.();
      onClose();
    } catch (e) {
      setPreviewError(e.message || lt('Unable to cancel voucher'));
    } finally {
      setCancelling(false);
    }
  };

  const handleTallySharePdf = async () => {
    if (!tdkRef || !selectedCompany?.guid) {
      setPreviewError(lt('Share PDF needs a TDK reference on this voucher'));
      return;
    }
    setTallyBusy('share');
    setPreviewError('');
    try {
      await api.shareTallyInvoicePdf(tdkRef, { companyGuid: selectedCompany.guid });
      window.open(`https://wa.me/?text=${encodeURIComponent(`${row.voucher_type || 'Invoice'} ${row.voucher_number || tdkRef}`)}`, '_blank', 'noopener');
    } catch (e) {
      setPreviewError(e.message || lt('Share PDF failed'));
    } finally {
      setTallyBusy('');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      testid="voucher-drawer"
      title={row.voucher_number}
      sub={`${row.voucher_type} · ${date(row.date)}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {canConvertProforma && (
            <Button
              variant="primary"
              data-testid="voucher-convert-button"
              disabled={loading}
              onClick={() => startInvoice('sales-invoice', { convertTdkRef: tdkRef, reference: row.reference || '' })}
            >
              {lt('Convert to Invoice')}
            </Button>
          )}
          {(isSalesOrder || isPurchaseOrder) && (
            <Button
              variant="primary"
              data-testid="voucher-create-invoice-button"
              disabled={loading}
              onClick={() => startInvoice(isPurchaseOrder ? 'purchase-invoice' : 'sales-invoice', { againstOrderNo: row.voucher_number || '' })}
            >
              {lt('Create Invoice from Order')}
            </Button>
          )}
          {tdkRef && (
            <>
              <Button data-testid="voucher-tally-preview" disabled={!!tallyBusy} onClick={handleTallyPreview}>
                {tallyBusy === 'preview' ? lt('Loading…') : lt('Tally preview')}
              </Button>
              <Button data-testid="voucher-tally-share-pdf" disabled={!!tallyBusy} onClick={handleTallySharePdf}>
                {tallyBusy === 'share' ? lt('Sharing…') : lt('Share PDF (Tally)')}
              </Button>
            </>
          )}
          <Button
            data-testid="voucher-whatsapp-button"
            onClick={() => {
              const summary = [
                 `*${row.voucher_type || lt('Voucher')} ${row.voucher_number || ''}*`,
                selectedCompany?.name,
                 row.party_name ? `${lt('Party')}: ${row.party_name}` : null,
                 `${lt('Date')}: ${date(row.date)}`,
                 `${lt('Amount')}: ${money(row.party_amount ?? row.amount)}`,
              ].filter(Boolean).join('\n');
              window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank', 'noopener');
            }}
          >
            {lt('Share on WhatsApp')}
          </Button>
          <Button variant="primary" data-testid="voucher-print-button" disabled={printing} onClick={handlePrint}>
            {printing ? lt('Preparing…') : lt('Print / PDF')}
          </Button>
          {canCancel && (
            <Button
              variant="ghost"
              data-testid="voucher-cancel-button"
              disabled={cancelling || !!tallyBusy}
              onClick={handleCancel}
              className="text-neg hover:bg-neg-bg"
            >
              {cancelling ? lt('Cancelling…') : lt('Cancel voucher')}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {loading && !detail && <p className="text-[13px] text-ink-soft">{lt('Loading voucher details…')}</p>}
        {detailError && !previewHtml && (
          <p className="rounded-xl border border-line bg-cream/50 px-3 py-2 text-[12px] text-ink-soft" data-testid="voucher-detail-warning">
            {detailError}{' '}
            <button type="button" className="font-semibold text-ink underline" onClick={fetchDetail}>{lt('Retry')}</button>
          </p>
        )}
        {previewError && (
          <Empty message={previewError} hint={<Button onClick={() => setPreviewError('')}>{lt('Dismiss')}</Button>} />
        )}
        {previewHtml && (
          <div ref={previewPanelRef}>
            <Panel title={lt('Tally invoice preview')} sub={lt('Same snapshot as mobile — GET /tally/invoice/:ref/preview')}>
              <iframe
                title={lt('Tally invoice preview')}
                data-testid="tally-invoice-preview-frame"
                className="h-[520px] w-full rounded-xl border border-line bg-white"
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
              />
            </Panel>
          </div>
        )}
        <div>
          <KV
            label="Party"
            value={row.party_name ? (
              <button
                data-testid="voucher-open-party"
                onClick={() => setParty(row.party_name)}
                className="text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink-soft"
              >
                {row.party_name}
              </button>
            ) : '—'}
          />
          <KV label="Voucher type" value={row.voucher_type} />
          <KV label="Date" value={date(row.date)} mono />
          <KV label="Amount" value={money(row.party_amount ?? row.amount)} mono />
          <KV label="Status" value={<Status value={row.is_cancelled ? 'Cancelled' : row.status || 'Synced'} />} />
        </div>

        {items.length > 0 && (
          <div>
            <p className="mb-2.5 text-[11px] font-medium text-ink-soft">{lt('Line items')}</p>
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full">
                <thead className="bg-cream/70">
                  <tr>
                    {['Item', 'Qty', 'Rate', 'Amount'].map(h => (
                       <th key={h} className={`px-3.5 py-2.5 text-[11px] font-medium text-ink-soft ${h === 'Item' ? 'text-left' : 'text-right'}`}>{lt(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-line-subtle">
                       <td className="px-3 py-2 text-[11px]">{it.name || it.item_name || it.ledger_name}</td>
                       <td className="px-3 py-2 text-[11px] text-right tabular">{it.qty ?? it.actual_qty ?? it.billed_qty} {it.unit}</td>
                      <td className="px-3 py-2 text-[11px] text-right tabular">{money(it.rate)}</td>
                      <td className="px-3 py-2 text-[11px] text-right tabular font-medium">{money(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

         {row.narration && (
          <div>
             <p className="mb-1.5 text-[11px] font-medium text-ink-soft">{lt('Narration')}</p>
             <p className="text-[13px] text-ink-soft">{row.narration}</p>
          </div>
        )}
      </div>
      {party && <PartyPanel id={party} onClose={() => setParty(null)} />}
    </Drawer>
  );
}


/* ── Simple money table used across analytics screens ─────────────────────── */
export function MoneyTable({ rows, columns, testid, footer, onRowClick, emptyMessage, pageSize }) {
  return (
    <DataTable testid={testid} columns={columns} rows={rows} footer={footer} onRowClick={onRowClick} emptyMessage={emptyMessage} pageSize={pageSize} />
  );
}

