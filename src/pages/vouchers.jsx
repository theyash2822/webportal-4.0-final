import { useCallback, useEffect, useState } from 'react';
import { StatGrid, ModuleView, Panel, DataTable, Status, Empty, Skeleton, Button, Pill, useLabelT } from '../components/kit';
import { useFmt, VoucherDrawer } from './shared';
import { useAuth } from '../contexts/AuthContext';
import api, { unwrapList } from '../services/api';

const TYPES = ['Payment', 'Receipt', 'Journal', 'Contra'];
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
      setState({ rows: [], loading: false, error: error?.message || 'Unable to load vouchers.' });
    }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { ...state, retry: load };
}

function LoadState({ loading, error, rows, retry, emptyMessage, children }) {
  const lt = useLabelT();
  if (loading) return <Panel><Skeleton rows={6} /></Panel>;
  if (error) return <Panel><Empty message="Could not load vouchers" hint={error} /><div className="-mt-8 mb-8 flex justify-center"><Button onClick={retry}>{lt('Retry')}</Button></div></Panel>;
  if (!rows.length) return <Panel><Empty message={emptyMessage} hint="No vouchers were returned for the selected financial year." /></Panel>;
  return children;
}

function LiveRegister({ rows, testid, partyLabel, showType = false }) {
  const { money, date } = useFmt();
  const lt = useLabelT();
  const [active, setActive] = useState(null);
  return (
    <>
      <DataTable testid={testid} rows={rows} onRowClick={setActive} searchKeys={['voucher_number', 'party_name', 'date']} columns={[
        { key: 'date', label: 'Date', width: 110, render: r => date(r.date) },
        { key: 'voucher_number', label: 'Voucher No.', width: 130 },
        { key: 'party_name', label: partyLabel },
        ...(showType ? [{ key: 'voucher_type', label: 'Type', width: 120 }] : []),
        { key: 'amount', label: 'Amount', align: 'right', render: r => <span className="font-semibold">{money(r.amount)}</span> },
        { key: 'status', label: 'Status', width: 110, render: r => r.is_cancelled ? <Pill tone="neg">{lt('Cancelled')}</Pill> : r.status ? <Status value={r.status} /> : <Pill tone="pos">{lt('Synced')}</Pill> },
      ]} footer={visible => `${lt('Total')} ${money(visible.reduce((sum, row) => sum + row.amount, 0))}`} />
      <VoucherDrawer voucher={active} onClose={() => setActive(null)} />
    </>
  );
}

function useVoucherType(voucherType) {
  const { selectedCompany, selectedFY } = useAuth();
  const loader = useCallback(() => selectedCompany?.guid
    ? api.fetchVouchers({ companyGuid: selectedCompany.guid, voucherType, ...paramsFor(selectedFY) })
    : Promise.resolve([]), [selectedCompany?.guid, selectedFY?.startDate, selectedFY?.endDate, voucherType]);
  return useLiveRows(loader);
}

export function VoucherKpis() {
  const { mc } = useFmt();
  const lt = useLabelT();
  const { selectedCompany, selectedFY } = useAuth();
  const guid = selectedCompany?.guid;
  const loader = useCallback(async () => {
    if (!guid) return [];
    const responses = await Promise.all(TYPES.map(voucherType => api.fetchVouchers({ companyGuid: guid, voucherType, ...paramsFor(selectedFY) })));
    return responses.flatMap((response, index) => normalizeRows(response).map(row => ({ ...row, voucher_type: row.voucher_type || TYPES[index] })));
  }, [guid, selectedFY?.startDate, selectedFY?.endDate]);
  const data = useLiveRows(loader);
  const rowsFor = type => data.rows.filter(row => row.voucher_type?.toLowerCase() === type.toLowerCase());
  return (
    <LoadState {...data} emptyMessage="No accounting vouchers">
      <StatGrid items={[
        { label: 'Payments', value: mc(rowsFor('Payment').reduce((sum, row) => sum + row.amount, 0)), sub: <>{rowsFor('Payment').length} {lt('vouchers')}</>, tone: '#B14435' },
        { label: 'Receipts', value: mc(rowsFor('Receipt').reduce((sum, row) => sum + row.amount, 0)), sub: <>{rowsFor('Receipt').length} {lt('vouchers')}</>, tone: '#447B4B' },
        { label: 'Journals', value: mc(rowsFor('Journal').reduce((sum, row) => sum + row.amount, 0)), sub: <>{rowsFor('Journal').length} {lt('vouchers')}</>, tone: '#181818' },
        { label: 'Contras', value: mc(rowsFor('Contra').reduce((sum, row) => sum + row.amount, 0)), sub: <>{rowsFor('Contra').length} {lt('vouchers')}</>, tone: '#3963E4' },
      ]} />
    </LoadState>
  );
}

export function AllVouchers() {
  const { selectedCompany, selectedFY } = useAuth();
  const guid = selectedCompany?.guid;
  const loader = useCallback(async () => {
    if (!guid) return [];
    const responses = await Promise.all(TYPES.map(voucherType => api.fetchVouchers({ companyGuid: guid, voucherType, ...paramsFor(selectedFY) })));
    return responses.flatMap((response, index) => normalizeRows(response).map(row => ({ ...row, voucher_type: row.voucher_type || TYPES[index] })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [guid, selectedFY?.startDate, selectedFY?.endDate]);
  const data = useLiveRows(loader);
  return <ModuleView title="All vouchers" sub="Payment, receipt, journal and contra entries" testid="all-vouchers-view"><LoadState {...data} emptyMessage="No vouchers"><LiveRegister rows={data.rows} testid="all-vouchers-table" partyLabel="Party" showType /></LoadState></ModuleView>;
}

function VoucherTypeView({ voucherType, title, sub, testid, tableTestid, partyLabel, emptyMessage }) {
  const data = useVoucherType(voucherType);
  return <ModuleView title={title} sub={sub} testid={testid}><LoadState {...data} emptyMessage={emptyMessage}><LiveRegister rows={data.rows} testid={tableTestid} partyLabel={partyLabel} /></LoadState></ModuleView>;
}

export function PaymentVouchers() {
  return <VoucherTypeView voucherType="Payment" title="Payment vouchers" sub="Money paid out to suppliers and expense ledgers" testid="payment-vouchers-view" tableTestid="payment-vouchers-table" partyLabel="Paid to" emptyMessage="No payment vouchers" />;
}
export function ReceiptVouchers() {
  return <VoucherTypeView voucherType="Receipt" title="Receipt vouchers" sub="Money received from customers" testid="receipt-vouchers-view" tableTestid="receipt-vouchers-table" partyLabel="Received from" emptyMessage="No receipt vouchers" />;
}
export function JournalVouchers() {
  return <VoucherTypeView voucherType="Journal" title="Journal vouchers" sub="Adjustment entries between ledgers" testid="journal-vouchers-view" tableTestid="journal-vouchers-table" partyLabel="Ledger" emptyMessage="No journal vouchers" />;
}
export function ContraVouchers() {
  return <VoucherTypeView voucherType="Contra" title="Contra vouchers" sub="Transfers between bank and cash accounts" testid="contra-vouchers-view" tableTestid="contra-vouchers-table" partyLabel="Account" emptyMessage="No contra vouchers" />;
}