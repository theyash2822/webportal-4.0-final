import FormModal from './FormModal';
import AddLedgerForm from '../pages/forms/AddLedgerForm';
import SalesInvoiceForm from '../pages/forms/SalesInvoiceForm';
import SalesOrderForm from '../pages/forms/SalesOrderForm';
import PurchaseInvoiceForm from '../pages/forms/PurchaseInvoiceForm';
import PurchaseOrderForm from '../pages/forms/PurchaseOrderForm';
import CreditNoteForm from '../pages/forms/CreditNoteForm';
import DebitNoteForm from '../pages/forms/DebitNoteForm';
import DeliveryNoteForm from '../pages/forms/DeliveryNoteForm';
import VoucherForm from '../pages/forms/VoucherForm';

const FORM_MAP = {
  'Create Invoice':           { title: 'Create Sales Invoice',    subtitle: 'Sales',                     component: SalesInvoiceForm },
  'Sales Order':              { title: 'Create Sales Order',      subtitle: 'Sales',                     component: SalesOrderForm },
  'Credit Note':              { title: 'Create Credit Note',      subtitle: 'Sales return',               component: CreditNoteForm },
  'Delivery Note':            { title: 'Create Delivery Note',    subtitle: 'Dispatch',                   component: DeliveryNoteForm },
  'Purchase Invoice':         { title: 'Create Purchase Invoice', subtitle: 'Purchase',                  component: PurchaseInvoiceForm },
  'Purchase Order':           { title: 'Create Purchase Order',   subtitle: 'Purchase',                  component: PurchaseOrderForm },
  'Debit Note':               { title: 'Create Debit Note',       subtitle: 'Purchase return',            component: DebitNoteForm },
  'Payment Voucher':          { title: 'Create Payment Voucher',  subtitle: 'Financials · Vouchers',      component: VoucherForm, initialType: 'Payment' },
  'Receipt Voucher':          { title: 'Create Receipt Voucher',  subtitle: 'Financials · Vouchers',      component: VoucherForm, initialType: 'Receipt' },
  'Contra Voucher':           { title: 'Create Contra Voucher',   subtitle: 'Financials · Vouchers',      component: VoucherForm, initialType: 'Contra' },
  'Journal Voucher':          { title: 'Create Journal Voucher',  subtitle: 'Financials · Vouchers',      component: VoucherForm, initialType: 'Journal' },
  'Add Ledger':               { title: 'Add Ledger',              subtitle: 'Accounts · Ledgers',          component: AddLedgerForm },
  'Sundry Creditors':         { title: 'Add Ledger',              subtitle: 'Group: Sundry Creditors',     component: AddLedgerForm },
  'Sundry Debtors':           { title: 'Add Ledger',              subtitle: 'Group: Sundry Debtors',       component: AddLedgerForm },
  'Duties & Taxes':           { title: 'Add Ledger',              subtitle: 'Group: Duties & Taxes',       component: AddLedgerForm },
  'Custom Groups':            { title: 'Add Ledger',              subtitle: 'Custom Group',                component: AddLedgerForm },
  'Record Payment':           { title: 'Record Payment',          subtitle: 'Financials · Payments',       component: VoucherForm, initialType: 'Payment' },
  'Record Receipt':           { title: 'Record Receipt',          subtitle: 'Financials · Receipts',       component: VoucherForm, initialType: 'Receipt' },
  'Record Expense':           { title: 'Record Expense',          subtitle: 'Financials · Expenses',       component: VoucherForm, initialType: 'Payment' },
};

export default function CreateModal({ formKey, onClose }) {
  if (!formKey) return null;
  const config = FORM_MAP[formKey];
  if (!config) return null;
  const FormComponent = config.component;
  return (
    <FormModal open={true} onClose={onClose} title={config.title} subtitle={config.subtitle}>
      <FormComponent onClose={onClose} initialType={config.initialType} />
    </FormModal>
  );
}

export { FORM_MAP };
