/* Shared building blocks for the create-form drawers.
 * Field specs mirror the mobile app (tallydekho-mobile-V4) — source of truth for parity. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Trash2, Search } from 'lucide-react';
import { Field, Input, Select, Button, Toggle, useLabelT } from '../kit';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { isDemoCompany } from '../../utils/isDemoCompany';
import { fyKey } from '../../utils/fyIdentity';
import api from '../../services/api';
import BarcodeGunInput from '../BarcodeGunInput';
import { readStockCache, writeStockCache } from '../../utils/stockCache';
import { todayLocalISO } from '../../utils/periodDates';

export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const todayISO = () => todayLocalISO();
export const inr = v => `₹${num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Data loading ──────────────────────────────────────────────────────────
 * useCreateData(['parties','items',...]) loads only what a form needs.
 * Available keys: parties (customers), partiesVendor, partiesExpense, partiesIncome,
 * ledgers, items, warehouses, banks, salesLedgers, purchaseLedgers, taxLedgers,
 * chargeLedgers (+ roundOffLedgers), stockGroups, stockUnits, countries.
 */
const LOADERS = {
  parties:         g => api.fetchParties({ companyGuid: g, pageSize: 500, type: 'customer' }),
  partiesVendor:   g => api.fetchParties({ companyGuid: g, pageSize: 500, type: 'vendor' }),
  partiesExpense:  g => api.fetchParties({ companyGuid: g, pageSize: 500, type: 'expense' }),
  partiesIncome:   g => api.fetchParties({ companyGuid: g, pageSize: 500, type: 'income' }),
  ledgers:         g => api.fetchLedgers({ companyGuid: g, pageSize: 2000, limit: 2000 }),
  items:           async (g, fy) => {
    const cacheKey = fyKey(fy) || 'fy';
    const cached = readStockCache(g, cacheKey);
    if (cached?.length) return cached;
    const res = await api.fetchStocks({ companyGuid: g, pageSize: 2000, limit: 2000 });
    const list = api.unwrapList(res) || [];
    if (list.length) writeStockCache(g, cacheKey, list);
    return list;
  },
  warehouses:      g => api.fetchWarehouses(g),
  banks:           g => api.fetchBankLedgers(g, 'all'),
  salesLedgers:    g => api.fetchSalesLedgerAccounts(g),
  purchaseLedgers: g => api.fetchPurchaseLedgerAccounts(g),
  taxLedgers:      g => api.fetchTaxLedgers(g),
  chargeLedgers:   g => api.fetchChargeLedgers(g),
  stockGroups:     g => api.fetchStockGroups(g),
  stockUnits:      g => api.fetchStockUnits(g),
  countries:       () => api.fetchGeoCountries(),
};

function assignLoaderResult(opt, key, result) {
  if (!result.ok) {
    opt[key] = [];
    if (key === 'chargeLedgers') opt.roundOffLedgers = [];
    return key;
  }
  if (key === 'chargeLedgers') {
    const d = result.r?.data;
    if (d && (Array.isArray(d.chargeLedgers) || Array.isArray(d.roundOffLedgers))) {
      opt.chargeLedgers = d.chargeLedgers || [];
      opt.roundOffLedgers = d.roundOffLedgers || [];
    } else {
      const normalized = api.normalizeChargeLedgers(result.r);
      opt.chargeLedgers = normalized.chargeLedgers;
      opt.roundOffLedgers = normalized.roundOffLedgers;
    }
    return null;
  }
  opt[key] = api.unwrapList(result.r) || [];
  return null;
}

export function useCreateData(keys) {
  // Same fallback as AppShell's top bar: an implicit first company counts as selected.
  const { selectedCompany, companies, selectedFY } = useAuth();
  const company = selectedCompany || (companies && companies[0]) || null;
  const guid = company?.guid;
  const [state, setState] = useState({ loading: true, error: '', opt: {} });
  const [retryN, setRetryN] = useState(0);
  const keyStr = keys.join(',');
  useEffect(() => {
    if (!guid) { setState({ loading: false, error: 'Select a company first.', opt: {} }); return; }
    let alive = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    const ks = keyStr.split(',').filter(Boolean);
    Promise.all(ks.map(k => LOADERS[k](guid, selectedFY).then(r => ({ ok: true, r })).catch(e => ({ ok: false, e }))))
      .then(results => {
        if (!alive) return;
        const opt = {};
        const failed = [];
        ks.forEach((k, i) => {
          const failKey = assignLoaderResult(opt, k, results[i]);
          if (failKey) failed.push(failKey);
        });
        setState({
          loading: false,
          error: failed.length ? `Could not load ${failed.join(', ')} — check the connection and retry.` : '',
          opt,
        });
      });
    return () => { alive = false; };
  }, [guid, keyStr, retryN, selectedFY?.uniqueId, selectedFY?.finYear]);
  return { ...state, company, retry: () => setRetryN(n => n + 1) };
}

