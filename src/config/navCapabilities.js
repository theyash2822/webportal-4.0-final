/**
 * Module nav label → capability (sidebar + route + command palette fail-closed).
 * Keep in sync with AppShell NAV filtering.
 */
export const NAV_CAP = {
  Dashboard: 'dashboard.view',
  Sales: 'sales.view',
  Purchase: 'purchase.view',
  Vouchers: 'vouchers.view',
  Inventory: 'inventory.view',
  Expenses: 'expenses.view',
  Financials: 'financials.view',
  Compliance: 'compliance.view',
  Ledgers: 'ledgers.view',
  'Audit Trail': 'audit_trail.view',
  'AI Insights': 'ai_insights.view',
};

/** Path prefix → capability for command-palette / deep-link screens. */
export function capabilityForPath(path) {
  const p = String(path || '');
  if (p === '/' || p.startsWith('/kpi')) return NAV_CAP.Dashboard;
  if (p.startsWith('/sales')) return NAV_CAP.Sales;
  if (p.startsWith('/purchase')) return NAV_CAP.Purchase;
  if (p.startsWith('/vouchers')) return NAV_CAP.Vouchers;
  if (p.startsWith('/inventory')) return NAV_CAP.Inventory;
  if (p.startsWith('/expenses')) return NAV_CAP.Expenses;
  if (p.startsWith('/financials') || p.startsWith('/cashflow-report')) return NAV_CAP.Financials;
  if (p.startsWith('/compliance')) return NAV_CAP.Compliance;
  if (p.startsWith('/ledgers') || p.startsWith('/parties')) return NAV_CAP.Ledgers;
  if (p.startsWith('/audit-trail') || p.startsWith('/daybook')) return NAV_CAP['Audit Trail'];
  if (p.startsWith('/ai-insights')) return NAV_CAP['AI Insights'];
  return null;
}
