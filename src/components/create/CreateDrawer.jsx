/* Drawer-based create forms — full field parity with the mobile app.
 * Each kind maps to a form component; forms live in voucherForms/accountingForms/masterForms. */
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, useLabelT } from '../kit';

/* Lets any page open the global create drawer, optionally with prefilled values
 * (used by convert-to-invoice and create-invoice-from-order actions).
 * Value: (kind, prefill?) => void — provided by AppShell. */
export const CreateContext = createContext(() => {});
export const useOpenCreate = () => useContext(CreateContext);
import {
  SalesInvoiceForm, ProformaForm, SalesOrderForm, PurchaseInvoiceForm, PurchaseOrderForm,
  CreditNoteForm, DebitNoteForm, DeliveryNoteForm, QuotationNotice,
} from './voucherForms';
import { PaymentForm, ReceiptForm, JournalForm, ContraForm, ExpenseForm } from './accountingForms';
import { PartyForm, LedgerForm, StockItemForm, WarehouseForm, StockTransferForm, StockAdjustmentForm } from './masterForms';

const FORMS = {
  'sales-invoice':    { title: 'Create Invoice',   Comp: SalesInvoiceForm },
  'proforma':         { title: 'Proforma Invoice', Comp: ProformaForm },
  'quotation':        { title: 'Quotation',        Comp: QuotationNotice },
  'sales-order':      { title: 'Sales Order',      Comp: SalesOrderForm },
  'delivery-note':    { title: 'Delivery Note',    Comp: DeliveryNoteForm },
  'credit-note':      { title: 'Credit Note',      Comp: CreditNoteForm },
  'purchase-invoice': { title: 'Purchase Invoice', Comp: PurchaseInvoiceForm },
  'purchase-order':   { title: 'Purchase Order',   Comp: PurchaseOrderForm },
  'debit-note':       { title: 'Debit Note',       Comp: DebitNoteForm },
  'payment':          { title: 'Payment Voucher',  Comp: PaymentForm },
  'receipt':          { title: 'Receipt Voucher',  Comp: ReceiptForm },
  'journal':          { title: 'Journal Voucher',  Comp: JournalForm },
  'contra':           { title: 'Contra Voucher',   Comp: ContraForm },
  'expense':          { title: 'Record Expense',   Comp: ExpenseForm },
  'sundry-creditor':  { title: 'Sundry Creditor',  Comp: PartyForm },
  'sundry-debtor':    { title: 'Sundry Debtor',    Comp: PartyForm },
  'duties-taxes':     { title: 'Duties and Taxes', Comp: LedgerForm },
  'custom-group':     { title: 'Custom Group',     Comp: LedgerForm },
  // Legacy aliases (inline Add Customer / Supplier still open these)
  'party':            { title: 'Create Party',     Comp: PartyForm },
  'customer':         { title: 'Sundry Debtor',    Comp: PartyForm },
  'supplier':         { title: 'Sundry Creditor',  Comp: PartyForm },
  'ledger':           { title: 'Custom Group',     Comp: LedgerForm },
  'stock-item':       { title: 'Add Item',         Comp: StockItemForm },
  'warehouse':        { title: 'Add Warehouse',    Comp: WarehouseForm },
  'stock-transfer':   { title: 'Stock Transfer',   Comp: StockTransferForm },
  'stock-adjustment': { title: 'Stock Adjustment', Comp: StockAdjustmentForm },
};

export function CreateDrawer({ kind, open, onClose, onCreated, prefill }) {
  const lt = useLabelT();
  const navigate = useNavigate();
  const spec = FORMS[kind];
  if (!open || !spec) return null;
  const { title, Comp } = spec;
  const converting = !!prefill?.convertTdkRef;
  const viewDocument = ref => {
    if (!ref) return;
    onClose();
    navigate(`/document/${encodeURIComponent(ref)}?preview=1`);
  };
  return (
    <Drawer open onClose={onClose} title={converting ? lt('Convert to Sales Invoice') : lt(title)} eyebrow={converting ? 'Convert' : 'Create'} size="lg" testid="create-drawer"
      sub="Written to Tally through the desktop agent">
      <Comp kind={kind} onClose={onClose} onCreated={onCreated} prefill={prefill} onViewDocument={viewDocument} />
    </Drawer>
  );
}
