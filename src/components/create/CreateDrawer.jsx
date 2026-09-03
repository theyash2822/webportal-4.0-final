/* Drawer-based create forms — full field parity with the mobile app.
 * Each kind maps to a form component; forms live in voucherForms/accountingForms/masterForms. */
import { createContext, useContext } from 'react';
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
  'sales-invoice':    { title: 'Sales Invoice',    Comp: SalesInvoiceForm },
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
  'party':            { title: 'Create Party',     Comp: PartyForm },
  'ledger':           { title: 'Create Ledger',    Comp: LedgerForm },
  'stock-item':       { title: 'Create Stock Item', Comp: StockItemForm },
  'warehouse':        { title: 'Create Warehouse', Comp: WarehouseForm },
  'stock-transfer':   { title: 'Stock Transfer',   Comp: StockTransferForm },
  'stock-adjustment': { title: 'Stock Adjustment', Comp: StockAdjustmentForm },
};

export function CreateDrawer({ kind, open, onClose, onCreated, prefill }) {
  const lt = useLabelT();
  const spec = FORMS[kind];
  if (!open || !spec) return null;
  const { title, Comp } = spec;
  const converting = !!prefill?.convertTdkRef;
  return (
    <Drawer open onClose={onClose} title={converting ? lt('Convert to Sales Invoice') : lt(title)} eyebrow={converting ? 'Convert' : 'Create'} size="lg" testid="create-drawer"
      sub="Written to Tally through the desktop agent">
      <Comp kind={kind} onClose={onClose} onCreated={onCreated} prefill={prefill} />
    </Drawer>
  );
}