/** Reads numbering_policy from compliance config (same as mobile useNumberingPolicy). */
export function useNumberingPolicy(companyGuid) {
  const [policy, setPolicy] = useState('tally_prime_series');
  useEffect(() => {
    if (!companyGuid) return undefined;
    let alive = true;
    api.fetchComplianceConfig(companyGuid)
      .then(res => {
        if (!alive) return;
        const cfg = res?.data || res || {};
        setPolicy(cfg.numbering_policy === 'tallydekho_series' ? 'tallydekho_series' : 'tally_prime_series');
      })
      .catch(() => { if (alive) setPolicy('tally_prime_series'); });
    return () => { alive = false; };
  }, [companyGuid]);
  return policy;
}

const nameOf = x => (typeof x === 'string' ? x : x?.name || x?.ledgerName || x?.ledger_name || '');
export const namesOf = list => (list || []).map(nameOf).filter(Boolean);

/** Normalize option rows so SearchSelect always has `.name` (charge ledgers use ledgerName). */
export const asSelectOptions = list => (list || []).map(o => {
  if (typeof o === 'string') return { name: o };
  const name = nameOf(o);
  return name ? { ...o, name } : null;
}).filter(Boolean);

/* ── SearchSelect — portal menu (survives drawer overflow) + Escape capture ─ */
const SEARCH_SELECT_SHOW = 200;

function menuPositionFor(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom;
  const spaceAbove = r.top;
  const preferDown = spaceBelow >= 200 || spaceBelow >= spaceAbove;
  const maxH = Math.min(360, Math.max(140, (preferDown ? spaceBelow : spaceAbove) - 16));
  return {
    left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
    width: r.width,
    maxH,
    top: preferDown ? r.bottom + 4 : undefined,
    bottom: preferDown ? undefined : window.innerHeight - r.top + 4,
  };
}

