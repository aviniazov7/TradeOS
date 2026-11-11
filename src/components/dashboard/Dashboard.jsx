import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Plus, ChevronDown, ChevronLeft } from 'lucide-react';
import './home.css';
import { useTrades } from '../../hooks/useTrades';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBacktests } from '../../hooks/useBacktests';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useDCA } from '../../hooks/useDCA';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useLinkedJournals } from '../../hooks/useLinkedExchangeBalance';
import { KEY_PROBLEM_TEXT } from '../../services/exchangeService';
import { isClosedTrade, safePnl, calculateWinRate, winRateOf, tradeRMultiple } from '../../utils/calculations';
import DashboardSkeleton from './DashboardSkeleton';
import OpenPositionsSummary from './OpenPositionsSummary';
import TradeAgentCard from './TradeAgentCard';
import GettingStartedCard from './GettingStartedCard';
import HomeNextStep, { HomeConnectNudge } from './HomeNextStep';
import PortfolioHero from './PortfolioHero';
import { HomePanel, HomeKpis, RecentTradesCard, ScoreCard, QuickLinks, MarketCard } from './HomeSections';
import { NewsList } from './NewsList';
import ExchangeLogo from '../shared/ExchangeLogo';
import Reveal from '../shared/Reveal';
import { formatCurrency } from '../../utils/formatters';
import { exchangeLabel, isUnsetExchange } from '../../utils/constants';
import { useDemoMode } from '../../hooks/useDemoMode';
import { overlayDemo } from '../../utils/demoData';
import { winLossRatio } from '../../utils/homeStats';
import { homeStage } from '../../utils/homeStage';
import { useExchangeConnected } from '../../hooks/useExchangeConnected';
import { reopenOnboarding } from '../../utils/onboardingGate';
import { accountTradeTime } from '../../utils/accountReturn';
import { declaredStartCapital } from '../../utils/portfolioPerformance';
import { fetchGlobalMarket } from '../../services/globalMarket';
import { fetchNewsFeed } from '../../services/newsService';
import { readSessionCache, writeSessionCache } from '../../utils/sessionCache';
import { pageVariants, pageTransition } from '../../utils/animations';


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
  const venue = !isUnsetExchange(j.exchange);
  if (j.problem) missingWhy = `${KEY_PROBLEM_TEXT[j.problem]} — עדכן בטאב בורסה`;
  else if (venue && exchangeLabel(j.exchange)) missingWhy = `אין כרגע שווי חי מ-${exchangeLabel(j.exchange)}`;
  else if (venue) missingWhy = 'אין כרגע שווי חי מהבורסה';
  const venueName = exchangeLabel(j.exchange);
  return (
    <button type="button" onClick={onOpen} className="journal-card">
      <span className="journal-card__head">
        <span className="journal-card__id">
          {venueName
            ? <ExchangeLogo exchange={j.exchange} size="w-5 h-5" />
            : <span className="journal-card__mark" aria-hidden>{String(j.name || 'י').trim().slice(0, 1)}</span>}
          <span style={{ minWidth: 0 }}>
            <span className="journal-card__name">{j.name}</span>
            <span className="journal-card__meta">{venueName || 'ללא חיבור'} · {j.tradesCount} עסקאות</span>
          </span>
        </span>
        <span className="journal-card__badges">
          {j.demo && <span className="chip chip--warning">דמו</span>}
          {j.balance !== null && (
            j.live ? (
              <span className="chip chip--profit" title="שווי חי מהבורסה"><span className="dot" />LIVE</span>
            ) : (
              <span className="chip chip--neutral" title="יתרה התחלתית + רווח/הפסד מהיומן"><span className="dot" />מחושב</span>
            )
          )}
        </span>
      </span>
      <span className="journal-card__value">
        <span>שווי התיק</span>
        {j.balance !== null ? (
          <strong className="journal-card__balance" dir="ltr">{mask(formatCurrency(j.balance).replace('+', ''))}</strong>
        ) : (
          <>
            <strong className="journal-card__balance">—</strong>
            <span className={j.problem ? 'loss' : ''}>{missingWhy}</span>
          </>
        )}
      </span>
      <span className="journal-card__foot">
        <span className={`num ${j.pnl > 0 ? 'profit' : j.pnl < 0 ? 'loss' : ''} ${pnlCls}`} dir="ltr">{mask(formatCurrency(j.pnl))}</span>
        <span>{j.winRate.toFixed(0)}% הצלחה</span>
        <ChevronLeft className="journal-chevron w-4 h-4" aria-hidden />
      </span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { journals, activeJournalId, setActiveJournalId, loading: journalsLoading = false } = useJournalContext();
  const demo = useDemoMode();
  const exchangeConnected = useExchangeConnected();
  const [showAllJournals, setShowAllJournals] = useState(false);
  const [hideBalances, setHideBalances] = useState(() => localStorage.getItem('tradeos_hideBalances') === 'true');

  const toggleHide = () => {
    setHideBalances((v) => {
      localStorage.setItem('tradeos_hideBalances', !v);
      return !v;
    });
  };
  const maskAmount = (val) => hideBalances ? '••••' : val;
  const { trades: realTrades, loading: tradesLoading } = useTrades(); // all trades, no journal filter
  const demoView = useMemo(() => overlayDemo({
    active: demo.active && !tradesLoading,
    trades: realTrades,
    journals,
    activeJournalId,
  }), [demo.active, tradesLoading, realTrades, journals, activeJournalId]);
  // Stats and the hero read the overlay while demo mode is on. The checklist
  // and the live-balance lookup stay on the real account.
  const allTrades = demoView.trades;
  const statJournals = demoView.journals;
  const { backtests: allBacktests, loading: backtestsLoading } = useBacktests();
  const backtests = useMemo(() => allBacktests.filter((b) => b.backtestJournalId), [allBacktests]);
  const { plans, loading: plansLoading } = useTradingPlans();
  const { dcaPlans, loading: dcaLoading } = useDCA();
  const { todayMorning, todayEvening, morningEntries, loading: mentalityLoading } = useMentalityJournals();

  // The hero waits on trades only. Backtests, plans, DCA and the mental
  // journals fill their own row when they arrive instead of holding the page.
  const loading = tradesLoading;
  const linksLoading = backtestsLoading || plansLoading || dcaLoading || mentalityLoading;

  // Live wallet balance for every journal that's linked to a connected exchange.
  const { balances: linkedBalances, problems: linkedProblems } = useLinkedJournals(journals);

  // Cross-journal trade stats (only trades belonging to existing journals)
  const globalStats = useMemo(() => {
    const journalIds = new Set(statJournals.map((j) => j.id));
    // Include trades with no journalId (legacy/imported before journal assignment) + trades belonging to current journals
    const relevantTrades = allTrades.filter((t) => !t.journalId || journalIds.has(t.journalId));
    const closed = relevantTrades.filter(isClosedTrade);
    const totalPnL = closed.reduce((s, t) => s + safePnl(t), 0);
    // The ONE win-rate definition (breakevens excluded) — same as the journal.
    const winRate = calculateWinRate(closed);
    // Portfolio VALUE, plus a capital base for the performance score's drawdown.
    // The hero's % is not this gap: a linked wallet minus closed P&L still
    // holds deposits and withdrawals, and (wallet − that base) / base treated
    // money moved out as a trading loss.
    let totalInitial = 0;
    let totalBalance = 0;
    for (const j of statJournals) {
      const jPnL = closed
        .filter((t) => t.journalId === j.id)
        .reduce((acc, t) => acc + safePnl(t), 0);
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

    // Average signed R — net P&L over the risk taken at ENTRY (original stop),
    // the same R the journal shows. Measuring against the current stop made a
    // trade trailed to breakeven drop out as "no stop" (or explode in R).
    const rs = closed.map(tradeRMultiple).filter((r) => r !== null);
    const avgRR = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : null;

    return { totalPnL, totalTrades: closed.length, winRate, totalBalance, totalInitial, avgRR };
  }, [allTrades, statJournals, linkedBalances]);

  // Global market data + latest news
  const [globalMarket, setGlobalMarket] = useState(() => readSessionCache('globalMarket', 5 * 60 * 1000));
  const [marketAt, setMarketAt] = useState(() => {
    try {
      const raw = sessionStorage.getItem('tradeos_cache:globalMarket');
      const parsed = raw ? JSON.parse(raw) : null;
      return typeof parsed?.at === 'number' ? parsed.at : null;
    } catch { return null; }
  });
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [marketFailed, setMarketFailed] = useState(false);
  // Bumped by the card's "נסה שוב" to run the load again from scratch.
  const [marketAttempt, setMarketAttempt] = useState(0);
  const retryMarket = useCallback(() => {
    setMarketFailed(false);
    setMarketRefreshing(true);
    setMarketAttempt((n) => n + 1);
  }, []);
  const [latestNews, setLatestNews] = useState(() => readSessionCache('latestNews', 15 * 60 * 1000) || []);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer;
    // CoinPaprika first, the worker's CoinGecko proxy as the fallback — see
    // services/globalMarket. After the last failed attempt the card shows an
    // error with a retry instead of "loading" forever.
    const fetchMarket = async (attempt = 0) => {
      try {
        const data = await fetchGlobalMarket({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setGlobalMarket(data);
          setMarketAt(Date.now());
          setMarketFailed(false);
          setMarketRefreshing(false);
          writeSessionCache('globalMarket', data);
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (attempt < 2) retryTimer = setTimeout(() => fetchMarket(attempt + 1), 3000 * (attempt + 1));
        else if (!controller.signal.aborted) {
          setMarketFailed(true);
          setMarketRefreshing(false);
        }
      }
    };
    fetchMarket();
    const interval = setInterval(() => fetchMarket(), 5 * 60 * 1000);
    return () => { controller.abort(); clearTimeout(retryTimer); clearInterval(interval); };
  }, [marketAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchNews = async (attempt = 0) => {
      try {
        const feed = await fetchNewsFeed('crypto', { signal: controller.signal });
        if (!controller.signal.aborted) {
          const items = feed.slice(0, 6);
          setLatestNews(items);
          writeSessionCache('latestNews', items);
        }
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
  const [fng, setFng] = useState(() => readSessionCache('fng', 60 * 60 * 1000));
  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.alternative.me/fng/?limit=1', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.[0]) {
          setFng(j.data[0]);
          writeSessionCache('fng', j.data[0]);
        }
      })
      .catch(() => { /* optional widget */ });
    return () => controller.abort();
  }, []);

  // Per-journal stats
  const journalStats = useMemo(() => {
    return statJournals.map((j) => {
      const jTrades = allTrades.filter((t) => t.journalId === j.id);
      const closed = jTrades.filter(isClosedTrade);
      const pnl = closed.reduce((s, t) => s + safePnl(t), 0);
      const winRate = calculateWinRate(closed);
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
  }, [statJournals, allTrades, linkedBalances, linkedProblems]);

  // Active plans
  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);

  // Backtest stats
  const backtestStats = useMemo(() => {
    if (!backtests.length) return null;
    const wins = backtests.filter((b) => b.result === 'win').length;
    const losses = backtests.filter((b) => b.result === 'loss').length;
    const winRate = winRateOf(wins, losses);
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
  const { equitySeries, recentClosed, heroTrades } = useMemo(() => {
    const journalIds = new Set(statJournals.map((j) => j.id));
    const closed = allTrades
      .filter((t) => !t.journalId || journalIds.has(t.journalId))
      .filter(isClosedTrade);
    const pnlOf = safePnl;
    const sorted = [...closed].sort((a, b) => accountTradeTime(a) - accountTradeTime(b)
      || String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
    const equitySeries = [];
    let running = 0;
    for (const trade of sorted) {
      const pnl = pnlOf(trade);
      running += pnl;
      equitySeries.push({ t: accountTradeTime(trade), pnl, value: running, id: trade.id });
    }
    return {
      equitySeries,
      recentClosed: sorted.slice(-5).reverse(),
      heroTrades: sorted,
    };
  }, [allTrades, statJournals]);

  // Win/loss split, per-session P&L, + performance score/radar.
  const { perf, kpi } = useMemo(() => {
    const journalIds = new Set(statJournals.map((j) => j.id));
    const closed = allTrades
      .filter((t) => !t.journalId || journalIds.has(t.journalId))
      .filter(isClosedTrade);
    const pnlOf = safePnl;
    const dateOf = (t) => {
      const d = t.exitDate || t.entryDate || t.createdAt;
      if (!d) return null;
      if (typeof d?.toDate === 'function') return d.toDate();
      const dt = new Date(d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    // Win/loss counts (by the stored result, like calculateWinRate) + P&L by
    // trading session
    let wins = 0, losses = 0;
    const sessionMap = {};
    for (const t of closed) {
      const p = pnlOf(t);
      if (t.result === 'win') wins++; else if (t.result === 'loss') losses++;
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
    // Drawdown as a % only against real capital (starting balance / live
    // wallet). On bare cumulative P&L, +10 then −9 would read as a 90%
    // drawdown — so without capital the score stays neutral instead.
    const capital = globalStats.totalInitial;
    const riskMgmt = capital > 0
      ? clamp(100 - (maxDD / (capital + peak)) * 100)
      : (closed.length ? 60 : 0);
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
    const posCount = closed.filter((t) => pnlOf(t) > 0).length;
    const negCount = closed.filter((t) => pnlOf(t) < 0).length;
    const avgWin = posCount ? grossProfit / posCount : 0;
    const avgLoss = negCount ? -(grossLoss / negCount) : 0;
    // null (shown as "—") until there is a loss — it used to fall back to the
    // average win itself, so one $200 win read as a ratio of 200.
    const ratio = winLossRatio(avgWin, avgLoss);
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
    // Breakevens neither extend nor break a streak (same rule as the journal's
    // current/max streak), so they are left out of the run instead of
    // counting as wins.
    const byDate = [...closed].sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0));
    const tradeBools = byDate
      .filter((t) => t.result === 'win' || t.result === 'loss')
      .map((t) => t.result === 'win');
    const dayMap = new Map();
    for (const t of closed) {
      const d = dateOf(t);
      if (!d) continue;
      const dk = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      dayMap.set(dk, (dayMap.get(dk) || 0) + pnlOf(t));
    }
    const dayBools = [...dayMap.entries()].sort((a, b) => a[0] - b[0]).filter((e) => e[1] !== 0).map((e) => e[1] > 0);
    const streakTrades = tradeBools.length ? runStats(tradeBools) : { current: 0, best: 0, win: true };
    const streakDays = dayBools.length ? runStats(dayBools) : { current: 0, best: 0, win: true };

    const kpi = {
      netPnl, tradeCount: closed.length,
      winRate: winRateOf(wins, losses),
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
  }, [allTrades, statJournals, globalStats.winRate, globalStats.avgRR, globalStats.totalInitial]);

  if (loading) return <DashboardSkeleton />;

  const openJournal = (j) => { setActiveJournalId(j.id); navigate('/journal'); };
  const synced = Object.keys(linkedBalances || {}).length > 0;
  const liveVenues = [...new Set(journalStats.filter((j) => j.live).map((j) => exchangeLabel(j.exchange)).filter(Boolean))];
  const syncText = synced ? `מסונכרן מהבורסה${liveVenues.length ? ` · ${liveVenues.join(' · ')}` : ''}` : '';
  // Unknown is not "disconnected": an empty book waits instead of flashing
  // the connect hero at someone whose exchange is already linked.
  const exchangePending = exchangeConnected === null && kpi.tradeCount === 0;
  const stage = homeStage({ closedTrades: kpi.tradeCount, exchangeConnected: exchangeConnected === true });
  const showBook = !exchangePending && (stage === 'active' || stage === 'manual');

  return (
    <m.div className="home-dash" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <header className="masthead">
        <div>
          <div className="eyebrow">
            {syncText && (
              <span className="eyebrow__sync"><span className="dot" aria-hidden />{syncText}</span>
            )}
            <span>{todayLabel()}</span>
          </div>
          <h1>{greetingFor(profile?.displayName || user?.displayName)}</h1>
          <p className="masthead__sub">התיק שלך במבט אחד — ומה שווה לבדוק עכשיו.</p>
        </div>
        <div className="masthead__actions">
          <button
            type="button"
            onClick={toggleHide}
            aria-pressed={hideBalances}
            aria-label={hideBalances ? 'הצגת סכומים' : 'הסתרת סכומים'}
            className="btn btn--secondary"
          >
            {hideBalances ? <Eye className="w-4 h-4" aria-hidden /> : <EyeOff className="w-4 h-4" aria-hidden />}
            {hideBalances ? 'הצג סכומים' : 'הסתר סכומים'}
          </button>
          <button type="button" onClick={() => navigate('/journal?new=1')} className="btn btn--primary">
            <Plus className="w-4 h-4" aria-hidden /> עסקה חדשה
          </button>
        </div>
      </header>

      {exchangePending && <div className="home-pending" />}

      {stage === 'awaiting' && <OpenPositionsSummary hidden={hideBalances} />}

      {!exchangePending && (stage === 'fresh' || stage === 'awaiting') && (
        <HomeNextStep
          stage={stage}
          showDemo={!demo.active && stage === 'fresh'}
          onDemo={demo.enter}
          showResume={profile?.onboardingCompleted === false}
          onResume={() => reopenOnboarding()}
        />
      )}

      {stage === 'manual' && exchangeConnected === false && <HomeConnectNudge />}

      {showBook && <OpenPositionsSummary hidden={hideBalances} />}

      {showBook && (
        <>
          <div className="split">
            <PortfolioHero
              balance={globalStats.totalBalance}
              declaredStart={declaredStartCapital(statJournals)}
              series={equitySeries}
              trades={heroTrades}
              hidden={hideBalances}
              journalCount={statJournals.length}
              onSetBalance={() => navigate('/journal?settings=1')}
            />
            <RecentTradesCard trades={recentClosed} hidden={hideBalances} />
          </div>

          <HomeKpis kpi={kpi} hidden={hideBalances} />

          <div className="split">
            <TradeAgentCard trades={allTrades} />
            <ScoreCard metrics={perf.metrics} score={perf.score} sampleSize={kpi.tradeCount} />
          </div>
        </>
      )}

      {showBook && (
        <Reveal>
          <HomePanel
            title={<>היומנים שלך <span className="panel__count">({statJournals.length})</span></>}
            link="לכל היומנים"
            onLink={() => navigate('/journal')}
            className="journals"
            titleId="journalsTitle"
          >
            {journalStats.length > 0 ? (
              <>
                <div className="journal-grid">
                  {journalStats.slice(0, 3).map((j) => (
                    <JournalTile key={j.id} j={j} mask={maskAmount} onOpen={() => openJournal(j)} />
                  ))}
                </div>
                <AnimatePresence initial={false}>
                  {showAllJournals && journalStats.length > 3 && (
                    <m.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="journal-grid journal-more">
                        {journalStats.slice(3).map((j) => (
                          <JournalTile key={j.id} j={j} mask={maskAmount} onOpen={() => openJournal(j)} />
                        ))}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
                {journalStats.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllJournals((v) => !v)}
                    className={`journal-toggle${showAllJournals ? ' is-open' : ''}`}
                    aria-expanded={showAllJournals}
                  >
                    <span>{showAllJournals ? 'הצג פחות' : `הצג עוד ${journalStats.length - 3} יומנים`}</span>
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </>
            ) : journalsLoading ? (
              <div className="journal-grid">
                {[0, 1].map((i) => <div key={i} className="home-pending" style={{ height: 120 }} />)}
              </div>
            ) : (
              <div className="journal-empty">
                <p>אין יומנים עדיין. יומן אחד מספיק כדי להתחיל לתעד.</p>
                <button type="button" onClick={() => navigate('/journal')} className="btn btn--outline">פתח יומן</button>
              </div>
            )}
          </HomePanel>
        </Reveal>
      )}

      {showBook && (
        <Reveal>
          <QuickLinks
            backtests={backtests} backtestStats={backtestStats} plans={plans} activePlans={activePlans}
            dcaPlans={dcaPlans} todayMorning={todayMorning} todayEvening={todayEvening}
            loading={linksLoading}
          />
        </Reveal>
      )}

      {showBook && <GettingStartedCard trades={realTrades} journals={journals} morningCount={morningEntries.length} />}

      <Reveal>
        <div className="split split--market">
          <MarketCard market={globalMarket} fng={fng} failed={marketFailed} onRetry={retryMarket} updatedAt={marketAt} refreshing={marketRefreshing} />
          <HomePanel title="חדשות" link="לכל החדשות" onLink={() => navigate('/news')} className="news" titleId="newsTitle">
            <NewsList items={latestNews} max={3} />
          </HomePanel>
        </div>
      </Reveal>
    </m.div>
  );
}
