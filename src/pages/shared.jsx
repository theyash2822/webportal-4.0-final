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
import { printInvoice, htmlToPdfBlob } from '../utils/invoicePrint';
import { downloadBlob } from '../services/invoicePdf';
import CreamDocumentSheet from '../components/CreamDocumentSheet';
import { buildCreamModel } from '../utils/creamPreviewModel';
import { buildVoucherPdfHtml } from '../utils/voucherPdfBuild';

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

export function VoucherDrawer({ voucher, onClose }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const openCreate = useOpenCreate();
  const [detail, setDetail] = useState(null);
  const [full, setFull] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const reqRef = useRef(0);
  const voucherRef = useRef(voucher);
  voucherRef.current = voucher;
  const companyGuidRef = useRef(selectedCompany?.guid);
  companyGuidRef.current = selectedCompany?.guid;
  const voucherKey = voucher?.guid || voucher?.voucher_guid || voucher?.voucher_number || voucher?.id || '';

  const load = useCallback(async () => {
    const row = voucherRef.current;
    const companyGuid = companyGuidRef.current;
    if (!row || !companyGuid) return;
    const seq = ++reqRef.current;
    setLoading(true);
    setLoadError('');
    setActionError('');
    setSnapshot(null);
    setFull(null);
    setDetail(row);
    try {
      const voucherId = resolveVoucherApiId(row);
      const tdk = resolveTdkRef(row);
      const tasks = [];
      if (voucherId) {
        tasks.push(
          api.fetchVoucherDetail({ companyGuid, voucherId })
            .then(res => ({ kind: 'detail', res }))
            .catch(e => ({ kind: 'detail', err: e })),
          api.fetchVoucherFull(companyGuid, voucherId)
            .then(res => ({ kind: 'full', res }))
            .catch(e => ({ kind: 'full', err: e })),
        );
      }
      if (tdk) {
        tasks.push(
          api.fetchTallyInvoicePreview(tdk, companyGuid)
            .then(res => ({ kind: 'preview', res }))
            .catch(e => ({ kind: 'preview', err: e })),
        );
      }
      const results = await Promise.all(tasks);
      if (seq !== reqRef.current) return;
      let nextDetail = row;
      let nextFull = null;
      let nextSnap = null;
      let softErr = '';
      for (const r of results) {
        if (r.kind === 'detail') {
          if (r.err) softErr = r.err.message || softErr;
          else {
            const payload = r.res?.data || {};
            nextDetail = {
              ...row,
              ...(payload.voucher || {}),
              items: payload.items || payload.voucher?.items || [],
              ledger_entries: payload.ledger_entries || [],
            };
          }
        }
        if (r.kind === 'full' && !r.err) nextFull = r.res?.data || {};
        if (r.kind === 'preview' && !r.err) nextSnap = r.res?.data || r.res || null;
      }
      setDetail(nextDetail);
      setFull(nextFull);
      setSnapshot(nextSnap);
      if (!nextSnap && !nextDetail?.items?.length && softErr) setLoadError(softErr);
    } catch (e) {
      if (seq !== reqRef.current) return;
      setLoadError(e.message || lt('Failed to load voucher'));
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, [lt]);

  useEffect(() => {
    if (!voucherKey || !selectedCompany?.guid) return;
    reqRef.current += 1;
    setDetail(null);
    setFull(null);
    setSnapshot(null);
    setLoadError('');
    setActionError('');
    setActionBusy('');
    load();
  }, [voucherKey, selectedCompany?.guid, load]);

  if (!voucher) return null;
  const row = detail || voucher;
  const tdkRef = resolveTdkRef(row);
  const cream = buildCreamModel({
    doc: snapshot,
    row,
    full,
    company: selectedCompany,
    formatDate: date,
  });

  const vt = (row.voucher_type || cream.voucherType || '').toLowerCase();
  const isProforma = vt.includes('proforma')
    || (!!tdkRef && row.original_entry_type === 'optional' && vt.includes('sales') && !vt.includes('order'));
  const stillOptional = row.is_optional === true || row.is_optional === 't'
    || row.original_entry_type === 'optional' || vt.includes('proforma');
  const canConvertProforma = isProforma && stillOptional && !!tdkRef
    && row.current_entry_type !== 'regular'
    && row.conversion_status !== 'converted'
    && !row.is_cancelled;
  const isSalesOrder = vt.includes('sales order') && !row.is_cancelled;
  const isPurchaseOrder = vt.includes('purchase order') && !row.is_cancelled;

  const startInvoice = (kind, extra = {}) => {
    const itemLedger = (row.items || []).find(it => it.sales_ledger || it.purchase_ledger || it.ledger)?.sales_ledger
      || (row.items || []).find(it => it.purchase_ledger)?.purchase_ledger
      || '';
    const taxes = (row.ledger_entries || [])
      .filter(e => /gst|cgst|sgst|igst|cess/i.test(e.ledger_name || ''))
      .map(e => ({ ledger: e.ledger_name, rate: '', amount: String(Math.abs(Number(e.amount) || 0)) }));
    const prefillLines = () => (row.items || []).filter(it => it.name || it.item_name || it.stock_item_name).map(it => ({
      ...emptyLine(),
      name: it.name || it.item_name || it.stock_item_name,
      qty: String(it.qty ?? it.billed_qty ?? it.actual_qty ?? ''),
      rate: String(it.rate ?? ''),
      unit: it.unit || '',
      godown: it.godown || it.warehouse || '',
      hsn: it.hsn || '',
    }));
    openCreate(kind, {
      party: row.party_name || '',
      reference: row.reference || '',
      againstOrderNo: isSalesOrder || isPurchaseOrder ? (row.voucher_number || '') : undefined,
      narration: row.narration || '',
      ledger: itemLedger,
      date: row.date || '',
      taxes,
      lines: prefillLines(),
      ...extra,
    });
    onClose();
  };

  const runPdf = async (mode) => {
    setActionBusy(mode);
    setActionError('');
    try {
      const { html, filename, thermalPaperWidth } = await buildVoucherPdfHtml({
        cream, doc: snapshot, row, full, company: selectedCompany, formatDate: date,
      });
      if (mode === 'print') {
        printInvoice(html);
      } else {
        if (tdkRef && selectedCompany?.guid) {
          try { await api.shareTallyInvoicePdf(tdkRef, { companyGuid: selectedCompany.guid }); } catch { /* local PDF still shared */ }
        }
        const blob = await htmlToPdfBlob(html, { thermalPaperWidth });
        const party = cream.partyName || row.party_name || '';
        const text = [cream.voucherType || row.voucher_type || 'Invoice', cream.number || row.voucher_number, party]
          .filter(Boolean).join(' · ');
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text });
          } catch (e) {
            if (e?.name !== 'AbortError') downloadBlob(blob, filename);
          }
        } else {
          downloadBlob(blob, filename);
        }
      }
    } catch (e) {
      setActionError(e.message || lt('Unable to prepare PDF'));
    } finally {
      setActionBusy('');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      testid="voucher-drawer"
      title={cream.number || row.voucher_number || lt('Voucher')}
      sub={`${cream.voucherType || row.voucher_type || lt('Voucher')} · ${cream.dateLabel || date(row.date)}`}
      footer={
        <div className="flex w-full flex-col gap-2">
          {(canConvertProforma || isSalesOrder || isPurchaseOrder) && (
            <div className="flex flex-wrap gap-2">
              {canConvertProforma && (
                <Button variant="primary" data-testid="voucher-convert-button" disabled={loading}
                  onClick={() => startInvoice('sales-invoice', { convertTdkRef: tdkRef, reference: row.reference || '' })}>
                  {lt('Convert to Invoice')}
                </Button>
              )}
              {(isSalesOrder || isPurchaseOrder) && (
                <Button variant="primary" data-testid="voucher-create-invoice-button" disabled={loading}
                  onClick={() => startInvoice(isPurchaseOrder ? 'purchase-invoice' : 'sales-invoice', { againstOrderNo: row.voucher_number || '' })}>
                  {lt('Create Invoice from Order')}
                </Button>
              )}
            </div>
          )}
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button data-testid="voucher-share-pdf" disabled={!!actionBusy || loading} onClick={() => runPdf('share')}>
              {actionBusy === 'share' ? lt('Preparing…') : lt('Share PDF')}
            </Button>
            <Button variant="primary" data-testid="voucher-print-pdf" disabled={!!actionBusy || loading} onClick={() => runPdf('print')}>
              {actionBusy === 'print' ? lt('Preparing…') : lt('Print PDF')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {loading && <p className="text-[13px] text-ink-soft">{lt('Loading voucher…')}</p>}
        {loadError && (
          <p className="rounded-xl border border-line bg-cream/50 px-3 py-2 text-[12px] text-ink-soft" data-testid="voucher-load-warning">
            {loadError}{' '}
            <button type="button" className="font-semibold text-ink underline" onClick={load}>{lt('Retry')}</button>
          </p>
        )}
        {actionError && (
          <Empty message={actionError} hint={<Button onClick={() => setActionError('')}>{lt('Dismiss')}</Button>} />
        )}
        {!loading && <CreamDocumentSheet model={cream} />}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-cream/40 px-3 py-2 text-[11px] text-ink-soft">
          <span>{lt('Amount')}: <span className="font-semibold tabular text-ink">{money(cream.total || row.party_amount || row.amount)}</span></span>
          <span className="text-right">{lt('Status')}: <Status value={row.is_cancelled ? 'Cancelled' : row.status || 'Synced'} /></span>
        </div>
      </div>
    </Drawer>
  );
}



/* ── Simple money table used across analytics screens ─────────────────────── */
export function MoneyTable({ rows, columns, testid, footer, onRowClick, emptyMessage, pageSize }) {
  return (
    <DataTable testid={testid} columns={columns} rows={rows} footer={footer} onRowClick={onRowClick} emptyMessage={emptyMessage} pageSize={pageSize} />
  );
}

