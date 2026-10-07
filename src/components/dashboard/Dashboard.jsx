import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Eye, EyeOff, Plus, ChevronDown } from 'lucide-react';
import { useTrades } from '../../hooks/useTrades';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBacktests } from '../../hooks/useBacktests';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useDCA } from '../../hooks/useDCA';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useLinkedJournals } from '../../hooks/useLinkedExchangeBalance';
import { KEY_PROBLEM_TEXT } from '../../services/exchangeService';
import { isClosedTrade } from '../../utils/calculations';
import DashboardSkeleton from './DashboardSkeleton';
import PendingLimitOrders from './PendingLimitOrders';
import TradeAgentCard from './TradeAgentCard';
import GettingStartedCard from './GettingStartedCard';
import PortfolioHero from './PortfolioHero';
import { HomePanel, HomeKpis, RecentTradesCard, ScoreCard, QuickLinks, MarketCard } from './HomeSections';
import { NewsList } from './NewsList';
import PageHeader from '../shared/PageHeader';
import ExchangeLogo from '../shared/ExchangeLogo';
import Card from '../shared/Card';
import FitText from '../shared/FitText';
import Reveal from '../shared/Reveal';
import { formatCurrency } from '../../utils/formatters';
import { EXCHANGES } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';
import { fetchPerpPrices } from '../../services/bybitDirect';
import { fetchStockQuotes } from '../../services/stocksApi';

const getExchangeLabel = (value) => EXCHANGES.find((e) => e.value === value)?.label || value;

// "Good evening, Avi" + today's date, for the page header.
function greetingFor(name) {
  const h = new Date().getHours();
  const hello = h >= 5 && h < 12 ? 'בוקר טוב' : h >= 12 && h < 17 ? 'צהריים טובים' : h >= 17 && h < 22 ? 'ערב טוב' : 'לילה טוב';
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}
const todayLabel = () => new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

