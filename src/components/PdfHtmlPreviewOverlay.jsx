import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, useLabelT } from './kit';

/**
 * Inline settings-layout PDF preview — no window.open / popup blocker.
 * Renders voucher HTML in a full-screen overlay iframe (srcDoc).
 */
export default function PdfHtmlPreviewOverlay({ html, title, onClose }) {
  const lt = useLabelT();
  if (!html) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-ink/50 backdrop-blur-[2px]"
      data-testid="pdf-html-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title || lt('Document preview')}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{title || lt('Document preview')}</p>
          <p className="text-[11px] text-ink-soft">{lt('Settings PDF layout')}</p>
        </div>
        <Button variant="ghost" onClick={onClose} data-testid="pdf-html-preview-close" aria-label={lt('Close')}>
          <X size={16} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-[#e8e4dc] p-3 sm:p-5">
        <iframe
          title={title || 'PDF preview'}
          srcDoc={html}
          className="mx-auto h-full w-full max-w-[840px] rounded-lg border border-line bg-white shadow-lg"
          sandbox="allow-same-origin"
        />
      </div>
    </div>,
    document.body,
  );
}
