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
  resolveQrMode,
  sanitizeVoucherConfig,
  defaultVoucherConfig,
} from './voucherConfig';
import { toPrintPayload } from './creamPreviewModel';
import { sanitizeImageSrc } from './sanitizeImageSrc';

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

async function loadBanksForPdf(companyGuid) {
  if (!companyGuid) return [];
  try {
    const res = await api.fetchBankLedgers(companyGuid, 'all');
    return api.unwrapList(res) || [];
  } catch {
    return [];
  }
}

export async function buildVoucherPdfHtml({
  cream, doc, row, full, company, formatDate, banks,
}) {
  const voucherType = row?.voucher_type
    || full?.voucher?.voucher_type
    || doc?.tallyVoucherType
    || cream?.voucherType
    || 'Sales';
  const { cfg, format, thermalPaperWidth, configId } = await loadVoucherPdfConfig(voucherType);
  const bankRows = Array.isArray(banks) && banks.length
    ? banks
    : await loadBanksForPdf(company?.guid);
  const bank = bankInfoFromConfig(cfg, bankRows);
  const [profileRes, logoRes] = await Promise.allSettled([
    company?.guid ? api.fetchPrintProfile(company.guid) : Promise.resolve({}),
    company?.guid ? api.fetchCompanyLogo(company.guid) : Promise.resolve({}),
  ]);
  const profileBase = profileRes.status === 'fulfilled' ? (profileRes.value?.data || {}) : {};
  // Default Bank from voucher-config wins (Cash clears A/C+IFSC). UPI from Generate-from-UPI.
  const profile = {
    ...profileBase,
    ...(bank
      ? {
        bankName: bank.bankName || '',
        bankAccountNo: bank.accountNo || '',
        bankIfsc: bank.ifsc || '',
        bankUpi: bank.upiId || '',
      }
      : {}),
    declarationText: (cfg.terms || []).filter(Boolean).join('\n')
      || profileBase.declarationText
      || '',
  };
  const rawLogo = logoRes.status === 'fulfilled' ? (logoRes.value?.data?.logo_url || '') : '';
  const logoUrl = sanitizeImageSrc(rawLogo) || '';
  const payload = toPrintPayload({
    cream, doc, row, full, company, formatDate, profile, logoUrl, format,
  });
  const formatLabel = FORMAT_OPTIONS.find(f => f.id === format)?.label || format;
  const mode = resolveQrMode(cfg);
  const qrImage = cfg.qrEnabled
    ? await qrDataUrlFromConfig({
      ...cfg,
      qrMode: mode,
      qrImage: mode === 'generate' ? null : cfg.qrImage,
    })
    : null;
  const safeQr = sanitizeImageSrc(qrImage);

  const html = isThermalTemplateId(format)
    ? buildThermalHTML(payload, { paperWidth: thermalPaperWidth, qrImage: safeQr })
    : buildInvoiceHTML({ ...payload, qrImage: safeQr });

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
    const cleaned = sanitizeVoucherConfig(configs[k], defaultVoucherConfig(k));
    stamped[k] = {
      ...cleaned,
      _updatedAt: now,
    };
  });
  writeLocalVoucherConfig(stamped);
  await api.updateUserSettings({ voucher_config: stamped });
  return stamped;
}