// One journal on the dashboard: the portfolio value says where it comes from
// — the live exchange wallet ("LIVE"), the starting balance + P&L ("מחושב"), or
// nothing we can stand behind (no live wallet and no starting balance).
function JournalTile({ j, mask, onOpen }) {
  const pnlCls = j.pnl > 0 ? 'text-profit' : j.pnl < 0 ? 'text-loss' : 'text-text-secondary';
  let missingWhy = 'לא הוגדרה יתרה התחלתית ליומן';
  if (j.problem) missingWhy = `${KEY_PROBLEM_TEXT[j.problem]} — עדכן בחיבור בורסאות`;
  else if (j.exchange) missingWhy = `אין כרגע שווי חי מ-${getExchangeLabel(j.exchange)}`;
  return (
    <Card as="button" type="button" hover spotlight onClick={onOpen} className="w-full text-right p-4 flex flex-col gap-3">
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {j.exchange && <ExchangeLogo exchange={j.exchange} size="w-5 h-5" />}
          <span className="text-sm font-semibold text-text-primary truncate">{j.name}</span>
        </div>
        {j.balance !== null && (
          j.live ? (
            <span dir="ltr" className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/25 shrink-0"
              title="שווי חי מהבורסה">
              <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />LIVE
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border-primary shrink-0"
              title="יתרה התחלתית + רווח/הפסד מהיומן">
              מחושב
            </span>
          )
        )}
      </div>

      <div className="relative">
        <div className="text-[11px] text-text-muted mb-0.5">שווי התיק</div>
        {j.balance !== null ? (
          <FitText as="div" className="num-mono text-xl font-bold text-text-primary" dir="ltr" style={{ textAlign: 'right' }}>
            {mask(formatCurrency(j.balance).replace('+', ''))}
          </FitText>
        ) : (
          <>
            <div className="text-xl font-bold text-text-muted">—</div>
            <div className={`text-[11px] mt-0.5 ${j.problem ? 'text-loss' : 'text-text-muted'}`}>{missingWhy}</div>
          </>
        )}
      </div>

      <div className="relative flex items-center gap-3 text-xs pt-3 border-t border-border-primary">
        <span className={`num-mono font-semibold ${pnlCls}`} dir="ltr">{mask(formatCurrency(j.pnl))}</span>
        <span className="text-text-muted">{j.tradesCount} עסקאות</span>
        <span className="text-text-muted">{j.winRate.toFixed(0)}% הצלחה</span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
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
  const { trades: allTrades, loading: tradesLoading } = useTrades(); // all trades, no journal filter
  const { backtests: allBacktests, loading: backtestsLoading } = useBacktests();
  const backtests = useMemo(() => allBacktests.filter((b) => b.backtestJournalId), [allBacktests]);
  const { plans, loading: plansLoading } = useTradingPlans();
  const { dcaPlans, loading: dcaLoading } = useDCA();
  const { todayMorning, todayEvening, morningEntries } = useMentalityJournals();

  const loading = tradesLoading || backtestsLoading || plansLoading || dcaLoading;

  // Live wallet balance for every journal that's linked to a connected exchange.
  const { balances: linkedBalances, problems: linkedProblems } = useLinkedJournals(journals);

  // Cross-journal trade stats (only trades belonging to existing journals)
  const globalStats = useMemo(() => {
    const journalIds = new Set(journals.map((j) => j.id));
    // Include trades with no journalId (legacy/imported before journal assignment) + trades belonging to current journals
    const relevantTrades = allTrades.filter((t) => !t.journalId || journalIds.has(t.journalId));
    const closed = relevantTrades.filter(isClosedTrade);
    const openTrades = relevantTrades.filter((t) => !isClosedTrade(t));
    const totalPnL = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const wins = closed.filter((t) => t.result === 'win').length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    // Per-journal: prefer live wallet when linked. Derive a synthetic
    // initialBalance for linked journals so percentages stay consistent with
    // the wallet (effInit = live − that journal's closed PnL).
    let totalInitial = 0;
    let totalBalance = 0;
    for (const j of journals) {
      const jPnL = closed
        .filter((t) => t.journalId === j.id)
        .reduce((acc, t) => acc + (t.netPnl ?? t.pnl ?? 0), 0);
      if (linkedBalances[j.id] != null) {
        totalInitial += Math.max(0, linkedBalances[j.id] - jPnL);
        totalBalance += linkedBalances[j.id];
      } else if (j.initialBalance > 0) {
        // Only count an unlinked journal in the portfolio VALUE when it has a real
        // starting balance. Otherwise (initial 0 + a negative PnL) it invents a
        // phantom negative account value that wrongly drags the total down.
        totalInitial += j.initialBalance;
        totalBalance += j.initialBalance + jPnL;
      }
      // else: unlinked journal with no starting balance → not part of the total value.
    }
    // Balance-based %: value vs its own initial, so it stays consistent with the
    // counted journals and isn't skewed by PnL from journals excluded above.
    const pnlPercent = totalInitial > 0 ? ((totalBalance - totalInitial) / totalInitial) * 100 : 0;

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
  }, [allTrades, journals, linkedBalances]);

  // Global market data + latest news
  const [globalMarket, setGlobalMarket] = useState(null);
  const [latestNews, setLatestNews] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchMarket = async (attempt = 0) => {
      try {
        // Proxy CoinGecko through the worker (direct browser calls are
        // CORS/geo-blocked). Match the hardcoded fallback used app-wide so it
        // works even when VITE_WORKER_URL isn't set at build time.
        const workerUrl = import.meta.env.VITE_WORKER_URL || 'https://trade-os.tradeos.workers.dev';
        const cgBase = `${workerUrl}/cg`;
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
        if (!controller.signal.aborted) setLatestNews((json.items || []).slice(0, 6));
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (attempt < 2) setTimeout(() => fetchNews(attempt + 1), 3000 * (attempt + 1));
      }
    };
    fetchNews();
    const interval = setInterval(() => fetchNews(), 15 * 60 * 1000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  // Fear & Greed index (alternative.me, CORS-open, daily value).
  const [fng, setFng] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.alternative.me/fng/?limit=1', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data?.[0]) setFng(j.data[0]); })
      .catch(() => { /* optional widget */ });
    return () => controller.abort();
  }, []);

  // Live prices for open trades
  const [livePrices, setLivePrices] = useState({});

  useEffect(() => {
    if (globalStats.openTrades.length === 0) return;
    let cancelled = false;

    // Bybit, not Binance — fapi.binance.com is geo-blocked from Israeli
    // browsers, which left every open position without a live price.
    // Stock positions are priced from the stock feed (keyed by ticker, the
    // same key the position cards look up), crypto from the perp feed.
    const fetchLivePrices = async () => {
      const isStock = (t) => t.assetClass === 'stocks';
      const pairs = [...new Set(globalStats.openTrades.filter((t) => !isStock(t)).map((t) => t.pair || t.symbol).filter(Boolean))];
      const tickers = [...new Set(globalStats.openTrades.filter(isStock).map((t) => t.pair || t.symbol).filter(Boolean))];
      try {
        const [perp, stocks] = await Promise.all([
          pairs.length ? fetchPerpPrices(pairs) : {},
          fetchStockQuotes(tickers),
        ]);
        const merged = { ...(perp || {}) };
        Object.entries(stocks).forEach(([sym, q]) => { if (q?.price > 0) merged[sym] = q.price; });
        if (!cancelled && Object.keys(merged).length) setLivePrices(merged);
      } catch (e) { console.error(e); }
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [globalStats.openTrades]);

  // Per-journal stats
  const journalStats = useMemo(() => {
    return journals.map((j) => {
      const jTrades = allTrades.filter((t) => t.journalId === j.id);
      const closed = jTrades.filter(isClosedTrade);
      const pnl = closed.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
      const wins = closed.filter((t) => t.result === 'win').length;
      const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
      // Live wallet when the exchange answered; else initial + P&L when a
      // starting balance was set; else unknown. (initial 0 + P&L used to show
      // the P&L itself as a negative "portfolio value".)
      const live = linkedBalances[j.id] != null;
      const balance = live
        ? linkedBalances[j.id]
        : j.initialBalance > 0 ? j.initialBalance + pnl : null;
      return {
        ...j, tradesCount: closed.length, pnl, winRate, balance, live,
        problem: linkedProblems[j.id] || null,
      };
    });
  }, [journals, allTrades, linkedBalances, linkedProblems]);

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

  // Equity series (oldest → newest, running total) and the latest closed trades.
  const { equitySeries, recentClosed } = useMemo(() => {
    const journalIds = new Set(journals.map((j) => j.id));
    const closed = allTrades
      .filter((t) => !t.journalId || journalIds.has(t.journalId))
      .filter(isClosedTrade);
    const pnlOf = (t) => (t.netPnl ?? t.pnl ?? 0);
    const tradeMs = (t) => {
      const d = t.exitDate || t.entryDate || t.createdAt;
      if (!d) return 0;
      if (typeof d?.toDate === 'function') return d.toDate().getTime();
      if (typeof d === 'number') return d;
      const ms = new Date(d).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };
    const sorted = [...closed].sort((a, b) => tradeMs(a) - tradeMs(b));
    let cum = 0;
    return {
      equitySeries: sorted.map((t) => { cum += pnlOf(t); return { t: tradeMs(t), pnl: pnlOf(t), value: cum }; }),
      recentClosed: sorted.slice(-5).reverse(),
    };
  }, [allTrades, journals]);

  // Win/loss split, per-session P&L, + performance score/radar.
  const { perf, kpi } = useMemo(() => {
    const journalIds = new Set(journals.map((j) => j.id));
    const closed = allTrades
      .filter((t) => !t.journalId || journalIds.has(t.journalId))
      .filter(isClosedTrade);
    const pnlOf = (t) => (t.netPnl ?? t.pnl ?? 0);
    const dateOf = (t) => {
      const d = t.exitDate || t.entryDate || t.createdAt;
      if (!d) return null;
      if (typeof d?.toDate === 'function') return d.toDate();
      const dt = new Date(d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    // Win/loss counts + P&L by trading session
    let wins = 0, losses = 0;
    const sessionMap = {};
    for (const t of closed) {
      const p = pnlOf(t);
      if (p > 0) wins++; else if (p < 0) losses++;
      if (t.session) sessionMap[t.session] = (sessionMap[t.session] || 0) + p;
    }
    const sessions = Object.entries(sessionMap)
      .map(([label, pnl]) => ({ label, pnl }))
      .sort((a, b) => b.pnl - a.pnl);

    // Performance metrics
    const grossProfit = closed.filter((t) => pnlOf(t) > 0).reduce((s, t) => s + pnlOf(t), 0);
    const grossLoss = Math.abs(closed.filter((t) => pnlOf(t) < 0).reduce((s, t) => s + pnlOf(t), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const largestWin = closed.reduce((m, t) => Math.max(m, pnlOf(t)), 0);

    // Max drawdown + recovery from the equity curve
    let cum = 0, peak = 0, maxDD = 0;
    for (const t of [...closed].sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0))) {
      cum += pnlOf(t);
      peak = Math.max(peak, cum);
      maxDD = Math.max(maxDD, peak - cum);
    }
    const netProfit = grossProfit - grossLoss;
    const recovery = maxDD > 0 ? netProfit / maxDD : (netProfit > 0 ? Infinity : 0);

    const clamp = (v) => Math.max(0, Math.min(100, v));
    const winRate = globalStats.winRate;                                  // already 0..100
    const pfScore = clamp((profitFactor / 2) * 100);                      // PF 2 → 100
    const rrScore = globalStats.avgRR != null ? clamp((globalStats.avgRR / 2) * 100) : 0; // R:R 2 → 100
    const consistency = grossProfit > 0 ? clamp(100 - (largestWin / grossProfit) * 100) : 0;
    const riskMgmt = peak > 0 ? clamp(100 - (maxDD / peak) * 100) : (closed.length ? 60 : 0);
    const recoveryScore = clamp((recovery / 3) * 100);                    // RF 3 → 100

    const metrics = [
      { label: 'אחוז הצלחה', value: winRate },
      { label: 'פקטור רווח', value: pfScore },
      { label: 'יחס סיכון/סיכוי', value: rrScore },
      { label: 'עקביות', value: consistency },
      { label: 'ניהול סיכון', value: riskMgmt },
      { label: 'התאוששות', value: recoveryScore },
    ];
    const score = metrics.reduce((s, mtr) => s + mtr.value, 0) / metrics.length;

    // KPI strip numbers
    const beCount = Math.max(0, closed.length - wins - losses);
    const avgWin = wins ? grossProfit / wins : 0;
    const avgLoss = losses ? -(grossLoss / losses) : 0;
    const ratio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? avgWin : 0);
    const netPnl = closed.reduce((s, t) => s + pnlOf(t), 0);

    // Win/loss streaks — current run + longest winning run, for trades and days
    const runStats = (bools) => {
      let cur = 0, curWin = true, best = 0, run = 0;
      for (let i = 0; i < bools.length; i++) { if (bools[i]) { run++; best = Math.max(best, run); } else run = 0; }
      for (let i = bools.length - 1; i >= 0; i--) {
        if (i === bools.length - 1) { curWin = bools[i]; cur = 1; }
        else if (bools[i] === curWin) cur++; else break;
      }
      return { current: cur, best, win: curWin };
    };
    const byDate = [...closed].sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0));
    const tradeBools = byDate.map((t) => pnlOf(t) >= 0);
    const dayMap = new Map();
    for (const t of closed) {
      const d = dateOf(t);
      if (!d) continue;
      const dk = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      dayMap.set(dk, (dayMap.get(dk) || 0) + pnlOf(t));
    }
    const dayBools = [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1] >= 0);
    const streakTrades = closed.length ? runStats(tradeBools) : { current: 0, best: 0, win: true };
    const streakDays = dayMap.size ? runStats(dayBools) : { current: 0, best: 0, win: true };

    const kpi = {
      netPnl, tradeCount: closed.length,
      winRate: (wins + losses + beCount) > 0 ? (wins / (wins + losses + beCount)) * 100 : 0,
      wins, breakeven: beCount, losses,
      avgWin, avgLoss, avgWinLossRatio: ratio,
      profitFactor,
      streakDays, streakTrades,
      lastResults: tradeBools.slice(-5),
    };

    return {
      perf: { metrics: closed.length ? metrics : [], score },
      winLoss: { wins, losses },
      sessionBars: sessions,
      kpi,
    };
  }, [allTrades, journals, globalStats.winRate, globalStats.avgRR]);

  if (loading) return <DashboardSkeleton />;

  const openJournal = (j) => { setActiveJournalId(j.id); navigate('/journal'); };
  const synced = Object.keys(linkedBalances || {}).length > 0;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={LineChart}
        title={greetingFor(profile?.displayName || user?.displayName)}
        subtitle={(
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {todayLabel()}
            {synced && (
              <span className="inline-flex items-center gap-1.5 text-profit font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-profit" style={{ boxShadow: '0 0 8px var(--color-profit)' }} />
                מסונכרן מהבורסה
              </span>
            )}
          </span>
        )}
        actions={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button type="button" onClick={toggleHide} aria-label={hideBalances ? 'הצגת סכומים' : 'הסתרת סכומים'} title={hideBalances ? 'הצגת סכומים' : 'הסתרת סכומים'}
              className="w-11 h-11 shrink-0 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary grid place-items-center cursor-pointer">
              {hideBalances ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
            <button type="button" onClick={() => navigate('/journal?new=1')}
              className="h-11 px-4 flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> עסקה חדשה
            </button>
          </div>
        )}
      />

      <PendingLimitOrders trades={globalStats.openTrades} livePrices={livePrices} />

      {/* First-steps checklist — renders only for fresh accounts. */}
      <GettingStartedCard trades={allTrades} journals={journals} morningCount={morningEntries.length} />

      <div className="space-y-4 mb-6">
        {/* The account (value + cumulative P&L) beside the AI read of it. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="lg:col-span-2 min-w-0">
            <PortfolioHero balance={globalStats.totalBalance} pnlPercent={globalStats.pnlPercent} series={equitySeries} hidden={hideBalances} />
          </div>
          <div className="min-w-0"><TradeAgentCard trades={allTrades} /></div>
        </div>

        <HomeKpis kpi={kpi} hidden={hideBalances} />

        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <RecentTradesCard trades={recentClosed} hidden={hideBalances} className="lg:col-span-2" />
            <ScoreCard metrics={perf.metrics} score={perf.score} />
          </div>
        </Reveal>

        <Reveal>
          <HomePanel title={`היומנים שלך (${journals.length})`} link="לכל היומנים" onLink={() => navigate('/journal')}>
            {journalStats.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {journalStats.slice(0, 3).map((j) => (
                    <JournalTile key={j.id} j={j} mask={m} onOpen={() => openJournal(j)} />
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
                          <JournalTile key={j.id} j={j} mask={m} onOpen={() => openJournal(j)} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {journalStats.length > 3 && (
                  <button
                    onClick={() => setShowAllJournals((v) => !v)}
                    className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-xs text-text-secondary hover:text-accent-primary transition-colors cursor-pointer"
                  >
                    <span>{showAllJournals ? 'הצג פחות' : `הצג עוד ${journalStats.length - 3} יומנים`}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showAllJournals ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-text-secondary">אין יומנים עדיין</p>
            )}
          </HomePanel>
        </Reveal>

        <Reveal>
          <QuickLinks
            backtests={backtests} backtestStats={backtestStats} plans={plans} activePlans={activePlans}
            dcaPlans={dcaPlans} todayMorning={todayMorning} todayEvening={todayEvening}
          />
        </Reveal>

        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <MarketCard market={globalMarket} fng={fng} />
            <HomePanel title="חדשות" link="לכל החדשות" onLink={() => navigate('/news')} className="lg:col-span-2">
              <NewsList items={latestNews} max={3} />
            </HomePanel>
          </div>
        </Reveal>
      </div>
    </motion.div>
  );
}
