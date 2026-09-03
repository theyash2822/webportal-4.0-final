import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, Share2 } from 'lucide-react';
import { Button, Empty, Panel, Skeleton, useLabelT } from '../components/kit';
import { useAuth } from '../contexts/AuthContext';
import { useFmt } from './shared';
import api from '../services/api';
import { buildInvoiceHTML, printInvoice } from '../utils/invoicePrint';
import wsService from '../services/websocket';

const isTdkRef = id => /^TD/i.test(String(id || '').trim());
const isGuidLike = id => /^[0-9a-f-]{20,}$/i.test(String(id || '').trim());

export default function DocumentViewer() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const previewMode = search.get('preview') === '1';
  const lt = useLabelT();
  const navigate = useNavigate();
  const { money, date } = useFmt();
  const { selectedCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [html, setHtml] = useState('');
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState('');
  const tdkRefRef = useRef('');
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const guid = selectedCompany?.guid;
    if (!id || !guid) return;
    const seq = ++reqRef.current;
    setLoading(true);
    setError('');
    setHtml('');
    try {
      let tdkRef = isTdkRef(id) ? id.trim() : '';
      let voucher = null;
      if (!tdkRef && isGuidLike(id)) {
        const res = await api.fetchVoucherFull(guid, id);
        voucher = res?.data?.voucher || res?.data || {};
        tdkRef = voucher.tdk_reference_no || voucher.tdkRef || voucher.reference || '';
      }
      if (!tdkRef && !isGuidLike(id)) tdkRef = id;
      tdkRefRef.current = tdkRef;

      if (tdkRef) {
        const res = await api.fetchTallyInvoicePreview(tdkRef, guid);
        if (seq !== reqRef.current) return;
        const doc = res?.data || res || {};
        setMeta({ title: doc.documentNumber || doc.voucherNumber || tdkRef, type: doc.documentTitle || doc.tallyVoucherType || 'Document', tdkRef });
        const previewItems = (doc.items || []).map((it, i) => ({
          id: i, name: it.name || it.itemName, hsn: it.hsn, qty: it.qty ?? it.billedQty, unit: it.unit, rate: it.rate, amount: it.amount ?? it.lineTotal,
        }));
        setHtml(buildInvoiceHTML({
          voucher: {
            voucher_number: doc.documentNumber || doc.voucherNumber || tdkRef,
            voucher_type: doc.tallyVoucherType || doc.documentTitle || 'Voucher',
            date: doc.date, amount: doc.totals?.grandTotal ?? doc.totals?.total,
            party_amount: doc.totals?.grandTotal, reference: doc.reference || tdkRef, narration: doc.narration,
          },
          company: doc.company || selectedCompany,
          party: doc.party || doc.billing || { name: doc.partyName },
          items: previewItems,
          ledgerEntries: doc.ledgerEntries || [],
          formatDate: date,
        }));
      } else if (voucher) {
        setMeta({ title: voucher.voucher_number, type: voucher.voucher_type, tdkRef: '' });
        const full = voucher;
        setHtml(buildInvoiceHTML({
          voucher: full, company: selectedCompany, party: { name: full.party_name },
          items: full.items || [], ledgerEntries: full.ledger_entries || [], formatDate: date,
        }));
      } else {
        throw new Error('Could not resolve document');
      }
    } catch (e) {
      if (seq !== reqRef.current) return;
      setError(e?.message || 'Failed to load document');
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, [id, selectedCompany, date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const un = wsService.on('voucher:tallySynced', payload => {
      const ref = payload?.tdkRef || payload?.tdk_reference_no || payload?.reference;
      if (ref && (ref === tdkRefRef.current || ref === id)) load();
    });
    return un;
  }, [id, load]);

  const sharePdf = async () => {
    const tdk = tdkRefRef.current;
    if (!tdk || !selectedCompany?.guid) return;
    setBusy('share');
    try {
      await api.shareTallyInvoicePdf(tdk, { companyGuid: selectedCompany.guid });
      window.open(`https://wa.me/?text=${encodeURIComponent(`${meta?.type || 'Document'} ${meta?.title || tdk}`)}`, '_blank', 'noopener');
    } catch (e) {
      setError(e?.message || 'Share failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-4xl py-6" data-testid="document-viewer">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate(-1)} data-testid="document-back"><ArrowLeft size={14} /> {lt('Back')}</Button>
          <div>
            <h1 className="text-lg font-bold text-ink">{meta?.title || id}</h1>
            <p className="text-[13px] text-ink-soft">{meta?.type}{previewMode ? ` · ${lt('Post-create preview')}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tdkRefRef.current && (
            <Button disabled={!!busy} onClick={sharePdf} data-testid="document-share-pdf">
              <Share2 size={14} /> {busy === 'share' ? lt('Sharing…') : lt('Share PDF (Tally)')}
            </Button>
          )}
          {html && (
            <Button variant="primary" onClick={() => printInvoice(html)} data-testid="document-print">
              <Printer size={14} /> {lt('Print / PDF')}
            </Button>
          )}
        </div>
      </div>
      {loading && <Skeleton rows={10} />}
      {error && !loading && <Empty message={error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />}
      {html && !loading && (
        <Panel title={lt('Document preview')} sub={lt('Universal viewer — GUID or TDK ref')}>
          <iframe title={lt('Document')} data-testid="document-preview-frame" className="h-[min(80vh,720px)] w-full rounded-xl border border-line bg-white" srcDoc={html} sandbox="allow-same-origin" />
        </Panel>
      )}
    </div>
  );
}
