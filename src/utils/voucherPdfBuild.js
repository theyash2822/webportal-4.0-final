/**
 * Build settings-driven PDF HTML for a voucher (real data + voucher_config.format).
 */
import api from '../services/api';
import { buildInvoiceHTML } from './invoicePrint';
import { buildThermalHTML } from './thermalPrint';
import {
  configIdFromVoucherType,
  resolveDocumentFormat,
  bankInfoFromConfig,
  resolveVoucherConfigSource,
  writeLocalVoucherConfig,
  FORMAT_OPTIONS,
  qrDataUrlFromConfig,
  isThermalTemplateId,
  normalizeThermalWidth,
} from './voucherConfig';
import { toPrintPayload } from './creamPreviewModel';

export async function loadVoucherPdfConfig(voucherType) {
  let serverVc = null;
  try {
    const res = await api.getUserSettings();
    serverVc = res?.data?.voucher_config || res?.voucher_config || null;
  } catch { /* use local cache */ }
  const all = resolveVoucherConfigSource(serverVc);
  const id = configIdFromVoucherType(voucherType);
  const cfg = all[id];
  const format = resolveDocumentFormat(cfg?.format);
  const thermalPaperWidth = normalizeThermalWidth(cfg?.thermalPaperWidth);
  return { cfg, format, thermalPaperWidth, configId: id, all };
}

export async function buildVoucherPdfHtml({
  cream, doc, row, full, company, formatDate, banks = [],
}) {
  const voucherType = row?.voucher_type
    || full?.voucher?.voucher_type
    || doc?.tallyVoucherType
    || cream?.voucherType
    || 'Sales';
  const { cfg, format, thermalPaperWidth, configId } = await loadVoucherPdfConfig(voucherType);
  const bank = bankInfoFromConfig(cfg, banks);
  const [profileRes, logoRes] = await Promise.allSettled([
    company?.guid ? api.fetchPrintProfile(company.guid) : Promise.resolve({}),
    company?.guid ? api.fetchCompanyLogo(company.guid) : Promise.resolve({}),
  ]);
  const profile = {
    ...(profileRes.status === 'fulfilled' ? (profileRes.value?.data || {}) : {}),
    bankName: bank.bankName || profileRes.value?.data?.bankName,
    bankAccountNo: bank.accountNo || profileRes.value?.data?.bankAccountNo,
    bankIfsc: bank.ifsc || profileRes.value?.data?.bankIfsc,
    declarationText: (cfg.terms || []).filter(Boolean).join('\n')
      || profileRes.value?.data?.declarationText
      || '',
  };
  const logoUrl = logoRes.status === 'fulfilled' ? (logoRes.value?.data?.logo_url || '') : '';
  const payload = toPrintPayload({
    cream, doc, row, full, company, formatDate, profile, logoUrl, format,
  });
  const formatLabel = FORMAT_OPTIONS.find(f => f.id === format)?.label || format;
  const qrImage = cfg.qrEnabled ? qrDataUrlFromConfig(cfg) : null;

  const html = isThermalTemplateId(format)
    ? buildThermalHTML(payload, { paperWidth: thermalPaperWidth, qrImage })
    : buildInvoiceHTML(payload);

  return {
    html,
    format,
    formatLabel,
    thermalPaperWidth: isThermalTemplateId(format) ? thermalPaperWidth : null,
    configId,
    filename: `${String(payload.voucher.voucher_number || 'document').replace(/[^\w.-]+/g, '_')}.pdf`,
    title: payload.voucher.voucher_number || 'Document',
  };
}

/** Persist configs to server + local cache (settings panel). */
export async function persistVoucherConfigs(configs) {
  const stamped = {};
  const now = Date.now();
  Object.keys(configs || {}).forEach(k => {
    stamped[k] = {
      ...configs[k],
      format: resolveDocumentFormat(configs[k]?.format),
      thermalPaperWidth: normalizeThermalWidth(configs[k]?.thermalPaperWidth),
      _updatedAt: now,
    };
  });
  writeLocalVoucherConfig(stamped);
  await api.updateUserSettings({ voucher_config: stamped });
  return stamped;
}
