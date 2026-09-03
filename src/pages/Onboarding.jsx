import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, LayoutDashboard, Plus, BarChart3, MousePointerClick } from 'lucide-react';
import { Button, useLabelT } from '../components/kit';
import { markOnboardingCompleted } from '../utils/onboardingNav';
import { useAuth } from '../contexts/AuthContext';

const SLIDES = [
  {
    id: 'welcome',
    title: 'Welcome to TallyDekho Web',
    desc: 'Your Tally books on desktop — same data as the mobile app, bigger screen for registers and reports.',
    Demo: () => (
      <div className="mx-auto grid max-w-sm grid-cols-3 gap-2 rounded-2xl border border-line bg-cream/60 p-4">
        {['Sales', 'Purchase', 'Inventory'].map(l => (
          <div key={l} className="rounded-lg bg-surface px-2 py-3 text-center text-[11px] font-semibold text-ink shadow-sm">{l}</div>
        ))}
      </div>
    ),
  },
  {
    id: 'navigate',
    title: 'Navigate quickly',
    desc: 'Use the sidebar and ⌘K command palette to jump to any register, KPI, or setting.',
    Demo: () => (
      <div className="mx-auto flex max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[12px] text-ink-soft">
        <LayoutDashboard size={16} />
        <span className="flex-1">Search vouchers, ledgers, stock…</span>
        <kbd className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </div>
    ),
  },
  {
    id: 'create',
    title: 'Create anything',
    desc: 'The Create menu covers every voucher and master — sales invoice, payment, stock transfer, party, and more.',
    Demo: () => (
      <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-xl border border-line bg-ink px-4 py-4 text-white">
        <Plus size={18} />
        <span className="text-[13px] font-semibold">Create</span>
      </div>
    ),
  },
  {
    id: 'cashflow',
    title: 'Cashflow & KPIs',
    desc: 'Dashboard KPI cards drill into receivables, bank balance, and cashflow — full report on the Cashflow screen.',
    Demo: () => (
      <div className="mx-auto max-w-sm rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink"><BarChart3 size={14} /> Net cash</div>
        <div className="h-16 rounded-lg bg-paper-2" />
      </div>
    ),
  },
  {
    id: 'registers',
    title: 'Registers & compliance',
    desc: 'Open any voucher from registers, preview Tally PDFs, generate IRN/EWB, and track My Entries.',
    Demo: () => (
      <div className="mx-auto flex max-w-sm items-center gap-2 rounded-xl border border-line bg-cream/60 px-4 py-3 text-[12px] text-ink-soft">
        <MousePointerClick size={16} />
        <span>Click a row → full document viewer</span>
      </div>
    ),
  },
];

export default function Onboarding() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const replay = params.get('replay') === 'true';
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const Demo = slide.Demo;

  const finish = () => {
    if (!replay) markOnboardingCompleted(user);
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper" data-testid="onboarding-page">
      <header className="flex items-center justify-between px-6 py-4">
        <button type="button" onClick={finish} className="text-[13px] font-medium text-ink-soft hover:text-ink" data-testid="onboarding-skip">
          {lt(replay ? 'Close' : 'Skip')}
        </button>
        <span className="text-[12px] tabular text-ink-faint">{i + 1} / {SLIDES.length}</span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-12 text-center">
        <div className="mb-10 w-full max-w-lg"><Demo /></div>
        <h1 className="max-w-md text-2xl font-bold tracking-tight text-ink">{lt(slide.title)}</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">{lt(slide.desc)}</p>
        <div className="mt-10 flex items-center gap-3">
          {i > 0 && (
            <Button onClick={() => setI(n => n - 1)} data-testid="onboarding-back">
              <ChevronLeft size={14} /> {lt('Back')}
            </Button>
          )}
          <Button variant="primary" onClick={() => (last ? finish() : setI(n => n + 1))} data-testid="onboarding-next">
            {lt(last ? 'Get started' : 'Next')} {!last && <ArrowRight size={14} />}
          </Button>
        </div>
      </main>
    </div>
  );
}
