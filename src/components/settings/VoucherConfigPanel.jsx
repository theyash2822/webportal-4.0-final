import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, Upload, X } from 'lucide-react';
import { Field, Input, Button, Card, useLabelT } from '../kit';
import { ToggleRow } from '../create/common';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { buildInvoiceHTML } from '../../utils/invoicePrint';
import PdfHtmlPreviewOverlay from '../PdfHtmlPreviewOverlay';
import {
  VOUCHER_TYPES,
  FORMAT_OPTIONS,
  defaultAllVoucherConfigs,
  resolveVoucherConfigSource,
  resolveDocumentFormat,
  bankInfoFromConfig,
  qrDataUrlFromConfig,
  writeLocalVoucherConfig,
  isThermalTemplateId,
  normalizeThermalWidth,
} from '../../utils/voucherConfig';
import { persistVoucherConfigs } from '../../utils/voucherPdfBuild';
import { buildThermalHTML } from '../../utils/thermalPrint';
import { sanitizeImageSrc } from '../../utils/sanitizeImageSrc';

function GeneratedQrPreview({ cfg }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (!cfg?.qrEnabled || cfg?.qrImage) return undefined;
    qrDataUrlFromConfig(cfg).then(url => {
      if (!cancelled) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [cfg?.qrEnabled, cfg?.qrType, cfg?.qrUpiId, cfg?.qrUrl, cfg?.qrIfsc, cfg?.qrAccount, cfg?.qrImage]);
  if (!src) return null;
  return <img src={src} alt="QR preview" className="h-24 w-24 rounded border border-line" />;
}

function FormatThumb({ type }) {
  const resolved = resolveDocumentFormat(type);
  const line = 'h-0.5 rounded-sm bg-[#D4D4D4]';
  if (resolved === 'tally_classic_v1') {
    return (
      <div className="aspect-[3/4] w-full rounded-sm bg-[#FAFAFA] p-1.5">
        <div className="mb-1 flex flex-col items-center gap-0.5">
          <div className={`${line} h-[3px] w-[70%]`} />
          <div className={`${line} w-[55%]`} />
          <div className={`${line} w-[40%]`} />
        </div>
        <div className="my-1 h-px bg-[#E8E8E8]" />
        <div className="flex justify-between"><div className={`${line} w-[38%]`} /><div className={`${line} w-[30%]`} /></div>
        <div className="my-1 h-px bg-[#E8E8E8]" />
        {[0, 1, 2].map(i => (
          <div key={i} className="my-0.5 flex justify-between gap-1">
            <div className={`${line} w-[6%]`} /><div className={`${line} w-[48%]`} /><div className={`${line} w-[18%]`} />
          </div>
        ))}
        <div className="mt-1 flex justify-end"><div className={`${line} h-[3px] w-[28%]`} /></div>
      </div>
    );
  }
  if (resolved === 'td_thermal_v1') {
    return (
      <div className="aspect-[3/4] w-full rounded-sm bg-[#FAFAFA] p-1.5">
        <div className="mx-auto w-[55%] space-y-1">
          <div className={`${line} mx-auto w-[80%]`} />
          <div className={`${line} mx-auto w-[65%]`} />
          <div className="my-1 h-px bg-[#D4D4D4]" />
          <div className={`${line} mx-auto w-[70%] h-[3px]`} />
          <div className="my-1 h-px bg-[#D4D4D4]" />
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-0.5">
              <div className={`${line} w-full`} />
              <div className="flex justify-between"><div className={`${line} w-[40%]`} /><div className={`${line} w-[30%]`} /></div>
            </div>
          ))}
          <div className="my-1 h-px bg-[#D4D4D4]" />
          <div className={`${line} ml-auto w-[45%] h-[3px]`} />
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-[3/4] w-full rounded-sm bg-[#FAFAFA] p-1.5">
      <div className="mb-1 flex">
        <div className="flex-1 pr-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-[#DADADA]" />
          <div className={`${line} mt-1 w-[80%]`} /><div className={`${line} mt-0.5 w-[60%]`} />
        </div>
        <div className="w-px bg-[#E8E8E8]" />
        <div className="flex flex-1 flex-col gap-0.5 pl-1">
          <div className={`${line} w-[80%]`} /><div className={`${line} w-[60%]`} /><div className={`${line} w-[70%]`} />
        </div>
      </div>
      <div className="my-1 h-px bg-[#E8E8E8]" />
      {[0, 1].map(i => (
        <div key={i} className="my-0.5 flex justify-between gap-1">
          <div className={`${line} w-[6%]`} /><div className={`${line} w-[48%]`} /><div className={`${line} w-[18%]`} />
        </div>
      ))}
      <div className="mt-1 flex items-end gap-1">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className={`${line} w-[85%]`} /><div className={`${line} w-[65%]`} />
        </div>
        <div className="h-4 w-4 rounded-full border border-[#D4D4D4]" />
      </div>
    </div>
  );
}

