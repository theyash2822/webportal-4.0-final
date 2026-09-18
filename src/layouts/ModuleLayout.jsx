// Persistent module workspace: header, KPIs and inner nav stay mounted — only the panel swaps.
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Page, SegTabs, useLabelT } from '../components/kit';
import { useCompanyMeta } from '../pages/shared';
/* Inventory is big enough to need two levels: section row + the views inside that section. */
export const INVENTORY_SECTIONS = [
  {
    label: 'Stock',
    items: [
      { label: 'Overview', to: '/inventory' },
      { label: 'Items', to: '/inventory/items', end: false },
      { label: 'Snapshot', to: '/inventory/snapshot' },
      { label: 'On-hand by godown', to: '/inventory/on-hand' },
      { label: 'Valuation summary', to: '/inventory/valuation-summary' },
    ],
  },
  {
    label: 'Movement',
    items: [
      { label: 'Stock ledger', to: '/inventory/stock-ledger' },
      { label: 'Transfers', to: '/inventory/transfers', end: false },
      { label: 'Adjustments', to: '/inventory/adjustments' },
      { label: 'Movement analytics', to: '/inventory/movement-analytics' },
    ],
  },
  {
    label: 'Watchlists',
    items: [
      { label: 'Reorder queue', to: '/inventory/reorder-queue' },
      { label: 'Negative stock', to: '/inventory/negative-stock' },
      { label: 'Aged items', to: '/inventory/aged-items' },
      { label: 'Fast / slow moving', to: '/inventory/fast-slow' },
      { label: 'Expiry schedule', to: '/inventory/expiry-schedule' },
    ],
  },
  {
    label: 'Locations & labels',
    items: [
      { label: 'Warehouses', to: '/inventory/warehouses', end: false },
      { label: 'Barcodes', to: '/inventory/barcodes' },
      { label: 'Print barcodes', to: '/inventory/print-barcodes' },
      { label: 'Label preview', to: '/inventory/label-preview' },
      { label: 'Print settings', to: '/inventory/print-settings' },
    ],
  },
  { label: 'Configuration', items: [{ label: 'Stock settings', to: '/inventory/settings' }] },
];

