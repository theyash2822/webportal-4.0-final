/**
 * Quotations are not wired to a live Tally write API yet.
 * Kept as an honest stub so CreateModal never shows fake customers / voucher numbers.
 */
export default function QuotationForm({ onClose }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
      <p className="text-base font-semibold text-[#1A1A1A]">Quotations not available yet</p>
      <p className="text-sm text-[#787774] max-w-sm">
        Create Quotation is not connected to Tally. Use Sales Order or Sales Invoice instead.
      </p>
      {onClose && (
        <button
          onClick={onClose}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#D4D3CE] text-[#787774] hover:bg-[#F5F4EF]"
        >
          Close
        </button>
      )}
    </div>
  );
}
