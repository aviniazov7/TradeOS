import { useEffect, useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { pageVariants, pageTransition } from '../../utils/animations';
import { useJournalContext } from '../../contexts/JournalContext';
import { useTrades } from '../../hooks/useTrades';
import { useLinkedExchangeBalance } from '../../hooks/useLinkedExchangeBalance';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { isClosedTrade } from '../../utils/calculations';
import { LRM } from '../../utils/formatters';
import PageHeader from '../shared/PageHeader';
import TabStrip from '../shared/TabStrip';
import AIChat from './AIChat';
import ChartAnalyzer from './ChartAnalyzer';
import AnalystTab from './AnalystTab';

const TABS = [
  { id: 'chat', label: 'צ׳אט' },
  { id: 'analyze', label: 'ניתוח גרפים' },
  { id: 'analyst', label: 'האנליסט שלך' },
];

const fmtK = (v) => {
  const a = Math.abs(v);
  const body = a >= 1000 ? `$${(a / 1000).toFixed(1)}K` : `$${a.toFixed(0)}`;
  return `${LRM}${v >= 0 ? '+' : '-'}${body}`;
};

// One clean page like the rest of the app: the shared header (with the tabs in
// it, as on the news and market pages) and the selected tool filling the rest
// of the screen. The trader's own numbers sit in one quiet line instead of a
// row of cards — they're on the home page already.
export default function TradeAIPage() {
  const [tab, setTab] = useState('chat');
  const { activeJournalId, activeJournal } = useJournalContext();
  // One subscription for the whole page — the analyst tab and the chat read
  // the same book rather than each opening its own listener.
  const { trades } = useTrades(activeJournalId);
  const liveBalance = useLinkedExchangeBalance(activeJournal?.exchange);
  const stats = useDashboardStats(trades, liveBalance != null ? liveBalance : (Number(activeJournal?.initialBalance) || 0));
  const closedCount = useMemo(() => (trades || []).filter(isClosedTrade).length, [trades]);

  // Numbers sit in their own LTR spans so signs stay in front in Hebrew text.
  const pnl = Number(stats?.totalPnL) || 0;
  const pf = stats?.profitFactor;
  const contextLine = closedCount ? (
    <>
      הסוכן רואה את {closedCount} העסקאות הסגורות שלך
      {' · '}<span dir="ltr" className={pnl >= 0 ? 'text-profit' : 'text-loss'}>{fmtK(pnl)}</span>
      {' · '}<span dir="ltr">{(Number(stats?.winRate) || 0).toFixed(1)}%</span> הצלחה
      {Number.isFinite(pf) && <>{' · '}פקטור רווח <span dir="ltr">{pf.toFixed(2)}</span></>}
    </>
  ) : 'הוסף עסקאות ליומן כדי שהסוכן יוכל לנתח את המסחר שלך.';

  // Lock body scroll while the page is open on mobile (iOS needs
  // position:fixed) — each tab manages its own internal scrolling.
  useEffect(() => {
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // The tool fills the screen under the header: screen − app header − page
  // padding − this page's header (phones also keep room for the bottom nav).
  const heightClass = 'h-[calc(100dvh-21.5rem-env(safe-area-inset-bottom))] min-h-[22rem] md:h-[calc(100dvh-15.5rem)] md:min-h-[26rem]';

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-5xl mx-auto">
      <PageHeader
        icon={Sparkles}
        title="TradeAI"
        subtitle={contextLine}
        actions={(
          <div className="rounded-xl bg-bg-tertiary border border-border-primary p-1 w-full sm:w-auto">
            <TabStrip tabs={TABS} value={tab} onChange={setTab} layoutKey="tradeai-tab" />
          </div>
        )}
      />

      {tab === 'chat' && (
        <AIChat
          heightClass={heightClass}
          trades={trades}
          journalId={activeJournalId}
          journalName={activeJournal?.name || ''}
        />
      )}
      {tab === 'analyze' && <ChartAnalyzer heightClass={heightClass} />}
      {/* Mounted only while selected, so the two Firestore reads inside
          AnalystInsights cost nothing on the other tabs. */}
      {tab === 'analyst' && <AnalystTab heightClass={heightClass} trades={trades} />}
    </m.div>
  );
}