export const SETTINGS_SECTIONS = [
  {
    label: 'Account',
    items: [
      { label: 'Profile', to: '/settings/profile' },
      { label: 'License', to: '/settings/license' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Company', to: '/settings/company' },
      { label: 'Team & Access', to: '/settings/team' },
      { label: 'Invitations', to: '/settings/invitations' },
      { label: 'Billing & Credits', to: '/settings/billing' },
      { label: 'Payment modes', to: '/settings/payment-modes' },
      { label: 'Workspace lifecycle', to: '/settings/workspace-lifecycle' },
    ],
  },
  {
    label: 'Connection',
    items: [
      { label: 'Tally Sync', to: '/settings/tally-sync' },
      { label: 'Bank Feeds', to: '/settings/bank-feeds' },
      { label: 'Security', to: '/settings/security' },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { label: 'App Preferences', to: '/settings/preferences' },
      { label: 'Currency', to: '/settings/currency' },
      { label: 'Language', to: '/settings/language' },
    ],
  },
  {
    label: 'Alerts',
    items: [
      { label: 'Channels & Quiet Hours', to: '/settings/notification-channels' },
      { label: 'Payment Reminders', to: '/settings/payment-reminders' },
      { label: 'Compliance Reminders', to: '/settings/compliance-reminders' },
      { label: 'Stock Alerts', to: '/settings/stock-alerts' },
    ],
  },
  {
    label: 'Documents',
    items: [
      { label: 'Voucher Config', to: '/settings/voucher-config' },
      { label: 'E-Invoice', to: '/settings/einvoice' },
      { label: 'E-Way Bill', to: '/settings/ewb' },
      { label: 'Barcodes', to: '/settings/barcodes' },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Help & FAQ', to: '/settings/help' },
      { label: 'About', to: '/settings/about' },
    ],
  },
];

/** Two-level inner nav: section pills on top, that section's views underneath. */
function SectionTabs({ sections }) {
  const lt = useLabelT();
  const { pathname } = useLocation();
  const active =
    sections.find(s => s.items.some(it => it.to === pathname)) ||
    sections.find(s => s.items.some(it => pathname.startsWith(`${it.to}/`))) ||
    sections[0];

  return (
    <div className="space-y-3">
      <div className="flex" data-testid="module-sections">
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-line bg-surface p-1">
          {sections.map(s => (
            <NavLink
              key={s.label}
              to={s.items[0].to}
              data-testid={`module-section-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              className={`flex h-8 items-center whitespace-nowrap rounded-md px-4 text-[13px] font-medium transition-colors duration-150 ${
                s.label === active.label ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink-wash hover:text-ink'
              }`}
            >
              {lt(s.label)}
            </NavLink>
          ))}
        </div>
      </div>
      {active.items.length > 1 && <SegTabs items={active.items} variant="underline" testid="module-tabs" />}
    </div>
  );
}



export const FINANCIALS_TABS = [
  { to: '/financials/overview', label: 'Overview' },
  { to: '/financials/profit-loss', label: 'Profit & Loss' },
  { to: '/financials/balance-sheet', label: 'Balance Sheet' },
  { to: '/financials/trial-balance', label: 'Trial Balance' },
  { to: '/financials/cash-register', label: 'Cash Register' },
];

export const COMPLIANCE_TABS = [
  { to: '/compliance/gst', label: 'GST' },
  { to: '/compliance/alerts', label: 'Alerts' },
  { to: '/compliance/other-taxes', label: 'Other Taxes' },
  { to: '/compliance/einvoice', label: 'E-Invoice' },
  { to: '/compliance/einvoice-coverage', label: 'E-Invoice Coverage' },
  { to: '/compliance/eway-bill', label: 'E-Way Bill' },
  { to: '/compliance/eway-bill-coverage', label: 'EWB Coverage' },
];

export const AUDIT_TRAIL_TABS = [
  { to: '/audit-trail', label: 'My Entries' },
  { to: '/audit-trail/daybook', label: 'Day Book' },
];

export const SALES_TABS = [
  { id: 'invoices', to: '/sales', label: 'Invoices' },
  { id: 'register', to: '/sales/register', label: 'Register' },
  { id: 'orders', to: '/sales/orders', label: 'Order' },
  { id: 'credit-notes', to: '/sales/credit-notes', label: 'Credit Notes' },
  { id: 'delivery-notes', to: '/sales/delivery-notes', label: 'Delivery Notes' },
  { id: 'proforma', to: '/sales/proforma', label: 'Proforma' },
  { id: 'quotations', to: '/sales/quotations', label: 'Quotations' },
  { id: 'einvoice', to: '/sales/einvoice', label: 'E-Invoice' },
  { id: 'eway-bill', to: '/sales/eway-bill', label: 'E-Way Bill' },
];

export const PURCHASE_TABS = [
  { to: '/purchase', label: 'Invoices' },
  { to: '/purchase/register', label: 'Register' },
  { to: '/purchase/orders', label: 'Orders' },
  { to: '/purchase/debit-notes', label: 'Debit Notes' },
];

export const VOUCHER_TABS = [
  { to: '/vouchers', label: 'All' },
  { to: '/vouchers/payment', label: 'Payment' },
  { to: '/vouchers/receipt', label: 'Receipt' },
  { to: '/vouchers/journal', label: 'Journal' },
  { to: '/vouchers/contra', label: 'Contra' },
];

export default function ModuleLayout({ title, sections, tabs, Kpis, Actions, AfterTabs, testid = 'module-layout' }) {
  const { subtitle } = useCompanyMeta();
  return (
    <Page testid={testid} title={title} subtitle={subtitle} actions={Actions ? <Actions /> : null}>
      {Kpis && <Kpis />}
      {sections ? (
        <SectionTabs sections={sections} />
      ) : tabs && AfterTabs ? (
        <div className="flex flex-wrap items-start justify-between gap-3 xl:flex-nowrap" data-testid="module-tabs-row">
          <SegTabs items={tabs} />
          <AfterTabs />
        </div>
      ) : tabs ? (
        <SegTabs items={tabs} />
      ) : null}
      <Outlet />
    </Page>
  );
}
