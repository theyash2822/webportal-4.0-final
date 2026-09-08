/**
 * Cream on-screen document sheet — visual parity with mobile
 * CommercialDocumentPreview / AccountingVoucherPreview (fixed chrome; not Settings PDF).
 */
import { useSettings } from '../contexts/SettingsContext';
import { useLabelT } from './kit';

export default function CreamDocumentSheet({ model, testid = 'cream-document-sheet' }) {
  const lt = useLabelT();
  const { formatAmount } = useSettings();
  const money = n => formatAmount(Number(n) || 0);
  if (!model) return null;

  return (
    <div
      data-testid={testid}
      className="relative overflow-hidden rounded-2xl border border-[#CFCABE] bg-[#FEFDFB] text-[#1A1A1A] shadow-sm"
    >
      {model.cancelled && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-[18deg] text-5xl font-extrabold tracking-widest text-neg/20">{lt('CANCELLED')}</span>
        </div>
      )}

      <div className="border-b border-[#CFCABE] bg-[#F4F1E9] px-4 py-2.5 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#1A1A1A]">{model.ribbon}</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="border-b border-[#E5E1D6] pb-3 text-center">
          <p className="text-[15px] font-bold text-[#1A1A1A]">{model.companyName}</p>
          {!!model.companyAddr && <p className="mt-1 text-[11px] leading-4 text-[#55524C]">{model.companyAddr}</p>}
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-[#55524C]">
            {!!model.companyGstin && <span>GSTIN/UIN: {model.companyGstin}</span>}
            {!!model.companyPan && <span>PAN: {model.companyPan}</span>}
          </div>
          {(model.companyPhone || model.companyEmail) && (
            <p className="mt-0.5 text-[11px] text-[#98938A]">
              {[model.companyPhone, model.companyEmail].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#E5E1D6] bg-white/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#98938A]">{model.partyLabel}</p>
            <p className="mt-1 text-[13px] font-semibold">{model.partyName || '—'}</p>
            {!!model.partyAddr && <p className="mt-1 text-[11px] leading-4 text-[#55524C]">{model.partyAddr}</p>}
            {!!model.partyGstin && <p className="mt-1 text-[11px] text-[#55524C]">GSTIN/UIN: {model.partyGstin}</p>}
            {!!model.partyState && <p className="text-[11px] text-[#55524C]">State: {model.partyState}</p>}
          </div>
          <div className="rounded-lg border border-[#E5E1D6] bg-white/60 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#98938A]">{lt('Details')}</p>
            <div className="space-y-1.5">
              {model.meta.map(m => (
                <div key={m.label} className="flex justify-between gap-3 text-[11px]">
                  <span className="text-[#98938A]">{m.label}</span>
                  <span className="text-right font-medium text-[#1A1A1A]">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!model.isAccounting && model.items?.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-[#E5E1D6]">
            <table className="w-full text-[11px]">
              <thead className="bg-[#F4F1E9]">
                <tr className="text-left text-[10px] uppercase tracking-wide text-[#55524C]">
                  <th className="px-2 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">{lt('Item')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{lt('Qty')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{lt('Rate')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{lt('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {model.items.map((it, i) => (
                  <tr key={it.id || i} className="border-t border-[#E5E1D6]">
                    <td className="px-2 py-1.5 text-[#98938A]">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">
                      {it.name}
                      {!!it.hsn && <span className="mt-0.5 block text-[10px] font-normal text-[#98938A]">HSN {it.hsn}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular">{it.qty != null ? `${it.qty} ${it.unit || ''}`.trim() : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular">{it.rate != null ? money(it.rate) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular font-medium">{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {model.isAccounting && model.ledgers?.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-[#E5E1D6]">
            <table className="w-full text-[11px]">
              <thead className="bg-[#F4F1E9]">
                <tr className="text-left text-[10px] uppercase tracking-wide text-[#55524C]">
                  <th className="px-2 py-2 font-semibold">{lt('Particulars')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{lt('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {model.ledgers.map((e, i) => (
                  <tr key={i} className="border-t border-[#E5E1D6]">
                    <td className="px-2 py-1.5 font-medium">{e.name}</td>
                    <td className="px-2 py-1.5 text-right tabular">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ml-auto w-full max-w-[240px] space-y-1">
          {model.totRows.map(r => (
            <div key={r.label} className="flex justify-between text-[11px] text-[#55524C]">
              <span>{r.label}</span>
              <span className="tabular">{money(r.value)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between rounded-md bg-[#1A1A1A] px-3 py-2 text-[12px] font-bold text-white">
            <span>{lt('Grand Total')}</span>
            <span className="tabular">{money(model.total)}</span>
          </div>
        </div>

        <p className="rounded-lg border border-[#E5E1D6] bg-[#F4F1E9]/60 px-3 py-2 text-[11px] italic text-[#55524C]">
          <span className="font-semibold not-italic text-[#1A1A1A]">{lt('Amount in words')}:</span> {model.words}
        </p>
      </div>
    </div>
  );
}
