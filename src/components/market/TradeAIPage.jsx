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

export default function TradeAIPage() {
  const [tab, setTab] = useState('chat');
  const [seed, setSeed] = useState('');
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
    const step = curve.length / 40;
    return Array.from({ length: 40 }, (_, i) => curve[Math.min(curve.length - 1, Math.floor(i * step))]);
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
    // A fresh string every time, so tapping the same chip twice still refills
    // the box after the user has cleared it.
    setSeed(`${text}`);
  };

  // The hub takes vertical space, so the tab panes get a shorter viewport.
  const heightClass = 'h-[calc(100dvh-27rem)] min-h-[17rem] md:h-[calc(100vh-25rem)] md:min-h-[22rem]';

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

      {tab === 'chat' && <AIChat heightClass={heightClass} seedQuestion={seed} />}
      {tab === 'analyze' && <ChartAnalyzer heightClass={heightClass} />}
      {/* Mounted only while selected, so the two Firestore reads inside
          AnalystInsights cost nothing on the other tabs. */}
      {tab === 'analyst' && <AnalystTab heightClass={heightClass} trades={trades} />}
    </motion.div>
  );
}