export function SearchSelect({ value, onChange, options = [], placeholder = 'Search…', testid, subOf, disabled, required, translateOptions = false }) {
  const lt = useLabelT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    const all = asSelectOptions(options);
    return lower ? all.filter(o => o.name.toLowerCase().includes(lower)) : all;
  }, [options, q]);
  const rows = filtered.slice(0, SEARCH_SELECT_SHOW);
  const hiddenCount = Math.max(0, filtered.length - rows.length);

  const place = useCallback(() => {
    setPos(menuPositionFor(btnRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onReposition = () => place();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, place, filtered.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        data-testid={testid}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className={`flex h-11 w-full items-center justify-between rounded-xl border border-line bg-cream px-3.5 text-left text-[13px] transition-colors focus:border-ink disabled:opacity-50 ${value ? 'text-ink' : 'text-ink-faint'}`}
      >
        <span className="truncate">{value ? (translateOptions ? lt(value) : value) : lt(placeholder)}</span>
        <ChevronDown size={14} className="flex-shrink-0 text-ink-faint" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          data-testid={testid ? `${testid}-menu` : undefined}
          className="fixed z-[320] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          style={{
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={13} className="text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={lt('Type to filter…')}
              data-testid={testid ? `${testid}-search` : undefined}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: pos.maxH }}>
            {!required && value && (
              <button type="button" className="block w-full px-3.5 py-2 text-left text-[12px] text-ink-faint hover:bg-cream"
                onClick={() => { onChange(''); setOpen(false); }}>{lt('Clear selection')}</button>
            )}
            {rows.length === 0 && <p className="px-3.5 py-3 text-[12px] text-ink-faint">{lt('No matches')}</p>}
            {rows.map(o => (
              <button key={o.guid || o.name} type="button"
                onClick={() => { onChange(o.name, o); setOpen(false); }}
                className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-cream ${o.name === value ? 'bg-cream font-medium text-ink' : 'text-ink'}`}>
                {translateOptions ? lt(o.name) : o.name}
                {subOf && subOf(o) && <span className="mt-0.5 block text-[11px] text-ink-faint">{subOf(o)}</span>}
              </button>
            ))}
          </div>
          {(hiddenCount > 0 || filtered.length > 40) && (
            <div className="border-t border-line px-3 py-1.5 text-[11px] text-ink-faint">
              {hiddenCount > 0
                ? lt(`Showing ${rows.length} of ${filtered.length} — type to narrow`)
                : lt(`${filtered.length} matches`)}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Small shared controls ────────────────────────────────────────────────── */
export function FormSection({ title, sub, children, defaultOpen = true, testid }) {
  const lt = useLabelT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-line bg-surface" data-testid={testid}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="block text-[13px] font-semibold text-ink">{lt(title)}</span>
          {sub && <span className="mt-0.5 block text-[11px] text-ink-faint">{lt(sub)}</span>}
        </span>
        <ChevronDown size={15} className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line px-4 py-4">{children}</div>}
    </section>
  );
}

export function EntryTypeToggle({ value, onChange, testid = 'form-entry-type' }) {
  const lt = useLabelT();
  return (
    <Field label="Entry type" hint="Optional entries are saved to Tally as optional vouchers (no books impact until confirmed).">
      <div className="flex gap-2" data-testid={testid}>
        {['regular', 'optional'].map(v => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`h-9 flex-1 rounded-lg border text-[12px] font-medium capitalize transition-colors ${value === v ? 'border-ink bg-ink text-white' : 'border-line bg-cream text-ink-soft hover:border-ink'}`}>
            {lt(v)}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function ToggleRow({ label, hint, checked, onChange, testid }) {
  const lt = useLabelT();
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[13px] text-ink">{lt(label)}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-ink-faint">{lt(hint)}</span>}
      </span>
      <Toggle checked={!!checked} onChange={onChange} testid={testid} />
    </div>
  );
}

/* ── Item lines (invoices / orders / delivery) ─────────────────────────────
 * Line shape: { name, qty, rate, unit, discount, discountType, godown, _godowns:[{name,qty}], taxEntries:[] }
 * lineAmount() applies discount. Mobile default unit fallbacks: Pcs/Kg/Ltr/Mtr/Box/Nos.
 */
export const UNIT_FALLBACK = ['Pcs', 'Kg', 'Ltr', 'Mtr', 'Box', 'Nos'];
let lineSeq = 0;
export const emptyTaxEntry = () => ({ ledgerName: '', taxRate: '', taxAmount: '' });
export const emptyLine = () => ({
  _id: `ln-${++lineSeq}-${Date.now()}`,
  name: '', qty: 1, rate: '', unit: '', discount: 0, discountType: 'percentage',
  godown: '', _godowns: null, taxEntries: [],
});

export const lineAmount = l => {
  const gross = num(l.qty) * num(l.rate);
  const d = num(l.discount);
  if (!d) return gross;
  return l.discountType === 'amount' ? Math.max(0, gross - d) : Math.max(0, gross * (1 - d / 100));
};

export function LineItemsEditor({
  lines, setLines, items, warehouses, taxLedgers,
  showDiscount = true, showGodown = true, showLineTaxes = false, showBarcode = false,
  testid = 'form-lines',
}) {
  const lt = useLabelT();
  const { selectedCompany, companies } = useAuth();
  const activeCompany = selectedCompany || (companies && companies[0]) || null;
  const itemByName = useMemo(() => Object.fromEntries((items || []).map(i => [i.name, i])), [items]);
  const [barcode, setBarcode] = useState('');
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [barcodeErr, setBarcodeErr] = useState('');

  const update = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const applyGodowns = (lineId, name, gods) => {
    setLines(ls => ls.map(l => l._id === lineId && l.name === name
      ? { ...l, _godowns: gods, godown: gods.length === 1 ? gods[0].name : (l.godown && gods.some(g => g.name === l.godown) ? l.godown : '') }
      : l));
  };

  const pickItem = async (i, name) => {
    const it = itemByName[name] || {};
    const lineId = lines[i]?._id;
    // Mobile leaves rate blank on item pick (user enters rate); only unit is prefilled.
    update(i, { name, unit: it.unit || it.base_unit || '', rate: '', godown: '', _godowns: null });
    // Per-item godowns only — never fall back to the global warehouse list (mobile rule).
    try {
      const stockId = it.guid || it.stock_guid || it.id || name;
      const res = await api.fetchStockGodowns(activeCompany?.guid, stockId, {
        fallbackQty: Number(it.closing_qty ?? it.qty ?? 0) || 0,
      });
      const gods = api.normalizeStockGodowns(res, Number(it.closing_qty ?? it.qty ?? 0) || 0);
      applyGodowns(lineId, name, gods);
    } catch {
      applyGodowns(lineId, name, [{ name: 'Main Location', qty: Number(it.closing_qty ?? it.qty ?? 0) || 0 }]);
    }
  };

  const scanBarcode = async (codeOverride) => {
    const code = String(codeOverride ?? barcode).trim();
    if (!code || !activeCompany?.guid || barcodeBusy) return;
    setBarcodeBusy(true);
    setBarcodeErr('');
    try {
      const res = await api.lookupBarcode(activeCompany.guid, code);
      const hit = res?.data || res || {};
      const itemName = hit.item_name || hit.stock_name || hit.name || hit.stockItemName;
      const matched = (items || []).find(it =>
        it.name === itemName
        || it.guid === hit.stock_guid
        || it.guid === hit.stockGuid
        || it.barcode === code
      );
      const name = matched?.name || itemName;
      if (!name) throw new Error('No stock item linked to this barcode');
      setLines(ls => {
        const emptyIdx = ls.findIndex(l => !l.name);
        if (emptyIdx >= 0) {
          // Trigger godown load after state update
          queueMicrotask(() => pickItem(emptyIdx, name));
          return ls;
        }
        const next = emptyLine();
        queueMicrotask(() => {
          setLines(cur => {
            const idx = cur.findIndex(l => l._id === next._id);
            if (idx >= 0) queueMicrotask(() => pickItem(idx, name));
            return cur;
          });
        });
        return [...ls, next];
      });
      setBarcode('');
    } catch (e) {
      setBarcodeErr(e?.message || 'Barcode lookup failed');
    } finally {
      setBarcodeBusy(false);
    }
  };

  // When company has exactly one warehouse and line has no godowns yet, seed for new blank lines
  const soleWarehouse = (warehouses || []).length === 1 ? nameOf(warehouses[0]) : '';

  return (
    <div className="space-y-3" data-testid={testid}>
      {showBarcode && (
        <div className="rounded-xl border border-line bg-cream/60 p-3">
          <Field label="Barcode gun" className="mb-0">
            <BarcodeGunInput
              testid={`${testid}-barcode-gun`}
              disabled={barcodeBusy}
              onScan={code => { setBarcode(code); scanBarcode(); }}
            />
          </Field>
          {barcodeErr && <p className="mt-2 text-[12px] text-neg">{barcodeErr}</p>}
        </div>
      )}
      {lines.map((l, i) => {
        const godownOpts = (l._godowns && l._godowns.length)
          ? l._godowns
          : (l.name ? [{ name: 'Main Location', qty: 0 }] : (soleWarehouse ? [{ name: soleWarehouse, qty: 0 }] : []));
        return (
          <div key={l._id || i} className="rounded-xl border border-line bg-cream p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Item" className="sm:col-span-2">
                <SearchSelect value={l.name} required onChange={name => pickItem(i, name)} options={items || []}
                  subOf={o => [o.sku, o.closing_qty != null ? `${o.closing_qty} ${o.unit || ''}` : null].filter(Boolean).join(' · ')}
                  testid={`${testid}-item-${i}`} placeholder="Select item…" />
              </Field>
              <Field label="Quantity">
                <Input type="number" min="0" step="any" value={l.qty} data-testid={`${testid}-qty-${i}`}
                  onChange={e => update(i, { qty: e.target.value })} />
              </Field>
              <Field label="Rate (₹)">
                <Input type="number" min="0" step="any" value={l.rate} data-testid={`${testid}-rate-${i}`}
                  onChange={e => update(i, { rate: e.target.value })} />
              </Field>
              <Field label="Unit">
                <Select value={l.unit || ''} onChange={e => update(i, { unit: e.target.value })} data-testid={`${testid}-unit-${i}`}>
                  <option value="">—</option>
                  {[...new Set([l.unit, ...UNIT_FALLBACK].filter(Boolean))].map(u => <option key={u}>{u}</option>)}
                </Select>
              </Field>
              {showDiscount && (
                <Field label="Discount">
                  <div className="flex gap-2">
                    <Input type="number" min="0" step="any" value={l.discount} data-testid={`${testid}-discount-${i}`}
                      onChange={e => update(i, { discount: e.target.value })} className="flex-1" />
                    <Select value={l.discountType} onChange={e => update(i, { discountType: e.target.value })} className="w-20">
                      <option value="percentage">%</option>
                      <option value="amount">₹</option>
                    </Select>
                  </div>
                </Field>
              )}
              {showGodown && (
                <Field label="Warehouse" hint={l.name && !l._godowns ? lt('Loading item godowns…') : undefined}>
                  <SearchSelect
                    value={l.godown}
                    required={!!l.name}
                    onChange={g => update(i, { godown: g })}
                    options={godownOpts}
                    subOf={o => (o.qty != null ? `${lt('Available')}: ${o.qty}` : null)}
                    testid={`${testid}-godown-${i}`}
                    placeholder={l.name ? lt('Select warehouse…') : lt('Select item first')}
                    disabled={!l.name}
                  />
                </Field>
              )}
            </div>
            {showLineTaxes && l.name && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-2 text-[11px] font-medium text-ink-soft">{lt('Line taxes')}</p>
                <TaxRowsEditor
                  taxes={l.taxEntries || []}
                  setTaxes={fn => update(i, { taxEntries: typeof fn === 'function' ? fn(l.taxEntries || []) : fn })}
                  taxLedgers={taxLedgers}
                  taxableValue={lineAmount(l)}
                  testid={`${testid}-tax-${i}`}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12px] text-ink-faint tabular">{lt('Line total:')} {inr(lineAmount(l))}</span>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                  data-testid={`${testid}-remove-${i}`}
                  className="flex items-center gap-1 text-[12px] text-neg hover:underline"><Trash2 size={12} /> {lt('Remove')}</button>
              )}
            </div>
          </div>
        );
      })}
      <Button data-testid={`${testid}-add`} onClick={() => setLines(ls => [...ls, { ...emptyLine(), godown: soleWarehouse || '' }])}>
        <Plus size={13} className="mr-1 inline" /> {lt('Add item')}
      </Button>
    </div>
  );
}

/* ── Tax rows — {ledgerName, taxRate, taxAmount(override optional)} ───────── */
export function TaxRowsEditor({ taxes, setTaxes, taxLedgers, taxableValue, testid = 'form-taxes' }) {
  const lt = useLabelT();
  const ledByName = useMemo(() => Object.fromEntries((taxLedgers || []).map(t => [t.name || t.ledgerName || t.ledger_name, t])), [taxLedgers]);
  const update = (i, patch) => setTaxes(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2" data-testid={testid}>
      {taxes.map((t, i) => {
        const auto = num(taxableValue) * num(t.taxRate) / 100;
        return (
          <div key={i} className="grid grid-cols-[1fr_90px_110px_32px] items-end gap-2">
            <Field label={i === 0 ? 'Tax ledger' : ''}>
              <SearchSelect value={t.ledgerName} required
                onChange={(name) => update(i, { ledgerName: name, taxRate: t.taxRate || ledByName[name]?.taxRate || ledByName[name]?.tax_rate || ledByName[name]?.rate || '' })}
                options={taxLedgers || []} testid={`${testid}-ledger-${i}`} placeholder="GST ledger…" />
            </Field>
            <Field label={i === 0 ? 'Rate %' : ''}>
              <Input type="number" min="0" step="any" value={t.taxRate} data-testid={`${testid}-rate-${i}`}
                onChange={e => update(i, { taxRate: e.target.value })} />
            </Field>
            <Field label={i === 0 ? 'Amount' : ''}>
              <Input type="number" min="0" step="any" value={t.taxAmount ?? ''} placeholder={auto ? auto.toFixed(2) : '0.00'}
                data-testid={`${testid}-amount-${i}`} onChange={e => update(i, { taxAmount: e.target.value })} />
            </Field>
            <button type="button" onClick={() => setTaxes(ts => ts.filter((_, j) => j !== i))}
              className="mb-1 flex h-9 items-center justify-center text-ink-faint hover:text-neg"><Trash2 size={13} /></button>
          </div>
        );
      })}
      <Button data-testid={`${testid}-add`} onClick={() => setTaxes(ts => [...ts, { ledgerName: '', taxRate: '', taxAmount: '' }])}>
        <Plus size={13} className="mr-1 inline" /> {lt('Add tax')}
      </Button>
    </div>
  );
}

/** Resolve tax rows to payload: {ledgerName, taxRate, taxAmount, taxableValue} */
export const taxesPayload = (taxes, taxableValue) =>
  (taxes || []).filter(t => t.ledgerName).map(t => ({
    ledgerName: t.ledgerName,
    taxRate: num(t.taxRate),
    taxAmount: t.taxAmount !== '' && t.taxAmount != null ? num(t.taxAmount) : +(num(taxableValue) * num(t.taxRate) / 100).toFixed(2),
    taxableValue: num(taxableValue),
  }));

export const taxesTotal = (taxes, taxableValue) =>
  taxesPayload(taxes, taxableValue).reduce((s, t) => s + num(t.taxAmount), 0);

/** Flatten per-line taxEntries the same way mobile create-invoice builds `taxes[]`. */
export const flattenLineTaxes = lines =>
  (lines || []).flatMap(line => {
    if (!line?.name) return [];
    const taxable = lineAmount(line);
    return taxesPayload(line.taxEntries || [], taxable);
  });

export const lineTaxesTotal = lines =>
  flattenLineTaxes(lines).reduce((s, t) => s + num(t.taxAmount), 0);

/* ── Additional charges / logistics — [{ledgerName, amount, taxes:[]}] ────── */
export function ChargesEditor({ charges, setCharges, chargeLedgers, taxLedgers, testid = 'form-charges' }) {
  const lt = useLabelT();
  const update = (i, patch) => setCharges(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3" data-testid={testid}>
      {charges.map((c, i) => (
        <div key={i} className="rounded-xl border border-line bg-cream p-3">
          <div className="grid grid-cols-[1fr_120px_32px] items-end gap-2">
            <Field label="Charge ledger">
              <SearchSelect value={c.ledgerName} required onChange={n => update(i, { ledgerName: n })}
                options={chargeLedgers || []} testid={`${testid}-ledger-${i}`} placeholder="Freight, packing…" />
            </Field>
            <Field label="Amount (₹)">
              <Input type="number" step="any" value={c.amount} data-testid={`${testid}-amount-${i}`}
                onChange={e => update(i, { amount: e.target.value })} />
            </Field>
            <button type="button" onClick={() => setCharges(cs => cs.filter((_, j) => j !== i))}
              className="mb-1 flex h-9 items-center justify-center text-ink-faint hover:text-neg"><Trash2 size={13} /></button>
          </div>
          <div className="mt-2">
            <ToggleRow label="Add tax on this charge" checked={!!c._withTax}
              onChange={v => update(i, { _withTax: v, taxes: v ? (c.taxes?.length ? c.taxes : [{ ledgerName: '', taxRate: '', taxAmount: '' }]) : [] })}
              testid={`${testid}-withtax-${i}`} />
            {c._withTax && (
              <div className="mt-2">
                <TaxRowsEditor taxes={c.taxes || []} setTaxes={fn => update(i, { taxes: typeof fn === 'function' ? fn(c.taxes || []) : fn })}
                  taxLedgers={taxLedgers} taxableValue={num(c.amount)} testid={`${testid}-tax-${i}`} />
              </div>
            )}
          </div>
        </div>
      ))}
      <Button data-testid={`${testid}-add`} onClick={() => setCharges(cs => [...cs, { ledgerName: '', amount: '', taxes: [] }])}>
        <Plus size={13} className="mr-1 inline" /> {lt('Add charge')}
      </Button>
    </div>
  );
}

export const chargesPayload = charges =>
  (charges || []).filter(c => c.ledgerName && num(c.amount) !== 0).map(c => ({
    ledgerName: c.ledgerName,
    amount: num(c.amount),
    taxes: taxesPayload(c.taxes, num(c.amount)),
  }));

export const chargesTotal = charges =>
  chargesPayload(charges).reduce((s, c) => s + c.amount + c.taxes.reduce((x, t) => x + t.taxAmount, 0), 0);

/* ── Dispatch details (snake_case keys exactly as mobile) ─────────────────── */
export const emptyDispatch = () => ({
  dispatch_from: '', dispatch_state: '', dispatch_address1: '', dispatch_address2: '', dispatch_pincode: '',
  ship_to: '', ship_state: '', ship_address1: '', ship_address2: '', ship_pincode: '',
  transporter_name: '', transporter_id: '', transport_mode: 'Road', vehicle_number: '', vehicle_type: 'Regular',
  transport_doc_no: '', transport_doc_date: '',
});

export function DispatchSection({ value, onChange, testid = 'form-dispatch' }) {
  const lt = useLabelT();
  const set = (k, v) => onChange({ ...value, [k]: v });
  const F = (k, label, props = {}) => (
    <Field label={label}>
      <Input value={value[k] || ''} onChange={e => set(k, e.target.value)} data-testid={`${testid}-${k}`} {...props} />
    </Field>
  );
  return (
    <div className="space-y-4" data-testid={testid}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{lt('Dispatch from')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {F('dispatch_from', 'City')}{F('dispatch_state', 'State')}
        {F('dispatch_address1', 'Address line 1')}{F('dispatch_address2', 'Address line 2')}
        {F('dispatch_pincode', 'Pincode', { maxLength: 6, inputMode: 'numeric' })}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{lt('Ship to')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {F('ship_to', 'City')}{F('ship_state', 'State')}
        {F('ship_address1', 'Address line 1')}{F('ship_address2', 'Address line 2')}
        {F('ship_pincode', 'Pincode', { maxLength: 6, inputMode: 'numeric' })}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{lt('Transport')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {F('transporter_name', 'Transporter name')}{F('transporter_id', 'Transporter ID')}
        <Field label="Transport mode">
          <Select value={value.transport_mode || 'Road'} onChange={e => set('transport_mode', e.target.value)} data-testid={`${testid}-transport_mode`}>
            {['Road', 'Rail', 'Air', 'Ship'].map(m => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        {F('vehicle_number', 'Vehicle number')}
        <Field label="Vehicle type">
          <Select value={value.vehicle_type || 'Regular'} onChange={e => set('vehicle_type', e.target.value)} data-testid={`${testid}-vehicle_type`}>
            {['Regular', 'Over Dimensional Cargo'].map(m => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        {F('transport_doc_no', 'Transport doc no.')}
        <Field label="Transport doc date">
          <Input type="date" value={value.transport_doc_date || ''} onChange={e => set('transport_doc_date', e.target.value)} data-testid={`${testid}-transport_doc_date`} />
        </Field>
      </div>
    </div>
  );
}

/* ── Bill allocations (payment/receipt) ────────────────────────────────────
 * bills: rows from /party/outstanding-bills. allocations state: {[billName]: amountString}
 * remainderMode: 'On Account' | 'Advance'
 */
export function BillAllocations({ bills, allocations, setAllocations, amount, remainderMode, setRemainderMode, testid = 'form-bills' }) {
  const lt = useLabelT();
  const allocated = Object.values(allocations).reduce((s, v) => s + num(v), 0);
  const remainder = num(amount) - allocated;
  const autoFifo = () => {
    let left = num(amount);
    const next = {};
    for (const b of bills) {
      if (left <= 0) break;
      const due = Math.abs(num(b.pending_amount ?? b.amount ?? b.closing_balance));
      const take = Math.min(left, due);
      if (take > 0) { next[b.bill_name || b.name] = String(+take.toFixed(2)); left -= take; }
    }
    setAllocations(next);
  };
  if (!bills?.length) return <p className="text-[12px] text-ink-faint">{lt('No outstanding bills for this party — the full amount will be recorded On Account.')}</p>;
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-soft">{lt('Allocate against outstanding bills')}</p>
        <Button onClick={autoFifo} data-testid={`${testid}-fifo`}>{lt('Auto (FIFO)')}</Button>
      </div>
      {bills.map(b => {
        const key = b.bill_name || b.name;
        const due = Math.abs(num(b.pending_amount ?? b.amount ?? b.closing_balance));
        const checked = allocations[key] !== undefined;
        return (
          <div key={key} className="flex items-center gap-3 rounded-lg border border-line bg-cream px-3 py-2">
            <input type="checkbox" checked={checked} data-testid={`${testid}-check-${key}`}
              onChange={e => setAllocations(a => {
                const next = { ...a };
                if (e.target.checked) next[key] = String(Math.min(due, Math.max(0, num(amount) - Object.entries(a).filter(([k]) => k !== key).reduce((s, [, v]) => s + num(v), 0))).toFixed(2));
                else delete next[key];
                return next;
              })} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-ink">{key}</p>
              <p className="text-[11px] text-ink-faint tabular">{lt('Due')} {inr(due)}{b.bill_date ? ` · ${b.bill_date}` : ''}</p>
            </div>
            {checked && (
              <Input type="number" step="any" min="0" max={due} value={allocations[key]} data-testid={`${testid}-amt-${key}`}
                onChange={e => setAllocations(a => ({ ...a, [key]: num(e.target.value) > due ? String(due) : e.target.value }))} className="w-28" />
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1 text-[12px]">
        <span className={remainder < -0.01 ? 'font-medium text-neg' : 'text-ink-faint'}>
          {remainder < -0.01 ? <>{lt('Over-allocated by')} {inr(-remainder)}</> : <>{lt('Unallocated:')} {inr(Math.max(0, remainder))}</>}
        </span>
        {remainder > 0.01 && (
          <Select value={remainderMode} onChange={e => setRemainderMode(e.target.value)} className="w-36" data-testid={`${testid}-remainder`}>
            <option>On Account</option>
            <option>Advance</option>
          </Select>
        )}
      </div>
    </div>
  );
}

export const billAllocationsPayload = (allocations, amount, remainderMode) => {
  const out = Object.entries(allocations)
    .filter(([, v]) => num(v) > 0)
    .map(([billRefName, v]) => ({ billRefName, billType: 'Agst Ref', amount: num(v) }));
  const remainder = num(amount) - out.reduce((s, b) => s + b.amount, 0);
  if (remainder > 0.01) {
    out.push(remainderMode === 'Advance'
      ? { billType: 'Advance', billRefName: `TDK-ADV-${Date.now().toString().slice(-6)}`, amount: +remainder.toFixed(2) }
      : { billType: 'On Account', amount: +remainder.toFixed(2) });
  }
  return out;
};

/* ── Submit plumbing shared by every form ─────────────────────────────────── */
export function useSubmit() {
  const lt = useLabelT();
  const { pairingStatus, selectedCompany } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const inFlight = useRef(false);
  const run = useCallback(async fn => {
    if (inFlight.current) return null;
    const demo = isDemoCompany(selectedCompany);
    if (!demo && String(pairingStatus || '').toUpperCase() !== 'CONNECTED') {
      setError(lt('Connect Tally and complete the first sync before creating live entries.'));
      return null;
    }
    inFlight.current = true;
    setError(''); setSaving(true);
    try {
      const res = await fn();
      if (res?.status === false || res?.success === false) throw new Error(res?.message || lt('Tally rejected the entry'));
      const tdkRef = res?.tdkReferenceNo || res?.data?.tdkReferenceNo || res?.tdkRef || res?.data?.tdkRef || '';
      const label = tdkRef
        || res?.data?.voucherNumber || res?.voucherNumber
        || res?.invoiceNumber || res?.data?.invoiceNumber
        || lt('Saved');
      setDone({ label: String(label), tdkRef: String(tdkRef || label), raw: res });
      return res;
    } catch (e) {
      setError(e?.message || lt('Unable to submit to Tally'));
      return null;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [pairingStatus, selectedCompany, lt]);
  return { saving, error, setError, done, run };
}

export function FormError({ error, testid = 'create-form-error' }) {
  const lt = useLabelT();
  if (!error) return null;
  return <p data-testid={testid} className="rounded-xl bg-neg-bg px-3.5 py-2.5 text-[13px] text-neg">{lt(error)}</p>;
}

export function DoneState({ done, title, companyGuid, onViewDocument }) {
  const lt = useLabelT();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const label = typeof done === 'object' && done ? done.label : done;
  const tdkRef = typeof done === 'object' && done ? (done.tdkRef || done.label) : done;
  const viewDoc = () => {
    if (onViewDocument) onViewDocument(tdkRef);
    else if (tdkRef) navigate(`/document/${encodeURIComponent(tdkRef)}?preview=1`);
  };
  const share = async () => {
    if (!tdkRef || !companyGuid || sharing) return;
    setSharing(true);
    setShareMsg('');
    try {
      await api.shareTallyInvoicePdf(tdkRef, { companyGuid });
      window.open(`https://wa.me/?text=${encodeURIComponent(`${title || 'Invoice'} ${tdkRef}`)}`, '_blank', 'noopener,noreferrer');
      setShareMsg(lt('Share PDF requested'));
    } catch (e) {
      setShareMsg(e?.message || lt('Share PDF failed'));
    } finally {
      setSharing(false);
    }
  };
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-semibold text-ink">{lt(title)} {lt('saved')}</p>
      <p className="mt-1 text-[13px] text-ink-soft tabular" data-testid="create-form-done-ref">{label}</p>
      <p className="mt-3 text-[12px] text-ink-faint">{lt('Queued for the desktop agent to post into Tally.')}</p>
      {companyGuid && tdkRef && String(tdkRef).startsWith('TD') && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button variant="primary" data-testid="create-view-document" onClick={viewDoc}>{lt('View document')}</Button>
          <Button data-testid="create-share-pdf" disabled={sharing} onClick={share}>
            {sharing ? lt('Sharing…') : lt('Share PDF (Tally)')}
          </Button>
          {shareMsg && <p className="text-[12px] text-ink-soft">{shareMsg}</p>}
        </div>
      )}
    </div>
  );
}

export function TotalBar({ label = 'Total', value, testid = 'form-total' }) {
  const lt = useLabelT();
  return (
    <div className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
      <span className="text-[12px] font-medium uppercase tracking-wide opacity-70">{lt(label)}</span>
      <span className="text-[16px] font-bold tabular" data-testid={testid}>{inr(value)}</span>
    </div>
  );
}
