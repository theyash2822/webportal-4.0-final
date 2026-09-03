import { useCallback, useEffect, useMemo, useState } from 'react';
import { Field, Input, Select, Button, Card, useLabelT } from '../kit';
import { ToggleRow } from '../create/common';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { buildInvoiceHTML } from '../../utils/invoicePrint';
import {
  VOUCHER_TYPES, FORMAT_OPTIONS, defaultAllVoucherConfigs, resolveDocumentFormat, bankInfoFromConfig, qrDataUrlFromConfig,
} from '../../utils/voucherConfig';

export default function VoucherConfigPanel() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const [configs, setConfigs] = useState(defaultAllVoucherConfigs());
  const [activeType, setActiveType] = useState('sales_inv');
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [numberingPolicy, setNumberingPolicy] = useState('tally_prime_series');
  const cfg = configs[activeType] || defaultAllVoucherConfigs().sales_inv;

  const load = useCallback(async () => {
    if (!guid) return;
    setLoading(true);
    try {
      const [settingsRes, complianceRes, bankRes] = await Promise.all([
        api.getUserSettings().catch(() => ({})),
        api.fetchComplianceConfig(guid).catch(() => ({})),
        api.fetchBankLedgers(guid, 'all').catch(() => []),
      ]);
      const vc = settingsRes?.data?.voucher_config || settingsRes?.voucher_config;
      if (vc && typeof vc === 'object') {
        setConfigs(prev => ({ ...defaultAllVoucherConfigs(), ...prev, ...vc }));
      }
      const comp = complianceRes?.data || complianceRes || {};
      setNumberingPolicy(comp.numbering_policy || 'tally_prime_series');
      setBanks(api.unwrapList(bankRes));
    } finally {
      setLoading(false);
    }
  }, [guid]);

  useEffect(() => { load(); }, [load]);

  const bankOptions = useMemo(() => ['Cash', ...banks.map(b => b.name || b).filter(Boolean)], [banks]);

  const update = (key, val) => setConfigs(prev => ({ ...prev, [activeType]: { ...prev[activeType], [key]: val } }));
  const updateTerm = (idx, text) => setConfigs(prev => ({
    ...prev,
    [activeType]: { ...prev[activeType], terms: prev[activeType].terms.map((t, i) => (i === idx ? text : t)) },
  }));

  const previewHtml = useMemo(() => {
    const fmt = resolveDocumentFormat(cfg.format);
    const sample = {
      voucher: { voucher_number: 'PREVIEW-001', voucher_type: VOUCHER_TYPES.find(t => t.id === activeType)?.label || 'Invoice', date: new Date().toISOString().slice(0, 10), amount: 11800, party_amount: 11800 },
      company: selectedCompany || { name: 'Your Company' },
      party: { name: 'Sample Customer', address: '123 Market Road', gstin: '29AAAAA0000A1Z5' },
      items: [{ name: 'Sample Item', qty: 2, rate: 5000, amount: 10000, unit: 'Nos' }],
      ledgerEntries: [{ ledger_name: 'Output CGST', amount: 900 }, { ledger_name: 'Output SGST', amount: 900 }],
      profile: { terms: (cfg.terms || []).join('\n'), bank_name: cfg.bank },
      logoUrl: '',
      formatDate: d => d,
    };
    let html = buildInvoiceHTML(sample);
    if (fmt === 'modern_a') html = html.replace('<body', '<body style="font-family:system-ui"');
    return html;
  }, [cfg, activeType, selectedCompany]);

  const saveAll = async () => {
    if (!guid) return;
    setSaving(true);
    setMsg('');
    try {
      await api.updateUserSettings({ voucher_config: configs });
      await api.saveComplianceConfig(guid, { numbering_policy: numberingPolicy });
      setMsg(lt('Saved'));
    } catch (e) {
      setMsg(e?.message || lt('Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="p-5"><p className="text-[13px] text-ink-soft">{lt('Loading voucher config…')}</p></Card>;

  return (
    <div className="space-y-4" data-testid="settings-voucher-config">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{lt('Voucher Config')}</h2>
          <p className="text-[13px] text-ink-soft">{lt('PDF format, bank, QR, terms and numbering — same as mobile')}</p>
        </div>
        <Button variant="primary" disabled={saving} onClick={saveAll} data-testid="voucher-config-save">{saving ? lt('Saving…') : lt('Save all')}</Button>
      </div>
      {msg && <p className="text-[13px] text-ink-soft">{msg}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <Field label="Numbering policy">
            <Select value={numberingPolicy} onChange={e => setNumberingPolicy(e.target.value)} data-testid="voucher-numbering-policy">
              <option value="tally_prime_series">{lt('Tally Prime series')}</option>
              <option value="tallydekho_series">{lt('TallyDekho automatic series')}</option>
            </Select>
          </Field>
          <Field label="Voucher type">
            <Select value={activeType} onChange={e => setActiveType(e.target.value)} data-testid="voucher-config-type">
              {VOUCHER_TYPES.map(t => <option key={t.id} value={t.id}>{lt(t.label)}</option>)}
            </Select>
          </Field>
          <Field label="PDF format">
            <Select value={cfg.format || 'tally'} onChange={e => update('format', e.target.value)} data-testid="voucher-config-format">
              {FORMAT_OPTIONS.map(f => <option key={f.id} value={f.id}>{lt(f.label)}</option>)}
            </Select>
          </Field>
          <Field label="Bank on PDF">
            <Select value={cfg.bank || 'Cash'} onChange={e => update('bank', e.target.value)} data-testid="voucher-config-bank">
              {bankOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
          <ToggleRow label="Show QR on PDF" checked={!!cfg.qrEnabled} onChange={v => update('qrEnabled', v)} testid="voucher-config-qr-toggle" />
          {cfg.qrEnabled && (
            <>
              <Field label="QR type">
                <Select value={cfg.qrType || 'upi'} onChange={e => update('qrType', e.target.value)}>
                  <option value="upi">UPI</option><option value="url">Website URL</option><option value="bank">Bank details</option>
                </Select>
              </Field>
              {cfg.qrType === 'upi' && <Field label="UPI ID"><Input value={cfg.qrUpiId || ''} onChange={e => update('qrUpiId', e.target.value)} /></Field>}
              {cfg.qrType === 'url' && <Field label="URL"><Input value={cfg.qrUrl || ''} onChange={e => update('qrUrl', e.target.value)} /></Field>}
              {cfg.qrType === 'bank' && (
                <>
                  <Field label="IFSC"><Input value={cfg.qrIfsc || ''} onChange={e => update('qrIfsc', e.target.value)} /></Field>
                  <Field label="Account"><Input value={cfg.qrAccount || ''} onChange={e => update('qrAccount', e.target.value)} /></Field>
                </>
              )}
            </>
          )}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Terms & conditions')}</p>
            {(cfg.terms || []).map((term, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input value={term} onChange={e => updateTerm(i, e.target.value)} data-testid={`voucher-term-${i}`} />
                <Button onClick={() => update('terms', cfg.terms.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
            <Button onClick={() => update('terms', [...(cfg.terms || []), ''])} data-testid="voucher-add-term">{lt('Add line')}</Button>
          </div>
          <p className="text-[11px] text-ink-faint">{lt('Bank block')}: {JSON.stringify(bankInfoFromConfig(cfg, banks))}</p>
          {cfg.qrEnabled && qrDataUrlFromConfig(cfg) && (
            <img src={qrDataUrlFromConfig(cfg)} alt="QR preview" className="h-24 w-24 rounded border border-line" />
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-bold text-ink">{lt('Live preview')}</p>
          <iframe title={lt('Voucher preview')} data-testid="voucher-config-preview" className="h-[min(70vh,600px)] w-full rounded-xl border border-line bg-white" srcDoc={previewHtml} sandbox="allow-same-origin" />
        </Card>
      </div>
    </div>
  );
}