function RadioOption({ active, label, sub, onSelect, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
        active ? 'border-ink bg-cream/60' : 'border-line bg-paper hover:bg-cream/40'
      }`}
    >
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-ink' : 'border-line'}`}>
        {active ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {sub ? <span className="mt-0.5 block text-[11px] text-ink-soft">{sub}</span> : null}
      </span>
    </button>
  );
}

export default function VoucherConfigPanel() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const [configs, setConfigs] = useState(defaultAllVoucherConfigs());
  const [expanded, setExpanded] = useState('sales_inv');
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewBusy, setPreviewBusy] = useState('');
  const logoRef = useRef('');

  const [numberingPolicy, setNumberingPolicy] = useState('tally_prime_series');
  const [eInvoiceApplicable, setEInvoiceApplicable] = useState('not_applicable');
  const [eInvoiceMode, setEInvoiceMode] = useState('manual');
  const [eWayBillApplicable, setEWayBillApplicable] = useState('not_applicable');
  const [eWayBillMode, setEWayBillMode] = useState('manual');
  const [complianceDirty, setComplianceDirty] = useState(false);
  const [savingCompliance, setSavingCompliance] = useState(false);

  const markDirty = () => setDirty(true);

  const load = useCallback(async () => {
    if (!guid) return;
    setLoading(true);
    try {
      const [settingsRes, complianceRes, bankRes, logoRes] = await Promise.all([
        api.getUserSettings().catch(() => ({})),
        api.fetchComplianceConfig(guid).catch(() => ({})),
        api.fetchBankLedgers(guid, 'bank').catch(() => []),
        api.fetchCompanyLogo(guid).catch(() => ({})),
      ]);
      const vc = settingsRes?.data?.voucher_config || settingsRes?.voucher_config;
      setConfigs(resolveVoucherConfigSource(vc));

      const comp = complianceRes?.data || complianceRes || {};
      setNumberingPolicy(comp.numbering_policy || 'tally_prime_series');
      setEInvoiceApplicable(comp.e_invoice_applicable || 'not_applicable');
      setEInvoiceMode(comp.e_invoice_mode || 'manual');
      setEWayBillApplicable(comp.e_way_bill_applicable || 'not_applicable');
      setEWayBillMode(comp.e_way_bill_mode || 'manual');
      setComplianceDirty(false);

      setBanks(api.unwrapList(bankRes));
      logoRef.current = logoRes?.data?.logo_url || '';
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [guid]);

  useEffect(() => { load(); }, [load]);

  const bankOptions = useMemo(() => {
    const names = banks.map(b => b.name || b).filter(Boolean);
    return ['Cash', ...names.filter(n => n !== 'Cash')];
  }, [banks]);

  const update = (id, key, val) => {
    setConfigs(prev => {
      const nextCfg = {
        ...prev[id],
        [key]: key === 'format'
          ? resolveDocumentFormat(val)
          : key === 'thermalPaperWidth'
            ? normalizeThermalWidth(val)
            : val,
      };
      if (key === 'format' || key === 'thermalPaperWidth') nextCfg._updatedAt = Date.now();
      const next = { ...prev, [id]: nextCfg };
      if (key === 'format' || key === 'thermalPaperWidth') {
        writeLocalVoucherConfig(next);
        queueMicrotask(() => {
          persistVoucherConfigs(next)
            .then(() => {
              setDirty(false);
              const label = VOUCHER_TYPES.find(t => t.id === id)?.label || id;
              setMsg(key === 'thermalPaperWidth'
                ? lt(`Thermal paper saved for ${label}`)
                : lt(`Format saved for ${label}`));
            })
            .catch(e => setMsg(e?.message || lt('Save failed')));
        });
      } else {
        markDirty();
      }
      return next;
    });
  };
  const updateTerm = (id, idx, text) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], terms: prev[id].terms.map((t, i) => (i === idx ? text : t)) },
    }));
    markDirty();
  };
  const removeTerm = (id, idx) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], terms: prev[id].terms.filter((_, i) => i !== idx) },
    }));
    markDirty();
  };
  const addTerm = (id) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], terms: [...(prev[id].terms || []), ''] },
    }));
    markDirty();
  };

  const onPickQr = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const safe = sanitizeImageSrc(typeof reader.result === 'string' ? reader.result : null);
      update(id, 'qrImage', safe);
    };
    reader.readAsDataURL(file);
  };

  const sampleHtmlFor = async (id) => {
    const cfg = configs[id] || defaultAllVoucherConfigs()[id];
    const fmt = resolveDocumentFormat(cfg.format);
    const label = VOUCHER_TYPES.find(t => t.id === id)?.label || 'Invoice';
    const isMoney = ['payment', 'receipt', 'expense', 'journal', 'contra'].includes(id);
    const bank = bankInfoFromConfig(cfg, banks);
    const profile = {
      declarationText: (cfg.terms || []).filter(Boolean).join('\n'),
      bankName: bank.bankName || (cfg.bank !== 'Cash' ? cfg.bank : ''),
      bankAccountNo: bank.accountNo || '',
      bankIfsc: bank.ifsc || '',
    };
    const payload = {
      voucher: {
        voucher_number: 'SMPL/2425/001',
        voucher_type: label,
        date: new Date().toISOString().slice(0, 10),
        amount: 12980,
        party_amount: 12980,
        narration: 'Sample preview document',
      },
      company: selectedCompany || { name: 'Your Company', address: 'Mumbai, Maharashtra', gstin: '27AAJCR0000E1Z2' },
      party: { name: 'Sample Customer', address: 'Delhi, India', gstin: '07AABCD1234E1ZP', state_name: 'Delhi' },
      items: isMoney ? [] : [
        { name: 'Sample Product A', hsn: '8471', qty: 10, unit: 'PCS', rate: 500, amount: 5000 },
        { name: 'Sample Product B', hsn: '8517', qty: 5, unit: 'PCS', rate: 1200, amount: 6000 },
      ],
      ledgerEntries: isMoney
        ? [
          { ledger_name: 'Sample Customer', amount: 12980 },
          { ledger_name: cfg.bank || 'Cash', amount: -12980 },
        ]
        : [
          { ledger_name: 'Output CGST', amount: 990 },
          { ledger_name: 'Output SGST', amount: 990 },
        ],
      profile,
      logoUrl: sanitizeImageSrc(logoRef.current) || '',
      formatDate: d => d,
      format: fmt,
    };
    if (isThermalTemplateId(fmt)) {
      const qrImage = cfg.qrEnabled ? await qrDataUrlFromConfig(cfg) : null;
      return buildThermalHTML(payload, {
        paperWidth: normalizeThermalWidth(cfg.thermalPaperWidth),
        qrImage,
      });
    }
    return buildInvoiceHTML(payload);
  };

  const handlePdfPreview = async (id, label) => {
    setPreviewBusy(id);
    setMsg('');
    try {
      setPreviewTitle(`${label} · ${lt('PDF Preview')}`);
      setPreviewHtml(await sampleHtmlFor(id));
    } catch (e) {
      setMsg(e?.message || lt('Could not generate preview'));
    } finally {
      setPreviewBusy('');
    }
  };

  const handleUseFormat = async (id, label) => {
    setSavingType(id);
    setMsg('');
    try {
      const updated = {
        ...configs,
        [id]: {
          ...configs[id],
          format: resolveDocumentFormat(configs[id].format),
          _updatedAt: Date.now(),
        },
      };
      const saved = await persistVoucherConfigs(updated);
      setConfigs(saved);
      const formatLabel = FORMAT_OPTIONS.find(f => f.id === resolveDocumentFormat(saved[id].format))?.label || '';
      setMsg(lt(`${label} updated — ${formatLabel} applied`));
      setDirty(false);
    } catch (e) {
      setMsg(e?.message || lt('Save failed'));
    } finally {
      setSavingType('');
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    setMsg('');
    try {
      const saved = await persistVoucherConfigs(configs);
      setConfigs(saved);
      setDirty(false);
      setMsg(lt('All configurations saved'));
    } catch (e) {
      setMsg(e?.message || lt('Save failed'));
    } finally {
      setSavingAll(false);
    }
  };

  const saveCompliance = async () => {
    if (!guid) return;
    setSavingCompliance(true);
    setMsg('');
    try {
      await api.saveComplianceConfig(guid, {
        numbering_policy: numberingPolicy,
        e_invoice_applicable: eInvoiceApplicable,
        e_invoice_mode: eInvoiceMode,
        e_way_bill_applicable: eWayBillApplicable,
        e_way_bill_mode: eWayBillMode,
      });
      setComplianceDirty(false);
      setMsg(lt('Compliance settings saved'));
    } catch (e) {
      setMsg(e?.message || lt('Save failed'));
    } finally {
      setSavingCompliance(false);
    }
  };

  if (loading) {
    return <Card className="p-5"><p className="text-[13px] text-ink-soft">{lt('Loading voucher config…')}</p></Card>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="settings-voucher-config">
      <div>
        <h2 className="text-lg font-bold text-ink">{lt('Voucher Configuration')}</h2>
        <p className="text-[13px] text-ink-soft">{lt('Configure PDF format and settings for each voucher type')}</p>
      </div>
      {msg && <p className="text-[13px] text-ink-soft" data-testid="voucher-config-msg">{msg}</p>}

      {/* ── Numbering (mobile section 1) ── */}
      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-bold text-ink">{lt('Voucher Numbering Policy')}</p>
          <p className="text-[12px] text-ink-soft">{lt('Controls how invoice/voucher numbers are assigned')}</p>
        </div>
        <RadioOption
          testid="numbering-tally-prime"
          active={numberingPolicy === 'tally_prime_series'}
          label={lt('Follow TallyPrime Series')}
          sub={lt('TallyPrime assigns the final number (recommended)')}
          onSelect={() => { setNumberingPolicy('tally_prime_series'); setComplianceDirty(true); }}
        />
        <RadioOption
          testid="numbering-tallydekho"
          active={numberingPolicy === 'tallydekho_series'}
          label={lt('TallyDekho Series')}
          sub={lt('TallyDekho generates number, pushes to Tally')}
          onSelect={() => { setNumberingPolicy('tallydekho_series'); setComplianceDirty(true); }}
        />
        {numberingPolicy === 'tallydekho_series' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {lt('Only use if TallyDekho series is reserved exclusively for this app. E-Invoice & E-Way Bill always use TallyPrime series.')}
          </p>
        )}
      </Card>

      {/* ── E-Invoice (mobile section 2) ── */}
      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-bold text-ink">{lt('E-Invoice (IRN)')}</p>
          <p className="text-[12px] text-ink-soft">{lt('For businesses with annual turnover ≥ ₹5 Cr')}</p>
        </div>
        {[
          { value: 'not_applicable', label: 'Not Applicable', sub: 'E-Invoice not required for this business' },
          { value: 'applicable_not_configured', label: 'Applicable — Not Configured', sub: 'Required but IRP credentials not set up yet' },
          { value: 'applicable_configured', label: 'Applicable — Configured', sub: 'IRP integrated, IRN generation enabled' },
        ].map(opt => (
          <RadioOption
            key={opt.value}
            testid={`einvoice-${opt.value}`}
            active={eInvoiceApplicable === opt.value}
            label={lt(opt.label)}
            sub={lt(opt.sub)}
            onSelect={() => { setEInvoiceApplicable(opt.value); setComplianceDirty(true); }}
          />
        ))}
        {eInvoiceApplicable === 'applicable_configured' && (
          <Field label={lt('IRN Generation Mode')}>
            <div className="flex flex-wrap gap-2">
              {[
                { v: 'manual', l: 'Manual' },
                { v: 'auto', l: 'Auto after Tally sync' },
              ].map(m => (
                <button
                  key={m.v}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    eInvoiceMode === m.v ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                  }`}
                  onClick={() => { setEInvoiceMode(m.v); setComplianceDirty(true); }}
                >
                  {lt(m.l)}
                </button>
              ))}
            </div>
          </Field>
        )}
      </Card>

      {/* ── E-Way Bill (mobile section 3) ── */}
      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-bold text-ink">{lt('E-Way Bill')}</p>
          <p className="text-[12px] text-ink-soft">{lt('For goods movement where consignment value exceeds ₹50,000')}</p>
        </div>
        {[
          { value: 'not_applicable', label: 'Not Applicable', sub: 'No goods movement or below threshold' },
          { value: 'applicable_not_configured', label: 'Applicable — Not Configured', sub: 'Required but NIC EWB credentials not set up yet' },
          { value: 'applicable_configured', label: 'Applicable — Configured', sub: 'EWB portal integrated, generation enabled' },
        ].map(opt => (
          <RadioOption
            key={opt.value}
            testid={`ewb-${opt.value}`}
            active={eWayBillApplicable === opt.value}
            label={lt(opt.label)}
            sub={lt(opt.sub)}
            onSelect={() => { setEWayBillApplicable(opt.value); setComplianceDirty(true); }}
          />
        ))}
        {eWayBillApplicable === 'applicable_configured' && (
          <Field label={lt('E-Way Bill Mode')}>
            <div className="flex flex-wrap gap-2">
              {[
                { v: 'manual', l: 'Manual' },
                { v: 'auto', l: 'Auto when details ready' },
                { v: 'ask_after_irn', l: 'Ask after IRN' },
              ].map(m => (
                <button
                  key={m.v}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    eWayBillMode === m.v ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                  }`}
                  onClick={() => { setEWayBillMode(m.v); setComplianceDirty(true); }}
                >
                  {lt(m.l)}
                </button>
              ))}
            </div>
          </Field>
        )}
      </Card>

      {complianceDirty && (
        <Button
          variant="primary"
          disabled={savingCompliance}
          onClick={saveCompliance}
          data-testid="voucher-compliance-save"
        >
          {savingCompliance ? lt('Saving…') : lt('Save Compliance Settings')}
        </Button>
      )}

      {/* ── Per-type accordion (mobile) ── */}
      {VOUCHER_TYPES.map(vt => {
        const cfg = configs[vt.id] || defaultAllVoucherConfigs()[vt.id];
        const isOpen = expanded === vt.id;
        const fmt = resolveDocumentFormat(cfg.format);

        return (
          <Card key={vt.id} className="overflow-hidden p-0" data-testid={`voucher-config-section-${vt.id}`}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              onClick={() => setExpanded(isOpen ? null : vt.id)}
              data-testid={`voucher-config-toggle-${vt.id}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-[11px] font-bold text-ink-soft">
                {vt.label.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 text-[14px] font-semibold text-ink">{lt(vt.label)}</span>
              {isOpen ? <ChevronUp size={16} className="text-ink-faint" /> : <ChevronDown size={16} className="text-ink-faint" />}
            </button>

            {isOpen && (
              <div className="space-y-5 border-t border-line px-4 py-4">
                {/* PDF format cards */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{lt('PDF Format')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {FORMAT_OPTIONS.map(opt => {
                      const active = fmt === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`voucher-format-${vt.id}-${opt.id}`}
                          onClick={() => update(vt.id, 'format', opt.id)}
                          className={`relative rounded-xl border p-1.5 text-left ${
                            active ? 'border-2 border-ink bg-paper' : 'border-line bg-cream/40'
                          }`}
                        >
                          {active && (
                            <span className="absolute right-1.5 top-1.5 z-[1] flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white">
                              <Check size={10} />
                            </span>
                          )}
                          <FormatThumb type={opt.id} />
                          <p className={`mt-1.5 text-center text-[10px] ${active ? 'font-bold text-ink' : 'font-medium text-ink-soft'}`}>
                            {lt(opt.label)}{opt.id === 'tally_classic_v1' ? ` (${lt('Default')})` : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isThermalTemplateId(fmt) && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{lt('Thermal Paper')}</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { v: 80, l: '80mm — Recommended' },
                        { v: 58, l: '58mm — Compact' },
                      ].map(opt => {
                        const active = normalizeThermalWidth(cfg.thermalPaperWidth) === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            data-testid={`voucher-thermal-width-${vt.id}-${opt.v}`}
                            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                              active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                            }`}
                            onClick={() => update(vt.id, 'thermalPaperWidth', opt.v)}
                          >
                            {lt(opt.l)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-ink-faint">
                      {lt('PDF Preview / Share / Print use this roll width. On-screen cream sheets stay unchanged.')}
                    </p>
                  </div>
                )}

                {/* Default bank */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{lt('Default Bank Account')}</p>
                  <select
                    className="w-full rounded-xl border border-line bg-cream/40 px-3 py-2.5 text-[13px] font-medium text-ink"
                    value={cfg.bank || 'Cash'}
                    onChange={e => update(vt.id, 'bank', e.target.value)}
                    data-testid={`voucher-bank-${vt.id}`}
                  >
                    {bankOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                {/* QR */}
                <div className="space-y-3">
                  <ToggleRow
                    label={lt('QR Code')}
                    hint={lt('Include payment QR in PDF')}
                    checked={!!cfg.qrEnabled}
                    onChange={v => update(vt.id, 'qrEnabled', v)}
                    testid={`voucher-qr-toggle-${vt.id}`}
                  />
                  {cfg.qrEnabled && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { v: 'upi', l: 'UPI ID' },
                          { v: 'url', l: 'Website' },
                          { v: 'bank', l: 'Bank Details' },
                        ].map(opt => (
                          <button
                            key={opt.v}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                              cfg.qrType === opt.v ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                            }`}
                            onClick={() => update(vt.id, 'qrType', opt.v)}
                          >
                            {lt(opt.l)}
                          </button>
                        ))}
                      </div>
                      {cfg.qrType === 'upi' && (
                        <Input
                          value={cfg.qrUpiId || ''}
                          onChange={e => update(vt.id, 'qrUpiId', e.target.value)}
                          placeholder={lt('Enter UPI ID (e.g. business@upi)')}
                        />
                      )}
                      {cfg.qrType === 'url' && (
                        <Input
                          value={cfg.qrUrl || ''}
                          onChange={e => update(vt.id, 'qrUrl', e.target.value)}
                          placeholder={lt('Enter website URL (e.g. https://yoursite.com)')}
                        />
                      )}
                      {cfg.qrType === 'bank' && (
                        <div className="space-y-2">
                          <Input
                            value={cfg.qrIfsc || ''}
                            onChange={e => update(vt.id, 'qrIfsc', e.target.value.toUpperCase())}
                            placeholder={lt('IFSC Code (e.g. HDFC0001234)')}
                          />
                          <Input
                            value={cfg.qrAccount || ''}
                            onChange={e => update(vt.id, 'qrAccount', e.target.value)}
                            placeholder={lt('Account Number')}
                          />
                        </div>
                      )}

                      {cfg.qrImage ? (
                        <div className="rounded-xl border border-line bg-cream/40 p-3">
                          <img src={cfg.qrImage} alt="QR" className="mx-auto h-40 w-40 object-contain" />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-[12px] text-ink-soft">{lt('QR code ready for PDF')}</p>
                            <Button onClick={() => update(vt.id, 'qrImage', null)}>{lt('Remove')}</Button>
                          </div>
                          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-[12px] font-semibold text-ink">
                            <Upload size={14} /> {lt('Replace QR')}
                            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => onPickQr(vt.id, e.target.files?.[0])} />
                          </label>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line bg-cream/30 px-4 py-6 text-center">
                          <Upload size={22} className="text-ink-faint" />
                          <span className="text-[13px] font-semibold text-ink">{lt('Upload QR Code Image')}</span>
                          <span className="text-[11px] text-ink-faint">{lt('PNG or JPG')}</span>
                          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => onPickQr(vt.id, e.target.files?.[0])} />
                        </label>
                      )}

                      {!cfg.qrImage && <GeneratedQrPreview cfg={cfg} />}
                    </>
                  )}
                </div>

                {/* Terms */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{lt('Terms & Conditions')}</p>
                  <div className="space-y-2">
                    {(cfg.terms || []).map((term, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={term}
                          onChange={e => updateTerm(vt.id, i, e.target.value)}
                          placeholder={lt('Enter term…')}
                          data-testid={`voucher-term-${vt.id}-${i}`}
                        />
                        <Button onClick={() => removeTerm(vt.id, i)} aria-label={lt('Remove')}><X size={14} /></Button>
                      </div>
                    ))}
                  </div>
                  <Button className="mt-2" onClick={() => addTerm(vt.id)} data-testid={`voucher-add-term-${vt.id}`}>
                    <Plus size={14} /> {lt('Add New')}
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid={`voucher-pdf-preview-${vt.id}`}
                    disabled={previewBusy === vt.id}
                    onClick={() => handlePdfPreview(vt.id, vt.label)}
                  >
                    {previewBusy === vt.id ? lt('Generating…') : lt('PDF Preview')}
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    data-testid={`voucher-use-format-${vt.id}`}
                    disabled={savingType === vt.id}
                    onClick={() => handleUseFormat(vt.id, vt.label)}
                  >
                    {savingType === vt.id ? lt('Saving…') : lt('Use this format')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {dirty && (
        <Button
          variant="primary"
          className="w-full"
          disabled={savingAll}
          onClick={saveAll}
          data-testid="voucher-config-save-all"
        >
          {savingAll ? lt('Saving…') : lt('Save All Configurations')}
        </Button>
      )}

      <PdfHtmlPreviewOverlay
        html={previewHtml}
        title={previewTitle}
        onClose={() => { setPreviewHtml(''); setPreviewTitle(''); }}
      />
    </div>
  );
}
