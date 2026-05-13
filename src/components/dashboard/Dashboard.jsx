import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, BookOpen, FlaskConical, ClipboardList, Target, AlertCircle, Trash2, Undo2,
  TrendingUp, DollarSign, Coins, Brain, Sunrise, Moon, CheckCircle2, Clock, ChevronDown, Eye, EyeOff,
  Activity, Newspaper, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTrades } from '../../hooks/useTrades';
import { useJournalContext } from '../../contexts/JournalContext';
import { useBacktests } from '../../hooks/useBacktests';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useDCA } from '../../hooks/useDCA';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import DashboardSkeleton from './DashboardSkeleton';
import PendingLimitOrders from './PendingLimitOrders';
import ExchangeLogo from '../shared/ExchangeLogo';
import CoinIcon from '../shared/CoinIcon';
import AnimatedValue from '../shared/AnimatedValue';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { EXCHANGES, MENTALITY_EMOTIONS } from '../../utils/constants';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';

const cardVariants = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const getExchangeLabel = (value) => EXCHANGES.find((e) => e.value === value)?.label || value;

export default function Dashboard() {
  const navigate = useNavigate();
  const { journals, setActiveJournalId } = useJournalContext();
  const [showAllJournals, setShowAllJournals] = useState(false);
  const [hideBalances, setHideBalances] = useState(() => localStorage.getItem('tradeos_hideBalances') === 'true');

  const toggleHide = () => {
    setHideBalances((v) => {
      localStorage.setItem('tradeos_hideBalances', !v);
      return !v;
    });
  };
  const m = (val) => hideBalances ? '••••' : val;
  const { trades: allTrades, loading: tradesLoading, deleteTrade } = useTrades(); // all trades, no journal filter
  const { backtests: allBacktests, loading: backtestsLoading } = useBacktests();
  const backtests = useMemo(() => allBacktests.filter((b) => b.backtestJournalId), [allBacktests]);
  const { plans, loading: plansLoading } = useTradingPlans();
  const { dcaPlans, loading: dcaLoading } = useDCA();
  const { todayMorning, todayEvening, morningEntries, eveningEntries } = useMentalityJournals();

  const loading = tradesLoading || backtestsLoading || plansLoading || dcaLoading;

  // Cross-journal trade stats (only trades belonging to existing journals)
  const globalStats = useMemo(() => {
    const journalIds = new Set(journals.map((j) => j.id));
    // Include trades with no journalId (legacy/imported before journal assignment) + trades belonging to current journals
    const relevantTrades = allTrades.filter((t) => !t.journalId || journalIds.has(t.journalId));
    const closed = relevantTrades.filter((t) => t.status === 'closed' || (parseFloat(t.exitPrice) > 0 && t.status !== 'partial'));
    const openTrades = relevantTrades.filter((t) => t.status !== 'closed' && (t.status === 'partial' || !(parseFloat(t.exitPrice) > 0)));
    const totalPnL = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const wins = closed.filter((t) => t.result === 'win').length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    const totalInitial = journals.reduce((s, j) => s + (j.initialBalance || 0), 0);
    const totalBalance = totalInitial + totalPnL;
    const pnlPercent = totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;

    // Average R:R — only for closed trades that have a valid stop loss
    const tradesWithRR = closed.filter((t) => {
      const risk = t.direction === 'short'
        ? (t.stopLoss - t.entryPrice)
        : (t.entryPrice - t.stopLoss);
      return t.stopLoss > 0 && t.entryPrice > 0 && t.exitPrice > 0 && risk > 0;
    });
    const avgRR = tradesWithRR.length > 0
      ? tradesWithRR.reduce((s, t) => {
          const risk = t.direction === 'short'
            ? (t.stopLoss - t.entryPrice)
            : (t.entryPrice - t.stopLoss);
          const reward = t.direction === 'short'
            ? (t.entryPrice - t.exitPrice)
            : (t.exitPrice - t.entryPrice);
          return s + reward / risk;
        }, 0) / tradesWithRR.length
      : null;

    return { totalPnL, totalTrades: closed.length, winRate, totalBalance, pnlPercent, openTrades, avgRR };
  }, [allTrades, journals]);

  // Global market data + latest news
  const [globalMarket, setGlobalMarket] = useState(null);
  const [latestNews, setLatestNews] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchMarket = async (attempt = 0) => {
      try {
        const workerUrl = import.meta.env.VITE_WORKER_URL || '';
        const cgBase = workerUrl ? `${workerUrl}/cg` : 'https://api.coingecko.com/api/v3';
        const res = await fetch(`${cgBase}/global`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) setGlobalMarket(json.data);
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (attempt < 2) setTimeout(() => fetchMarket(attempt + 1), 3000 * (attempt + 1));
      }
    };
    fetchMarket();
    const interval = setInterval(() => fetchMarket(), 5 * 60 * 1000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchNews = async (attempt = 0) => {
      try {
        const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://cointelegraph.com/rss'), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) setLatestNews((json.items || []).slice(0, 4));
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (attempt < 2) setTimeout(() => fetchNews(attempt + 1), 3000 * (attempt + 1));
      }
    };
    fetchNews();
    const interval = setInterval(() => fetchNews(), 15 * 60 * 1000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  // Live prices for open trades
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => {
    if (globalStats.openTrades.length === 0) return;
    const controller = new AbortController();

    const fetchLivePrices = async () => {
      const pairs = [...new Set(globalStats.openTrades.map((t) => t.pair || t.symbol).filter(Boolean))];
      const newPrices = {};
      await Promise.all(pairs.map(async (pair) => {
        try {
          const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${pair}`, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            newPrices[pair] = parseFloat(data.price);
          }
        } catch (e) { if (e.name !== 'AbortError') console.error(e); }
      }));
      if (!controller.signal.aborted) setLivePrices(newPrices);
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 30000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [globalStats.openTrades]);

  // Per-journal stats
  const journalStats = useMemo(() => {
    return journals.map((j) => {
      const jTrades = allTrades.filter((t) => t.journalId === j.id);
      const closed = jTrades.filter((t) => t.status === 'closed' || parseFloat(t.exitPrice) > 0);
      const pnl = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
      const wins = closed.filter((t) => t.result === 'win').length;
      const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
      const balance = (j.initialBalance || 0) + pnl;
      return { ...j, tradesCount: closed.length, pnl, winRate, balance };
    });
  }, [journals, allTrades]);

  // Active plans
  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);

  // Backtest stats
  const backtestStats = useMemo(() => {
    if (!backtests.length) return null;
    const wins = backtests.filter((b) => b.result === 'win').length;
    const winRate = (wins / backtests.length) * 100;
    const avgR = backtests.reduce((s, b) => s + (b.rResult || 0), 0) / backtests.length;
    const pairCounts = {};
    backtests.forEach((b) => { if (b.pair) pairCounts[b.pair] = (pairCounts[b.pair] || 0) + 1; });
    const topPair = Object.entries(pairCounts).sort((a, b) => b[1] - a[1])[0];
    const strategyCounts = {};
    backtests.forEach((b) => { if (b.strategy) strategyCounts[b.strategy] = (strategyCounts[b.strategy] || 0) + 1; });
    const topStrategy = Object.entries(strategyCounts).sort((a, b) => b[1] - a[1])[0];
    return { winRate, avgR, topPair: topPair?.[0], topStrategy: topStrategy?.[0] };
  }, [backtests]);

  // DCA stats
  const dcaStats = useMemo(() => {
    if (!dcaPlans.length) return null;
    const totalInvested = dcaPlans.reduce((s, p) => s + (p.totalInvested || 0), 0);
    const totalEntries = dcaPlans.reduce((s, p) => s + (p.entries || []).length, 0);
    const activeCount = dcaPlans.filter((d) => d.status === 'active').length;
    const coins = dcaPlans.map((p) => p.coin).filter(Boolean);
    return { totalInvested, totalEntries, activeCount, coins };
  }, [dcaPlans]);

  if (loading) return <DashboardSkeleton />;

  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-5';
  const pnlColor = (v) => v >= 0 ? 'text-profit' : 'text-loss';
  const formatNum = (n) => {
    if (!n) return '—';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PendingLimitOrders trades={globalStats.openTrades} livePrices={livePrices} />

      {/* Global summary cards */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" variants={staggerContainer} initial="initial" animate="animate">
        <motion.div className={`${cardClass} relative overflow-hidden`} variants={cardVariants}>
          {/* Dynamic gradient overlay based on PnL */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-700"
            style={{
              background: globalStats.totalPnL >= 0
                ? 'radial-gradient(ellipse at top right, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 40%, transparent 70%)'
                : 'radial-gradient(ellipse at top right, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 40%, transparent 70%)',
              opacity: globalStats.totalPnL !== 0 ? 1 : 0,
            }}
          />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-accent-primary" />
                <span className="text-xs text-text-muted">יתרה כוללת</span>
              </div>
              <button
                onClick={toggleHide}
                className="p-1 rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title={hideBalances ? 'הצג סכומים' : 'הסתר סכומים'}
              >
                {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-text-primary"><AnimatedValue value={m(formatCurrency(globalStats.totalBalance).replace('+', ''))} /></span>
              {globalStats.pnlPercent !== 0 && (
                <span className={`text-xs font-medium ${pnlColor(globalStats.pnlPercent)}`}>
                  {m(`${globalStats.pnlPercent > 0 ? '+' : ''}${globalStats.pnlPercent.toFixed(1)}%`)}
                </span>
              )}
            </div>
          </div>
        </motion.div>
        <motion.div className={cardClass} variants={cardVariants}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className={`w-4 h-4 ${pnlColor(globalStats.totalPnL)}`} />
            <span className="text-xs text-text-muted">רווח/הפסד כולל</span>
          </div>
          <span className={`text-xl font-bold ${pnlColor(globalStats.totalPnL)}`}><AnimatedValue value={m(formatCurrency(globalStats.totalPnL))} /></span>
        </motion.div>
        <motion.div className={cardClass} variants={cardVariants}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-accent-primary" />
            <span className="text-xs text-text-muted">עסקאות סה&quot;כ</span>
          </div>
          <span className="text-xl font-bold text-text-primary"><AnimatedValue value={m(String(globalStats.totalTrades))} /></span>
        </motion.div>
        <motion.div className={cardClass} variants={cardVariants}>
          {globalStats.avgRR !== null ? (
            <div className="flex items-center justify-between gap-2">
              {/* Win rate — right side (RTL start) */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Target className="w-3.5 h-3.5 text-accent-primary" />
                  <span className="text-[11px] text-text-muted">אחוז הצלחה</span>
                </div>
                <span className="text-xl font-bold text-text-primary">
                  <AnimatedValue value={m(`${globalStats.winRate.toFixed(1)}%`)} />
                </span>
              </div>
              {/* Divider */}
              <div className="w-px self-stretch bg-border-primary mx-1" />
              {/* R:R — left side (RTL end) */}
              <div className="text-left">
                <div className="text-[11px] text-text-muted mb-1.5">ממוצע R:R</div>
                <span className={`text-xl font-bold ${globalStats.avgRR >= 1 ? 'text-profit' : 'text-loss'}`}>
                  {m(`${globalStats.avgRR.toFixed(2)}R`)}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-accent-primary" />
                <span className="text-xs text-text-muted">אחוז הצלחה כולל</span>
              </div>
              <span className="text-xl font-bold text-text-primary">
                <AnimatedValue value={m(`${globalStats.winRate.toFixed(1)}%`)} />
              </span>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Journals overview */}
      <div className={`${cardClass} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> יומני מסחר ({journals.length})
          </h2>
          <button
            onClick={() => navigate('/journal')}
            className="text-xs text-accent-primary hover:underline cursor-pointer"
          >
            לכל היומנים
          </button>
        </div>
        {journalStats.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {journalStats.slice(0, 3).map((j) => (
                <button
                  key={j.id}
                  onClick={() => { setActiveJournalId(j.id); navigate('/journal'); }}
                  className="bg-bg-tertiary border border-border-primary rounded-lg p-3 text-right hover:border-accent-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">{j.name}</span>
                    <div className="flex items-center gap-1">
                      <ExchangeLogo exchange={j.exchange} size="w-4 h-4" />
                      <span className="text-xs text-text-muted">{getExchangeLabel(j.exchange)}</span>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-text-primary mb-1">{m(formatCurrency(j.balance).replace('+', ''))}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`font-medium ${pnlColor(j.pnl)}`}>{m(formatCurrency(j.pnl))}</span>
                    <span className="text-text-muted">{j.tradesCount} עסקאות</span>
                    <span className="text-text-muted">{j.winRate.toFixed(0)}% הצלחה</span>
                  </div>
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {showAllJournals && journalStats.length > 3 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {journalStats.slice(3).map((j) => (
                      <button
                        key={j.id}
                        onClick={() => { setActiveJournalId(j.id); navigate('/journal'); }}
                        className="bg-bg-tertiary border border-border-primary rounded-lg p-3 text-right hover:border-accent-primary/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-text-primary">{j.name}</span>
                          <div className="flex items-center gap-1">
                            <ExchangeLogo exchange={j.exchange} size="w-4 h-4" />
                            <span className="text-xs text-text-muted">{getExchangeLabel(j.exchange)}</span>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-text-primary mb-1">{m(formatCurrency(j.balance).replace('+', ''))}</div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-medium ${pnlColor(j.pnl)}`}>{m(formatCurrency(j.pnl))}</span>
                          <span className="text-text-muted">{j.tradesCount} עסקאות</span>
                          <span className="text-text-muted">{j.winRate.toFixed(0)}% הצלחה</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {journalStats.length > 3 && (
              <button
                onClick={() => setShowAllJournals((v) => !v)}
                className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-xs text-text-muted hover:text-accent-primary transition-colors cursor-pointer"
              >
                <span>{showAllJournals ? 'הצג פחות' : `הצג עוד ${journalStats.length - 3} יומנים`}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showAllJournals ? 'rotate-180' : ''}`} />
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-text-muted">אין יומנים עדיין</p>
        )}
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Backtests */}
        <button onClick={() => navigate('/backtest')} className={`${cardClass} text-right hover:border-accent-primary/30 transition-colors cursor-pointer`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-semibold text-text-primary">בקטסטים</span>
            </div>
            <span className="text-lg font-bold text-text-primary">{backtests.length}</span>
          </div>
          {backtestStats ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">אחוז הצלחה</span>
                <span className={`text-xs font-bold ${backtestStats.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>{backtestStats.winRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">ממוצע R</span>
                <span className={`text-xs font-bold ${backtestStats.avgR >= 0 ? 'text-profit' : 'text-loss'}`}>{backtestStats.avgR.toFixed(2)}R</span>
              </div>
              {backtestStats.topPair && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">זוג מוביל</span>
                  <span className="text-xs font-medium text-accent-primary">{backtestStats.topPair}</span>
                </div>
              )}
              {backtestStats.topStrategy && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">אסטרטגיה</span>
                  <span className="text-xs font-medium text-text-secondary truncate max-w-[120px]">{backtestStats.topStrategy}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">אין בקטסטים עדיין</p>
          )}
        </button>

        {/* Trading Plans */}
        <button onClick={() => navigate('/plans')} className={`${cardClass} text-right hover:border-accent-primary/30 transition-colors cursor-pointer`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-semibold text-text-primary">תוכניות מסחר</span>
            </div>
            <span className="text-lg font-bold text-text-primary">{plans.length}</span>
          </div>
          {plans.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">פעילות</span>
                <span className={`text-xs font-bold ${activePlans.length > 0 ? 'text-profit' : 'text-text-muted'}`}>{activePlans.length} / {plans.length}</span>
              </div>
              {activePlans.slice(0, 2).map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary truncate max-w-[140px]">{p.name}</span>
                  <span className="text-[10px] text-profit">פעילה</span>
                </div>
              ))}
              {plans[0]?.pairs?.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">זוגות</span>
                  <span className="text-xs text-text-secondary">{[...new Set(plans.flatMap((p) => p.pairs || []))].length} זוגות</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">אין תוכניות עדיין</p>
          )}
        </button>

        {/* DCA */}
        <button onClick={() => navigate('/dca')} className={`${cardClass} text-right hover:border-accent-primary/30 transition-colors cursor-pointer`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-semibold text-text-primary">מעקב DCA</span>
            </div>
            <span className="text-lg font-bold text-text-primary">{dcaPlans.length}</span>
          </div>
          {dcaStats ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">סה״כ מושקע</span>
                <span className="text-xs font-bold text-text-primary">{m(`$${formatCurrency(dcaStats.totalInvested).replace(/[+$]/g, '')}`)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">רכישות</span>
                <span className="text-xs font-medium text-text-secondary">{dcaStats.totalEntries}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">פעילים</span>
                <span className={`text-xs font-bold ${dcaStats.activeCount > 0 ? 'text-profit' : 'text-text-muted'}`}>{dcaStats.activeCount} / {dcaPlans.length}</span>
              </div>
              {dcaStats.coins.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">מטבעות</span>
                  <span className="text-xs text-accent-primary font-medium">{dcaStats.coins.join(', ')}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">אין תוכניות DCA עדיין</p>
          )}
        </button>
      </div>

      {/* Mentality Zone */}
      <div className={`${cardClass} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Brain className="w-4 h-4" /> האזור המנטלי
          </h2>
          <button
            onClick={() => navigate('/mentality')}
            className="text-xs text-accent-primary hover:underline cursor-pointer"
          >
            לאזור המנטלי
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Morning journal status */}
          <button
            onClick={() => navigate('/mentality/morning')}
            className="bg-bg-tertiary border border-border-primary rounded-lg p-3 text-right hover:border-accent-primary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sunrise className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-text-primary">יומן בוקר</span>
              </div>
              {todayMorning ? (
                <CheckCircle2 className="w-4 h-4 text-profit" />
              ) : (
                <Clock className="w-4 h-4 text-text-muted" />
              )}
            </div>
            <div className="text-xs text-text-muted">
              {todayMorning
                ? `${(MENTALITY_EMOTIONS.find((e) => e.key === todayMorning.emotion)?.emoji || '')} מולא היום`
                : 'טרם מולא היום'}
            </div>
            <div className="text-[11px] text-text-muted mt-1">{morningEntries.length} רשומות סה״כ</div>
          </button>

          {/* Evening journal status */}
          <button
            onClick={() => navigate('/mentality/evening')}
            className="bg-bg-tertiary border border-border-primary rounded-lg p-3 text-right hover:border-accent-primary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-text-primary">יומן ערב</span>
              </div>
              {todayEvening ? (
                <CheckCircle2 className="w-4 h-4 text-profit" />
              ) : (
                <Clock className="w-4 h-4 text-text-muted" />
              )}
            </div>
            <div className="text-xs text-text-muted">
              {todayEvening
                ? `${(MENTALITY_EMOTIONS.find((e) => e.key === todayEvening.emotionAfter)?.emoji || '')} מולא היום`
                : 'טרם מולא היום'}
            </div>
            <div className="text-[11px] text-text-muted mt-1">{eveningEntries.length} רשומות סה״כ</div>
          </button>

          {/* Journey shortcut */}
          <button
            onClick={() => navigate('/mentality/journey')}
            className="bg-bg-tertiary border border-border-primary rounded-lg p-3 text-right hover:border-accent-primary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium text-text-primary">המסע הפסיכולוגי</span>
            </div>
            <div className="text-xs text-text-muted">המסלול הקלאסי שרוב הסוחרים עוברים</div>
            <div className="text-[11px] text-accent-primary mt-1">7 שלבים →</div>
          </button>
        </div>
      </div>

      {/* Market Overview & News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Market Overview */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Activity className="w-4 h-4" /> סקירת שוק
            </h2>
            <button
              onClick={() => navigate('/market')}
              className="text-xs text-accent-primary hover:underline cursor-pointer"
            >
              לסקירה המלאה
            </button>
          </div>
          {globalMarket ? (
            <div className="grid grid-cols-2 gap-2.5">
              {/* Row 1 - cell 1: Market Cap */}
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3 col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">שווי שוק כולל</span>
                  {globalMarket.market_cap_change_percentage_24h_usd != null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${globalMarket.market_cap_change_percentage_24h_usd >= 0 ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                      {globalMarket.market_cap_change_percentage_24h_usd >= 0 ? '+' : ''}{globalMarket.market_cap_change_percentage_24h_usd.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-text-primary mt-1">{formatNum(globalMarket.total_market_cap?.usd)}</div>
              </div>
              {/* Row 2: BTC.D + ETH.D */}
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                  <span className="text-[11px] text-text-muted">BTC דומיננטיות</span>
                </div>
                <div className="text-base font-bold text-accent-primary">{globalMarket.market_cap_percentage?.btc?.toFixed(1)}%</div>
              </div>
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-[11px] text-text-muted">ETH דומיננטיות</span>
                </div>
                <div className="text-base font-bold text-indigo-400">{globalMarket.market_cap_percentage?.eth?.toFixed(1)}%</div>
              </div>
              {/* Row 3: Volume + Active coins */}
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3 h-3 text-text-muted" />
                  <span className="text-[11px] text-text-muted">נפח מסחר 24ש</span>
                </div>
                <div className="text-base font-bold text-text-primary">{formatNum(globalMarket.total_volume?.usd)}</div>
              </div>
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Coins className="w-3 h-3 text-text-muted" />
                  <span className="text-[11px] text-text-muted">מטבעות פעילים</span>
                </div>
                <div className="text-base font-bold text-text-primary">{globalMarket.active_cryptocurrencies?.toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-muted">טוען נתוני שוק...</p>
          )}
        </div>

        {/* Latest News */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Newspaper className="w-4 h-4" /> חדשות אחרונות
            </h2>
            <button
              onClick={() => navigate('/news')}
              className="text-xs text-accent-primary hover:underline cursor-pointer"
            >
              לכל החדשות
            </button>
          </div>
          {latestNews.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {latestNews.map((item, i) => {
                const thumb = item.thumbnail || item.enclosure?.link || null;
                return (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-bg-tertiary border border-border-primary rounded-lg overflow-hidden hover:border-accent-primary/40 transition-all flex flex-col"
                  >
                    {thumb ? (
                      <div className="relative w-full h-20 bg-bg-primary overflow-hidden">
                        <img
                          src={thumb}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                        />
                        <div className="absolute top-1 left-1 p-1 rounded bg-black/50 backdrop-blur-sm">
                          <ExternalLink className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-20 bg-gradient-to-br from-bg-primary to-bg-tertiary flex items-center justify-center">
                        <Newspaper className="w-6 h-6 text-text-muted/40" />
                      </div>
                    )}
                    <div className="p-2 flex-1 flex flex-col justify-between">
                      <p className="text-[11px] text-text-secondary group-hover:text-text-primary line-clamp-2 leading-snug transition-colors">
                        {item.title}
                      </p>
                      {item.pubDate && (
                        <p className="text-[9px] text-text-muted mt-1">
                          {formatDate(new Date(item.pubDate))}
                        </p>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">טוען חדשות...</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
