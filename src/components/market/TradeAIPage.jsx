import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, BarChart3, Gauge } from 'lucide-react';
import { pageVariants, pageTransition } from '../../utils/animations';
import { useJournalContext } from '../../contexts/JournalContext';
import { useTrades } from '../../hooks/useTrades';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { isClosedTrade } from '../../utils/calculations';
import AIChat from './AIChat';
import ChartAnalyzer from './ChartAnalyzer';
import AnalystTab from './AnalystTab';
import TradeAIHub from './TradeAIHub';

const TABS = [
  { id: 'chat', label: 'צ׳אט', icon: MessageCircle },
  { id: 'analyze', label: 'ניתוח גרפים', icon: BarChart3 },
  { id: 'analyst', label: 'האנליסט שלך', icon: Gauge },
];

const tradeMs = (t) => {
  const d = t.exitDate || t.entryDate || t.createdAt;
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const HUB_KEY = 'tradeai:hub-open';

export default function TradeAIPage() {
  const [tab, setTab] = useState('chat');
  const [seed, setSeed] = useState(null);
  // The hub is useful on arrival and in the way once you are typing, so it
  // collapses — and the choice sticks, because re-collapsing it on every visit
  // would be its own annoyance.
  const [hubOpen, setHubOpen] = useState(() => {
    try { return localStorage.getItem(HUB_KEY) !== '0'; } catch { return true; }
  });

  const toggleHub = () => {
    setHubOpen((v) => {
      const next = !v;
      try { localStorage.setItem(HUB_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };
  const { activeJournalId, activeJournal } = useJournalContext();
  // One subscription for the whole page — the hub, the analyst tab and the
  // chat read the same book rather than each opening its own listener.
  const { trades } = useTrades(activeJournalId);
  const stats = useDashboardStats(trades, Number(activeJournal?.initialBalance) || 0);

  const closedCount = useMemo(() => (trades || []).filter(isClosedTrade).length, [trades]);

  // Cumulative P&L for the sparkline, downsampled so a long history stays legible.
  const equityCurve = useMemo(() => {
    const closed = (trades || []).filter(isClosedTrade).sort((a, b) => tradeMs(a) - tradeMs(b));
    const curve = closed.reduce((acc, t) => {
      const prev = acc.length ? acc[acc.length - 1] : 0;
      acc.push(Math.round((prev + (Number(t.netPnl ?? t.pnl ?? 0) || 0)) * 100) / 100);
      return acc;
    }, []);
    if (curve.length <= 40) return curve;
    // Span the full range: floor(39 * len/40) never reaches len-1, so the spark
    // used to end on an earlier value than the P&L figure printed beside it.
    const step = (curve.length - 1) / 39;
    return Array.from({ length: 40 }, (_, i) => curve[Math.round(i * step)]);
  }, [trades]);

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

  const askFromHub = (text) => {
    setTab('chat');
    // A new OBJECT every time. The previous version passed a string, which is
    // identical on a second tap — React bails out, the effect never re-runs, and
    // the chip silently does nothing after you have cleared the box.
    setSeed({ text });
  };

  // Collapsed, the pane reclaims the ~13rem the hub occupies. Both states keep a
  // floor so the chat never becomes unusable on a short viewport.
  const heightClass = hubOpen
    ? 'h-[calc(100dvh-27rem)] min-h-[20rem] md:h-[calc(100vh-25rem)] md:min-h-[24rem]'
    : 'h-[calc(100dvh-14rem)] min-h-[26rem] md:h-[calc(100vh-13rem)] md:min-h-[30rem]';

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="overflow-hidden space-y-3"
    >
      <TradeAIHub
        stats={stats}
        tradesCount={closedCount}
        equityCurve={equityCurve}
        onAsk={askFromHub}
        open={hubOpen}
        onToggle={toggleHub}
      />

      <div className="max-w-2xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-bg-secondary/50 border border-border-primary">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === t.id
                  ? 'bg-accent-primary text-bg-primary shadow-lg shadow-accent-primary/20'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <t.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'chat' && <AIChat heightClass={heightClass} seedQuestion={seed} trades={trades} />}
      {tab === 'analyze' && <ChartAnalyzer heightClass={heightClass} />}
      {/* Mounted only while selected, so the two Firestore reads inside
          AnalystInsights cost nothing on the other tabs. */}
      {tab === 'analyst' && <AnalystTab heightClass={heightClass} trades={trades} />}
    </motion.div>
  );
}
