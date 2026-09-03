/**
 * USB barcode-gun (HID keyboard wedge) input.
 * Scanners type digits rapidly and send Enter — no camera needed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useLabelT } from './kit';

export default function BarcodeGunInput({
  onScan,
  disabled,
  placeholder = 'Click here, then scan…',
  testid = 'barcode-gun-input',
  className = '',
  autoFocus = false,
}) {
  const lt = useLabelT();
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [active, setActive] = useState(false);
  const bufferRef = useRef('');
  const lastKeyRef = useRef(0);

  const submit = useCallback((code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed || disabled) return;
    setValue('');
    bufferRef.current = '';
    onScan?.(trimmed);
  }, [disabled, onScan]);

  const onKeyDown = e => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastKeyRef.current > 80) bufferRef.current = '';
    lastKeyRef.current = now;

    if (e.key === 'Enter') {
      e.preventDefault();
      submit(bufferRef.current || value);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      bufferRef.current += e.key;
    }
  };

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`relative flex-1 ${active ? 'ring-2 ring-ink/20 rounded-lg' : ''}`}>
        <ScanLine size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          type="text"
          data-testid={testid}
          disabled={disabled}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setActive(true)}
          onBlur={() => { setActive(false); bufferRef.current = ''; }}
          placeholder={lt(placeholder)}
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-ink disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={() => submit(value)}
        className="h-10 shrink-0 rounded-lg border border-line bg-cream px-3 text-[12px] font-medium hover:border-ink disabled:opacity-40"
        data-testid={`${testid}-submit`}
      >
        {lt('Lookup')}
      </button>
    </div>
  );
}
