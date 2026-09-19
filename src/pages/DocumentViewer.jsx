import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Button, Empty, Skeleton, useLabelT } from '../components/kit';
import { useAuth } from '../contexts/AuthContext';
import { useFmt } from './shared';
import api from '../services/api';
import CreamDocumentSheet from '../components/CreamDocumentSheet';
import { buildCreamModel } from '../utils/creamPreviewModel';
import { buildVoucherPdfHtml } from '../utils/voucherPdfBuild';
import { printInvoice, htmlToPdfBlob } from '../utils/invoicePrint';
import { downloadBlob } from '../services/invoicePdf';
import wsService from '../services/websocket';
import { isEventForActiveWorkspace } from '../utils/workspaceEvents';

const isTdkRef = id => /^TD/i.test(String(id || '').trim());
const isGuidLike = id => /^[0-9a-f-]{20,}$/i.test(String(id || '').trim());

export default function DocumentViewer() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const previewMode = search.get('preview') === '1';
  const lt = useLabelT();
  const navigate = useNavigate();
  const { date, money } = useFmt();
  const { selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [full, setFull] = useState(null);
  const [row, setRow] = useState(null);
  const tdkRefRef = useRef('');
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const guid = selectedCompany?.guid;
    if (!id || !guid) return;
    const seq = ++reqRef.current;
    setLoading(true);
    setError('');
    setSnapshot(null);
    setFull(null);
    try {
      let tdkRef = isTdkRef(id) ? id.trim() : '';
      let voucher = null;
      if (!tdkRef && isGuidLike(id)) {
        const res = await api.fetchVoucherFull(guid, id);
        voucher = res?.data?.voucher || res?.data || {};
        setFull(res?.data || {});
        tdkRef = voucher.tdk_reference_no || voucher.tdkRef || voucher.reference || '';
      }
      if (!tdkRef && !isGuidLike(id)) tdkRef = id;
      tdkRefRef.current = tdkRef;

      if (tdkRef) {
        const res = await api.fetchTallyInvoicePreview(tdkRef, guid);
        if (seq !== reqRef.current) return;
        setSnapshot(res?.data || res || {});
        setRow(voucher || { voucher_number: tdkRef, reference: tdkRef });
      } else if (voucher) {
        setRow(voucher);
      } else {
        throw new Error('Could not resolve document');
      }
    } catch (e) {
      if (seq !== reqRef.current) return;
      setError(e?.message || 'Failed to load document');
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, [id, selectedCompany]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const un = wsService.on('voucher:tallySynced', payload => {
      if (!isEventForActiveWorkspace(payload)) return;
      const ref = payload?.tdkRef || payload?.tdk_reference_no || payload?.reference;
      if (ref && (ref === tdkRefRef.current || ref === id)) load();
    });
    return un;
  }, [id, load]);

  const cream = buildCreamModel({
    doc: snapshot,
    row,
    full,
    company: selectedCompany,
    formatDate: date,
  });

  const runPdf = async (mode) => {
    setActionBusy(mode);
    setActionError('');
    try {
      const { html, filename, thermalPaperWidth } = await buildVoucherPdfHtml({
        cream, doc: snapshot, row, full, company: selectedCompany, formatDate: date,
      });
      if (mode === 'print') {
        printInvoice(html);
      } else {
        if (tdkRefRef.current && selectedCompany?.guid) {
          try {
            await api.shareTallyInvoicePdf(tdkRefRef.current, { companyGuid: selectedCompany.guid });
          } catch { /* local PDF still shared */ }
        }
        const blob = await htmlToPdfBlob(html, { thermalPaperWidth });
        const party = cream.partyName || row?.party_name || '';
        const text = [cream.voucherType || row?.voucher_type || 'Invoice', cream.number || row?.voucher_number, party]
          .filter(Boolean).join(' · ');
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text });
          } catch (e) {
            if (e?.name !== 'AbortError') downloadBlob(blob, filename);
          }
        } else {
          downloadBlob(blob, filename);
        }
      }
    } catch (e) {
      setActionError(e?.message || lt('Unable to prepare PDF'));
    } finally {
      setActionBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-6" data-testid="document-viewer">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button onClick={() => navigate(-1)} data-testid="document-back"><ArrowLeft size={14} /> {lt('Back')}</Button>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{lt('Record')}</p>
            <h1 className="text-lg font-bold text-ink">{cream.number || id}</h1>
            <p className="text-[13px] text-ink-soft">
              {cream.voucherType}{cream.dateLabel ? ` · ${cream.dateLabel}` : ''}
              {previewMode ? ` · ${lt('Post-create')}` : ''}
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)} data-testid="document-close" aria-label={lt('Close')}>
          <X size={16} />
        </Button>
      </div>

      {loading && <Skeleton rows={10} />}
      {error && !loading && <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />}
      {actionError && <Empty message={actionError} hint={<Button onClick={() => setActionError('')}>{lt('Dismiss')}</Button>} />}

      {!loading && !error && (
        <div className="space-y-4">
          <CreamDocumentSheet model={cream} />
          <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-paper p-3">
            <Button data-testid="document-share-pdf" disabled={!!actionBusy} onClick={() => runPdf('share')}>
              {actionBusy === 'share' ? lt('Preparing…') : lt('Share PDF')}
            </Button>
            <Button variant="primary" data-testid="document-print-pdf" disabled={!!actionBusy} onClick={() => runPdf('print')}>
              {actionBusy === 'print' ? lt('Preparing…') : lt('Print PDF')}
            </Button>
            <span className="ml-auto self-center text-[12px] tabular text-ink-soft">{money(cream.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
