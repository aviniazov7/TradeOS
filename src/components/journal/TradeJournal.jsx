import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { lazyWithChunkReload as lazy } from '../../utils/chunkReload';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { Plus, BookOpen, Settings, Undo2, BrainCircuit, ListChecks, Trash2, AlertTriangle, Sparkles, Briefcase, Loader2, Link2, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTrades } from '../../hooks/useTrades';
import { useDemoMode } from '../../hooks/useDemoMode';
import { overlayDemo, isDemoTrade } from '../../utils/demoData';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import { useJournalContext } from '../../contexts/JournalContext';
import { isClosedTrade, safePnl, localDayKey } from '../../utils/calculations';
import { balanceForTrade, buildAccountReturnBook } from '../../utils/accountReturn';
import { computeUnrealized, sortJournalTrades } from '../../utils/journalAnalytics';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useLinkedExchange } from '../../hooks/useLinkedExchangeBalance';
import { KEY_PROBLEM_TEXT } from '../../services/exchangeService';
import { useExchangeImport } from '../../hooks/useExchangeImport';
import JournalSwitcher from './JournalSwitcher';
import PageHeader from '../shared/PageHeader';
import StockMarketPanel from '../stocks/StockMarketPanel';
import PropFirmPanel from '../propfirm/PropFirmPanel';
import { useStockQuotes } from '../../hooks/useStockQuotes';
import { stockSymbol } from '../../utils/stocks';
import { headerPrimaryBtn, headerAiBtnDense, headerIconBtnDense, headerPlusBtnDense } from '../shared/headerStyles';
import { GUIDANCE_FEATURE_NAME } from '../../utils/guidanceName';
import { useAuth } from '../../contexts/AuthContext';
import JournalSummaryBar from './JournalSummaryBar';
import DailyLossBanner from './DailyLossBanner';
import JournalRiskBanner from './JournalRiskBanner';
import JournalRiskStatus from './JournalRiskStatus';
import TradeTable from './TradeTable';
import TradeFilters from './TradeFilters';
import TimePeriodFilter from '../dashboard/TimePeriodFilter';
import Modal from '../shared/Modal';
import SelectDropdown from '../shared/SelectDropdown';
import Card from '../shared/Card';
import ArchiveAnimation from './ArchiveAnimation';
import EmptyState from '../shared/EmptyState';
import ExchangeProposals from './ExchangeProposals';
import JournalSkeleton from './JournalSkeleton';
import JournalFormModal from './JournalFormModal';
import { downloadCsv } from '../../utils/csv';
import { journalCsvHeaders, journalCsvRow } from '../../utils/tradeExport';
import { TAG_LABELS } from '../../utils/constants';
import { tradeHasMistake } from '../../utils/tagMistakeStats';
import { tradeMatchesCustom } from '../../utils/customTradeFields';
import { useCustomTradeFields } from '../../hooks/useCustomTradeFields';
import { effectiveSetups, setupLabel } from '../../utils/setupStats';
import { pageVariants, pageTransition } from '../../utils/animations';
import { TRADE_PREFILL_KEY } from '../../utils/tradeFormHelpers';
import { evaluateJournalRisk } from '../../utils/journalRiskRules';
import {
  journalRiskBreachNotice,
  readRiskBreachDismissed,
  riskBreachDismissToken,
  writeRiskBreachDismissed,
} from '../../utils/journalRiskNotice';
import { CRYPTO_JOURNAL_TABS, OTHER_JOURNAL_TABS, resolveJournalTab } from '../../utils/journalTabs';

const TAB_LABELS = { trades: 'עסקאות', exchange: 'בורסה', analytics: 'אנליטיקה', calendar: 'יומן חודשי' };
// Phone row: short labels. Four tabs (crypto) or three (stocks/futures) sit on one row.
const TAB_MOBILE = { trades: 'עסקאות', exchange: 'בורסה', analytics: 'אנליטיקה', calendar: 'יומן' };
const defaultFilters = {
  search: '', direction: '', result: '', status: '', strategy: '', setup: '', tag: '', mistake: '',
  timeframe: '', month: '', from: '', to: '', customField: '', customValue: '', customLabel: '',
};
const defaultSort = { key: 'date', dir: 'desc' };
// Phone sort picker (desktop sorts by clicking column headers).
const SORT_OPTIONS = [
  { value: 'date:desc', label: 'חדשות קודם' },
  { value: 'date:asc', label: 'ישנות קודם' },
  { value: 'pnl:desc', label: 'רווח גבוה קודם' },
  { value: 'pnl:asc', label: 'הפסד גבוה קודם' },
  { value: 'r:desc', label: 'R גבוה קודם' },
  { value: 'r:asc', label: 'R נמוך קודם' },
  { value: 'pair:asc', label: 'זוג A–Z' },
  { value: 'pair:desc', label: 'זוג Z–A' },
];

const getCoinFromPair = (pair = '') => pair.replace(/USDT$|BUSD$|USDC$|USD$/, '').toUpperCase();
const entryDay = (t) => (t.entryDate ? localDayKey(t.entryDate) : '');

// Everything below is loaded on demand: the default trades view only needs the
// table. The form alone pulls in react-datepicker (~130 kB), and the analytics
// tab pulls in recharts (~414 kB).
const OpenPositionsTab = lazy(() => import('./OpenPositionsTab'));
const JournalAnalyticsTab = lazy(() => import('./JournalAnalyticsTab'));
const MonthlyCalendar = lazy(() => import('./MonthlyCalendar'));
// The trade form is the journal's main action — its chunk is preloaded once
// the journal is up (see below) so the first "עסקה חדשה" opens instantly.
const loadTradeForm = () => import('./TradeForm');
const TradeForm = lazy(loadTradeForm);
const AICoachPanel = lazy(() => import('./AICoachPanel'));
const ImportTrades = lazy(() => import('./ImportTrades'));
const JournalSettingsModal = lazy(() => import('./JournalSettingsModal'));
const JournalShareDialog = lazy(() => import('./JournalShareDialog'));
const TradeShareModal = lazy(() => import('./TradeShareModal'));

// Mount a lazy modal only once it is first opened (so its chunk isn't fetched
// on page load), then keep it mounted so its close animation still plays.
function useOpenedOnce(isOpen) {
  const [opened, setOpened] = useState(isOpen);
  if (isOpen && !opened) setOpened(true);
  return opened;
}

function TabFallback() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
      {[1, 2, 3, 4].map((i) => <div key={i} className="bg-bg-secondary border border-border-primary rounded-xl h-24 animate-pulse" />)}
    </div>
  );
}

export default function TradeJournal() {
  const { user } = useAuth();
  const { activeJournal, activeJournalId, journals, addJournal } = useJournalContext();
  const demoMode = useDemoMode();
  const {
    trades: realTrades, loading, addTrade, addTradesBulk, updateTrade, deleteTrade,
  } = useTrades(activeJournalId);
  const {
    fields: customFields, doc: customFieldsDoc, ready: customFieldsReady, saveDoc: saveCustomFields,
  } = useCustomTradeFields();
  const demoOverlay = useMemo(() => overlayDemo({
    active: demoMode.active && !loading,
    trades: realTrades,
    journals,
    activeJournalId,
  }), [demoMode.active, loading, realTrades, journals, activeJournalId]);
  const trades = demoOverlay.trades;
  const showingDemo = demoOverlay.active;
  const { prices } = useCryptoPrices();
  // Stock journals: live quotes for the tickers that are still open.
  const isStockJournal = activeJournal?.assetClass === 'stocks';
  const openStockSymbols = useMemo(
    () => trades.filter((t) => t.assetClass === 'stocks' && !isClosedTrade(t)).map((t) => t.pair),
    [trades],
  );
  const { quotes: stockQuotes } = useStockQuotes(openStockSymbols, { enabled: openStockSymbols.length > 0 });
  const livePriceOf = (trade) => (trade.assetClass === 'stocks'
    ? stockQuotes[stockSymbol(trade.pair)]?.price
    : prices[getCoinFromPair(trade.pair)]?.price);
  const isLimitPending = (trade) => {
    if (trade.orderType !== 'limit' || trade.exitPrice > 0) return false;
    if (trade.limitTriggered) return false; // triggered → active, not pending
    const currentPrice = livePriceOf(trade);
    if (!currentPrice || !trade.entryPrice) return true; // no price data → assume pending
    const entry = parseFloat(trade.entryPrice);
    return trade.direction === 'long' ? currentPrice > entry : currentPrice < entry;
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [tradePrefill, setTradePrefill] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState(new Set());
  const [riskHiddenToken, setRiskHiddenToken] = useState('');
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('tj_filters');
      if (!saved) return defaultFilters;
      const parsed = JSON.parse(saved);
      // Guard against corrupted/legacy payloads (arrays, primitives, null).
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultFilters;
      return { ...defaultFilters, ...parsed };
    } catch { return defaultFilters; }
  });
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tj_sort') || 'null');
      return saved && typeof saved.key === 'string' && (saved.dir === 'asc' || saved.dir === 'desc') ? saved : defaultSort;
    } catch { return defaultSort; }
  });
  // Bulk selection on the trades tab.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // The active tab lives in the URL (?tab=analytics) so a refresh keeps it and
  // the browser's back button steps between tabs. 'trades' is the bare URL.
  const tabParam = searchParams.get('tab');
  // The בורסה hub (connection + positions + orders) is crypto-only. Stock and
  // futures journals have no exchange sync. Old ?tab=positions links land here.
  const isCryptoJournal = (activeJournal?.assetClass || 'crypto') === 'crypto';
  const journalTabs = isCryptoJournal ? CRYPTO_JOURNAL_TABS : OTHER_JOURNAL_TABS;
  const tab = resolveJournalTab(tabParam, { crypto: isCryptoJournal });
  const setTab = (next) => {
    if (next === tab) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'trades') params.delete('tab');
      else params.set('tab', next);
      return params;
    });
  };
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Zero-journals recovery — the switcher (and its create button) is hidden
  // when no journal exists, so the empty state must offer creation itself.
  const [createJournalOpen, setCreateJournalOpen] = useState(false);
  const handleCreateJournal = async (data) => {
    try {
      await addJournal(data);
      toast.success('היומן נוצר');
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה ליצור יומן' : 'שגיאה ביצירת היומן — נסה שוב');
      // Rethrow so JournalFormModal's own catch keeps it OPEN — otherwise its
      // `await onSave(); onClose()` closes the modal and wipes the typed form
      // on a failed write.
      throw err;
    }
  };
  const [shareTarget, setShareTarget] = useState(null);
  const formMounted = useOpenedOnce(formOpen);
  // Warm the trade form's chunk once the journal is idle, so the first
  // "עסקה חדשה" doesn't wait on a network round-trip (it used to look like the
  // click did nothing). A failed preload is harmless: lazy() fetches again.
  useEffect(() => {
    const warm = () => { loadTradeForm().catch(() => {}); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(warm, 1500);
    return () => clearTimeout(t);
  }, []);
  const importMounted = useOpenedOnce(importOpen);
  const settingsMounted = useOpenedOnce(settingsOpen);
  const journalShareMounted = useOpenedOnce(shareOpen);
  const shareMounted = useOpenedOnce(!!shareTarget);
  // Render only a window of rows so the table stays fast with hundreds of trades.
  // Analytics/calendar still use the full `trades` array — this caps the DOM only.
  const [visibleCount, setVisibleCount] = useState(50);
  const [archiveAnimating, setArchiveAnimating] = useState(false);
  const [archiveTargetName, setArchiveTargetName] = useState('');
  const deleteTimersRef = useRef({});
  const deleteBatchRef = useRef(new Set());
  const deleteBatchTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Live ref to deleteTrade so the unmount/pagehide flush below always calls the
  // current version (its effect runs with [] deps and would otherwise capture a
  // stale closure).
  const deleteTradeRef = useRef(deleteTrade);
  deleteTradeRef.current = deleteTrade;

  // Helper: filter trades and jump to trades tab
  const filterAndJump = (partialFilter) => {
    setFilters(f => ({ ...f, ...partialFilter }));
    setTab('trades');
    // The page scrolls inside Layout's #app-scroll container, not the window.
    setTimeout(() => document.getElementById('app-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };
  const deleteBatchToastRef = useRef(null);

  // When leaving the page, COMMIT any deletes still inside the 5s undo window
  // instead of dropping them. Previously the timer was just cleared, so deleting
  // trades and then navigating away / reloading before the timer fired left them
  // un-deleted (they reappeared on reload). Firestore's local cache queues the
  // delete so it survives a reload and syncs when the SDK reconnects.
  useEffect(() => {
    mountedRef.current = true;
    const flushPendingDeletes = () => {
      const batch = deleteBatchRef.current;
      if (!batch || batch.size === 0) return;
      batch.forEach((id) => { deleteTradeRef.current(id).catch(() => {}); });
      deleteBatchRef.current = new Set();
      if (deleteBatchTimerRef.current) { clearTimeout(deleteBatchTimerRef.current); deleteBatchTimerRef.current = null; }
    };
    // pagehide covers hard reload / tab close (where React cleanup may not run).
    window.addEventListener('pagehide', flushPendingDeletes);
    return () => {
      mountedRef.current = false;
      Object.values(deleteTimersRef.current).forEach(clearTimeout);
      window.removeEventListener('pagehide', flushPendingDeletes);
      // Commit, don't cancel, any pending deletes (clears the batch timer too).
      flushPendingDeletes();
    };
  }, []);

  // Reset filters when switching journals — prevents stale filters from one journal
  // bleeding into another (e.g. filtering by strategy "SOW" that doesn't exist in Journal B).
  // Only on a REAL switch (one journal id → another): this effect also runs on
  // mount and when the journal list loads (null → id), and resetting there
  // wiped the filters just restored from localStorage ('tj_filters').
  const prevJournalIdRef = useRef(activeJournalId);
  useEffect(() => {
    const prev = prevJournalIdRef.current;
    prevJournalIdRef.current = activeJournalId;
    if (prev && activeJournalId && prev !== activeJournalId) setFilters(defaultFilters);
  }, [activeJournalId]);

  // Persist filters to localStorage
  useEffect(() => {
    try { localStorage.setItem('tj_filters', JSON.stringify(filters)); } catch { /* storage unavailable */ }
  }, [filters]);

  useEffect(() => {
    try { localStorage.setItem('tj_sort', JSON.stringify(sort)); } catch { /* storage unavailable */ }
  }, [sort]);

  // Reset the rendered window when the visible set changes
  useEffect(() => {
    setVisibleCount(50);
  }, [filters, sort, activeJournalId]);

  // A selection only makes sense for the list it was made on.
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [filters, activeJournalId, tab]);

  // When the journal is linked to a connected exchange, derive the starting
  // balance so the headline balance and the drawdown curve match the wallet:
  //   effectiveInitial = liveBalance − totalPnL(closed)
  // so stats.currentBalance = effectiveInitial + totalPnL = liveBalance.
  // Return % is not this number. It uses the saved opening balance, and the
  // live wallet only when that opening was never set.
  const { balance: liveExchangeBalance, keyProblem } = useLinkedExchange(activeJournal?.exchange);
  const balanceIsLive = liveExchangeBalance != null;
  // Must use the SAME closed-trade predicate as useDashboardStats (which counts
  // 'partial' rows too), otherwise effectiveInitial is calibrated against a
  // different PnL total than stats.totalPnL and the derived currentBalance
  // drifts away from the real wallet by exactly the partial rows' PnL.
  const totalClosedPnL = useMemo(
    () => trades.filter(isClosedTrade).reduce((s, t) => s + safePnl(t), 0),
    [trades]
  );
  const effectiveInitial = balanceIsLive
    ? Math.max(0, liveExchangeBalance - totalClosedPnL)
    : (activeJournal?.initialBalance || 0);
  // Return % does not use effectiveInitial. A saved opening wins; the live
  // wallet is only the fallback when that opening was never set. effectiveInitial
  // still calibrates the headline balance and the drawdown curve to the wallet.
  const openingBalance = Number(activeJournal?.initialBalance) || 0;
  const statsOptions = useMemo(() => ({
    openingBalance,
    fallbackBalance: balanceIsLive ? liveExchangeBalance : null,
  }), [openingBalance, balanceIsLive, liveExchangeBalance]);
  const stats = useDashboardStats(trades, effectiveInitial, period, statsOptions);
  // The headline balance always shows the true wallet when a live exchange is
  // linked — stats.currentBalance is period-scoped (initial + period PnL) and
  // only equals the wallet when period === 'all', so reading it directly would
  // make the headline swing whenever the user changes the period filter.
  const displayedCurrentBalance = balanceIsLive ? liveExchangeBalance : stats.currentBalance;
  // "% of portfolio" on the trade ticket. The account is the journal's opening
  // balance plus realized P&L (a linked exchange already reports that total).
  // A blank opening balance must NOT fall through to "current P&L" — that
  // made the percent a ratio of this trade to itself.
  // Return on the account is the balance BEFORE each trade: the saved opening
  // balance walked forward, or — when that was never set — a sane live wallet
  // minus closed P&L. A missing, zero, negative, or dust wallet (MEXC reports
  // ~1e-8 after a full withdrawal) is not a denominator. Those rows show "—"
  // and stay out of the header return. Today's wallet is not reused as the
  // denominator for every historical trade.
  const returnBook = useMemo(
    () => buildAccountReturnBook(trades, {
      openingBalance,
      fallbackBalance: balanceIsLive ? liveExchangeBalance : null,
    }),
    [trades, openingBalance, balanceIsLive, liveExchangeBalance],
  );
  const accountReturnMode = returnBook.mode !== 'position';
  const formBalanceKnown = balanceIsLive || openingBalance > 0;
  const formBalance = balanceIsLive
    ? liveExchangeBalance
    : (openingBalance > 0 ? openingBalance + totalClosedPnL : 0);

  // Import a single exchange-synced trade into the active journal. Shared by
  // the בורסה tab and the trades-tab proposal banner so both add trades
  // identically, upserting when any of the row's close-order ids is already
  // in the journal.
  const { importTrade: importExchangeTrade } = useExchangeImport(activeJournalId);

  useEffect(() => {
    const isNew = searchParams.get('new') === '1';
    // Deep-link from the dashboard "set opening balance" checklist step —
    // open journal settings (where the balance field lives) instead of just
    // landing on the journal, mirroring the ?new=1 → trade-form pattern.
    const isSettings = searchParams.get('settings') === '1';
    // Deep-link from the analyst page — it hands off to the full AI report.
    const isAi = searchParams.get('ai') === '1';
    if (!isNew && !isSettings && !isAi) return;
    if (isNew) {
      let seed = null;
      try {
        const raw = sessionStorage.getItem(TRADE_PREFILL_KEY);
        if (raw) seed = JSON.parse(raw);
      } catch { seed = null; }
      try { sessionStorage.removeItem(TRADE_PREFILL_KEY); } catch { /* private mode */ }
      setEditingTrade(null);
      setTradePrefill(seed);
      setFormOpen(true);
    }
    if (isSettings) setSettingsOpen(true);
    if (isAi) setAiModalOpen(true);
    // One-shot flags: strip them so switching tabs (which also writes the URL)
    // doesn't re-open the modal every time.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      ['new', 'settings', 'ai'].forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const filteredTrades = useMemo(() => {
    const getTime = (t) => {
      const raw = t.entryDate;
      if (!raw) return 0;
      const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const monthKey = (t) => {
      const raw = t.exitDate || t.entryDate;
      if (!raw) return '';
      const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const q = filters.search.trim().toLowerCase();
    // Search looks at the pair and at the trade's own words (strategy, notes,
    // entry reason, tags) — "breakout" finds every trade tagged or noted so.
    const matchesSearch = (t) => [
      t.pair, t.strategy, t.notes, t.entryReason,
      ...(Array.isArray(t.tags) ? t.tags.map((tag) => `${tag} ${TAG_LABELS[tag] || ''}`) : []),
      t.trigger,
      ...effectiveSetups(t).map((name) => `${name} ${setupLabel(name)}`),
    ].some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
    return trades.filter((t) => {
      if (pendingDeletes.has(t.id)) return false;
      if (q && !matchesSearch(t)) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.result && t.result !== filters.result) return false;
      if (filters.status === 'open' && isClosedTrade(t)) return false;
      if (filters.status === 'closed' && !isClosedTrade(t)) return false;
      if (filters.from || filters.to) {
        // Same date the table shows (entry date), compared as local YYYY-MM-DD.
        const day = entryDay(t);
        if (!day || (filters.from && day < filters.from) || (filters.to && day > filters.to)) return false;
      }
      if (filters.strategy && t.strategy !== filters.strategy) return false;
      if (filters.setup && !effectiveSetups(t).includes(filters.setup)) return false;
      if (filters.timeframe && (filters.timeframe === 'N/A' ? !!t.timeframe : t.timeframe !== filters.timeframe)) return false;
      if (filters.tag && !(Array.isArray(t.tags) ? t.tags : []).some((tag) => typeof tag === 'string' && tag.trim() === String(filters.tag).trim())) return false;
      if (filters.mistake && !tradeHasMistake(t, filters.mistake)) return false;
      if (filters.customField && !tradeMatchesCustom(t, filters.customField, filters.customValue)) return false;
      if (filters.month && monthKey(t) !== filters.month) return false;
      return true;
    }).sort((a, b) => getTime(b) - getTime(a));
  }, [trades, filters, pendingDeletes]);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  // Live P&L of every open position in view, from the same price feed the
  // limit-order check uses. Pending limits haven't filled, so they have none.
  const liveById = useMemo(() => {
    const map = {};
    filteredTrades.forEach((t) => {
      if (isClosedTrade(t) || isLimitPending(t)) return;
      const live = computeUnrealized(t, livePriceOf(t));
      if (live) map[t.id] = live;
    });
    return map;
  }, [filteredTrades, prices, stockQuotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedTrades = useMemo(() => sortJournalTrades(filteredTrades, sort, liveById), [filteredTrades, sort, liveById]);
  const changeSort = (key) => setSort((cur) => (
    cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'pair' ? 'asc' : 'desc' }
  ));

  const refuseDemoWrite = () => {
    toast('אלה נתוני דמו. צא ממצב הדמו כדי לערוך את היומן שלך.');
  };

  const openNewTrade = () => {
    if (showingDemo) demoMode.exit();
    setEditingTrade(null);
    setTradePrefill(null);
    setFormOpen(true);
  };

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingTrade(null);
    setTradePrefill(null);
  }, []);

  const handleSave = useCallback(async (data) => {
    // false keeps the ticket open. A resolved promise used to close it even
    // when the write failed or the demo refused the edit, dropping what was typed.
    if (showingDemo || isDemoTrade(editingTrade)) { refuseDemoWrite(); return false; }
    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, data);
        toast.success('העסקה עודכנה');
      } else {
        // Warn on duplicate: same pair + direction + entry price within 10 min
        const entryMs = data.entryDate instanceof Date ? data.entryDate.getTime() : new Date(data.entryDate).getTime();
        const isDuplicate = trades.some((t) => {
          if (t.pair !== data.pair || t.direction !== data.direction) return false;
          // Entry prices come from different sources (manual vs exchange) and
          // rarely match to the last decimal — exact === almost never fires, so
          // treat entries within 0.1% as the same price.
          const a = parseFloat(t.entryPrice), b = parseFloat(data.entryPrice);
          if (!(b > 0) || Math.abs(a - b) > Math.abs(b) * 0.001) return false;
          const tMs = t.entryDate?.toDate ? t.entryDate.toDate().getTime() : new Date(t.entryDate).getTime();
          return Math.abs(tMs - entryMs) < 10 * 60 * 1000;
        });
        if (isDuplicate) {
          toast('עסקה דומה כבר קיימת — בדוק שאין כפל', { icon: '⚠️', duration: 4000 });
        }
        await addTrade(data);
        toast.success('העסקה נוספה');
      }
    } catch (error) {
      console.error('Save trade failed:', error);
      const msg = error.code === 'permission-denied' ? 'אין הרשאה לשמור' : 'שגיאה בשמירת העסקה — נסה שוב';
      toast.error(msg);
      return false;
    }
    return true;
  }, [showingDemo, editingTrade, trades, updateTrade, addTrade]);

  const journalTrades = realTrades.filter((t) => !pendingDeletes.has(t.id));
  const riskEval = !showingDemo && activeJournal?.riskRules
    ? evaluateJournalRisk(journalTrades, activeJournal.riskRules, {
      journalId: activeJournalId,
      balance: activeJournal?.initialBalance,
    })
    : null;
  const riskNotice = journalRiskBreachNotice(riskEval);
  const riskDayKey = riskEval?.dayKey || '';
  const riskToken = riskDayKey
    ? riskBreachDismissToken(user?.uid, activeJournalId, riskDayKey)
    : '';
  const riskDismissed = Boolean(riskToken) && (
    riskHiddenToken === riskToken
    || readRiskBreachDismissed(localStorage, user?.uid, activeJournalId, riskDayKey)
  );
  const showRiskBreach = Boolean(riskNotice) && !riskDismissed;
  const dismissRiskBanner = useCallback(() => {
    if (!riskDayKey) return;
    writeRiskBreachDismissed(localStorage, user?.uid, activeJournalId, riskDayKey);
    setRiskHiddenToken(riskBreachDismissToken(user?.uid, activeJournalId, riskDayKey));
  }, [riskDayKey, user?.uid, activeJournalId]);

  const handleEdit = (trade) => {
    if (showingDemo || isDemoTrade(trade)) { refuseDemoWrite(); return; }
    setEditingTrade(trade);
    setFormOpen(true);
  };

  // Delete one or many trades behind a single 5-second "undo" toast.
  const handleDeleteWithUndo = (tradeOrTrades) => {
    const list = Array.isArray(tradeOrTrades) ? tradeOrTrades : [tradeOrTrades];
    if (!list.length) return;
    if (showingDemo || list.some(isDemoTrade)) { refuseDemoWrite(); return; }
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      list.forEach((t) => next.add(t.id));
      return next;
    });
    list.forEach((t) => deleteBatchRef.current.add(t.id));

    // Reset the batch timer so it starts fresh after each delete
    if (deleteBatchTimerRef.current) clearTimeout(deleteBatchTimerRef.current);

    // Update or create the single aggregated toast
    const count = deleteBatchRef.current.size;
    const label = count === 1 ? 'העסקה נמחקה' : `${count} עסקאות נמחקו`;

    const showToast = () => {
      const id = toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm">{label}</span>
            <button
              onClick={() => {
                const batch = new Set(deleteBatchRef.current);
                setPendingDeletes((prev) => {
                  const next = new Set(prev);
                  batch.forEach((id) => next.delete(id));
                  return next;
                });
                deleteBatchRef.current.clear();
                if (deleteBatchTimerRef.current) { clearTimeout(deleteBatchTimerRef.current); deleteBatchTimerRef.current = null; }
                toast.dismiss(t.id);
                deleteBatchToastRef.current = null;
              }}
              className="flex items-center gap-1 px-2 py-1 bg-accent-primary/20 text-accent-primary rounded text-xs font-medium hover:bg-accent-primary/30 transition-colors cursor-pointer"
            >
              <Undo2 className="w-3 h-3" /> ביטול
            </button>
          </div>
        ),
        { duration: 5000, style: { background: 'var(--color-bg-overlay)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' } },
      );
      deleteBatchToastRef.current = id;
    };

    if (deleteBatchToastRef.current) toast.dismiss(deleteBatchToastRef.current);
    showToast();

    const myTimer = setTimeout(() => {
      // Guard: if this timer was replaced by a newer one (or cleared by undo), bail out.
      if (deleteBatchTimerRef.current !== myTimer) return;
      const batch = new Set(deleteBatchRef.current);
      deleteBatchRef.current.clear();
      deleteBatchTimerRef.current = null;
      deleteBatchToastRef.current = null;
      if (batch.size === 0) return;
      batch.forEach((id) => {
        deleteTrade(id).catch(() => {
          if (mountedRef.current) toast.error('שגיאה במחיקת העסקה');
        });
      });
      if (!mountedRef.current) return;
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        batch.forEach((id) => next.delete(id));
        return next;
      });
    }, 5200);
    deleteBatchTimerRef.current = myTimer;
  };

  const toggleSelected = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const deleteSelected = () => {
    handleDeleteWithUndo(sortedTrades.filter((t) => selectedIds.has(t.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const exportCSV = () => {
    if (showingDemo) { refuseDemoWrite(); return; }
    if (!sortedTrades.length) return;
    // Columns/values live in utils/tradeExport (shared with the Excel export):
    // units per asset class, exits, gross + net P&L, fees, signed R, original
    // stop. downloadCsv writes a UTF-8 BOM (Excel renders Hebrew), escapes
    // cells, neutralises formula injection and keeps negative numbers numeric.
    const headers = journalCsvHeaders(customFields);
    downloadCsv(`trades_${localDayKey(new Date())}.csv`, headers, sortedTrades.map((trade) => journalCsvRow(trade, customFields)));
    toast.success('הקובץ הורד');
  };

  if (loading) return <JournalSkeleton />;

  if (!activeJournal && journals.length === 0) {
    // Recovery path, not just copy: the journal switcher is hidden in exactly
    // this state, so without an inline create button a user who archived or
    // deleted every journal has NO way back in (new users can also land here
    // if the default-journal migration hasn't run yet).
    return (
      <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
        <EmptyState
          icon={BookOpen}
          title="אין יומן פעיל"
          description="צור יומן חדש כדי להתחיל לתעד עסקאות."
          actionLabel="צור יומן חדש"
          onAction={() => setCreateJournalOpen(true)}
        />
        <JournalFormModal
          isOpen={createJournalOpen}
          onClose={() => setCreateJournalOpen(false)}
          onSave={handleCreateJournal}
        />
        <ArchiveAnimation
          isOpen={archiveAnimating}
          journalName={archiveTargetName}
          onComplete={() => setArchiveAnimating(false)}
        />
      </m.div>
    );
  }

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* The shared page header: the journal's name (switcher) under the title,
          its views as tabs, and the two actions. */}
      <PageHeader
        icon={isStockJournal ? Briefcase : BookOpen}
        title={isStockJournal ? 'יומן מניות' : 'יומן המסחר'}
        titleAside={<JournalSwitcher compact />}
        center={tab === 'trades' && filteredTrades.length > 0
          ? <JournalSummaryBar trades={filteredTrades} filtered={hasActiveFilters} liveById={liveById} returnBook={returnBook} />
          : null}
        compactMobile
        tabs={{
          tabs: journalTabs.map((id) => ({ id, label: TAB_LABELS[id], mobileLabel: TAB_MOBILE[id], count: id === 'trades' ? trades.length : 0 })),
          value: tab,
          onChange: setTab,
          layoutKey: 'journal-tab',
        }}
        tabsLead={tab === 'analytics' ? <TimePeriodFilter value={period} onChange={setPeriod} /> : null}
        actions={(
          <div className="flex items-center gap-1.5 md:gap-2">
            <button onClick={() => { if (showingDemo) toast('הניתוח הוא על נתוני הדמו, לא על החשבון שלך'); setAiModalOpen(true); }} className={`${headerAiBtnDense} !w-auto px-2.5 md:px-3.5`} title={GUIDANCE_FEATURE_NAME} aria-label={GUIDANCE_FEATURE_NAME} data-testid="guidance-feature-button">
              <Sparkles className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              <span>{GUIDANCE_FEATURE_NAME}</span>
            </button>
            <button onClick={() => setSettingsOpen(true)} className={headerIconBtnDense} title="הגדרות יומן" aria-label="הגדרות יומן">
              <Settings className="w-4 h-4 md:w-[18px] md:h-[18px]" />
            </button>
            <button type="button" onClick={openNewTrade} className={headerPlusBtnDense} aria-label="עסקה חדשה" title="עסקה חדשה">
              <Plus className="w-4 h-4" />
            </button>
            <span className="hidden md:inline-flex">
              <button type="button" onClick={openNewTrade} className={headerPrimaryBtn}>
                <Plus className="w-4 h-4" /> עסקה חדשה
              </button>
            </span>
          </div>
        )}
      />

      {!showingDemo && (
        <>
          <JournalRiskStatus
            rules={activeJournal?.riskRules}
            trades={journalTrades}
            journalId={activeJournalId}
            balance={activeJournal?.initialBalance}
          />
          {showRiskBreach && (
            <JournalRiskBanner notice={riskNotice} onDismiss={dismissRiskBanner} />
          )}
          <DailyLossBanner
            alert={activeJournal?.dailyLossAlert}
            trades={journalTrades}
            journalId={activeJournalId}
          />
        </>
      )}

      {tab === 'trades' && (
        <>
          {isStockJournal && <StockMarketPanel trades={trades} quotes={stockQuotes} />}
          {activeJournal?.propFirm?.enabled && (
            <PropFirmPanel propFirm={activeJournal.propFirm} trades={trades} onEdit={() => setSettingsOpen(true)} />
          )}
          {/* The linked exchange's API key stopped working (e.g. a MEXC key
              expired after 90 days) — sync and the live balance silently
              stop, so say it here with a one-click way to fix it. */}
          {activeJournal?.exchange && keyProblem && (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3 md:px-4 py-2.5">
              <p className="text-sm text-loss font-semibold inline-flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">החיבור ל-{activeJournal.exchange.toUpperCase()} הפסיק לעבוד: {KEY_PROBLEM_TEXT[keyProblem]}</span>
              </p>
              <button type="button" onClick={() => setTab('exchange')}
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 transition-colors cursor-pointer shrink-0">
                לתיקון החיבור
              </button>
            </div>
          )}
          {activeJournal?.exchange && (
            <ExchangeProposals
              exchange={activeJournal.exchange}
              trades={trades}
              onImportTrade={importExchangeTrade}
              enabled={balanceIsLive}
            />
          )}
          {trades.length > 0 && <TradeFilters filters={filters} onChange={setFilters} trades={trades} />}

          {filteredTrades.length === 0 && !loading ? (
            trades.length === 0 ? (
              <EmptyState
                icon={isCryptoJournal ? Link2 : BookOpen}
                title="אין עסקאות עדיין"
                description={isCryptoJournal
                  ? 'חבר בורסה והעסקאות ייכנסו לבד — או תעד ידנית, או סייר עם נתוני דמו.'
                  : 'התחל לתעד את העסקאות שלך למעקב ביצועים'}
                action={isCryptoJournal ? (
                  <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                    <button type="button" onClick={() => setTab('exchange')}
                      className="w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold cursor-pointer">
                      <Link2 className="w-4 h-4" /> חיבור בורסה
                    </button>
                    <button type="button" onClick={openNewTrade}
                      className="w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-hover text-text-primary text-sm font-bold hover:bg-bg-tertiary cursor-pointer">
                      <Plus className="w-4 h-4" /> עסקה ראשונה
                    </button>
                    {!demoMode.active && (
                      <button type="button" onClick={() => { demoMode.enter(); }}
                        className="h-8 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary cursor-pointer">
                        <FlaskConical className="w-3.5 h-3.5" /> סייר עם נתוני דמו
                      </button>
                    )}
                  </div>
                ) : undefined}
                actionLabel={isCryptoJournal ? undefined : 'הוסף את העסקה הראשונה'}
                onAction={isCryptoJournal ? undefined : openNewTrade}
              />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="אין עסקאות תואמות"
                description="נסה לשנות את הפילטרים"
                actionLabel="נקה פילטרים"
                onAction={() => setFilters(defaultFilters)}
              />
            )
          ) : (
            <>
              {/* List toolbar: sort (phones — desktop sorts by clicking a column
                  header) and the bulk-selection toggle. */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="md:hidden min-w-0">
                  <SelectDropdown compact value={`${sort.key}:${sort.dir}`} options={SORT_OPTIONS}
                    onChange={(v) => { const [key, dir] = (v || 'date:desc').split(':'); setSort({ key, dir }); }} />
                </div>
                <span className="hidden md:inline text-[11px] text-text-muted">לחץ על כותרת עמודה כדי למיין</span>
                <button
                  type="button"
                  onClick={() => { setSelectMode((m) => !m); setSelectedIds(new Set()); }}
                  className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
                    selectMode ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'text-text-muted border-border-primary hover:text-text-primary hover:border-border-hover'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  {selectMode ? 'סיום בחירה' : 'בחירה מרובה'}
                </button>
              </div>

              <TradeTable
                trades={sortedTrades.slice(0, visibleCount)}
                allTrades={sortedTrades}
                liveById={liveById}
                sort={sort}
                onSortChange={changeSort}
                showMonths={sort.key === 'date'}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
                onEdit={handleEdit}
                onDelete={handleDeleteWithUndo}
                onShare={setShareTarget}
                customFields={customFields}
                isLimitPending={isLimitPending}
                returnBook={returnBook}
              />
              {sortedTrades.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount((c) => c + 50)}
                  className="mt-3 w-full py-2.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:bg-border-hover transition-colors cursor-pointer text-sm"
                >
                  טען עוד ({sortedTrades.length - visibleCount})
                </button>
              )}

              {/* Bulk action bar — sticks to the bottom of the scroll area,
                  above the phone tab bar. Solid fill so rows don't show through. */}
              {selectMode && (
                <div className="sticky bottom-24 lg:bottom-4 z-20 mt-3">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border-primary px-3 md:px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                    style={{ background: 'var(--modal-header-solid)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">
                        {selectedIds.size ? `נבחרו ${selectedIds.size} עסקאות` : 'סמן עסקאות ברשימה'}
                      </p>
                      <button type="button"
                        onClick={() => setSelectedIds(selectedIds.size === sortedTrades.length ? new Set() : new Set(sortedTrades.map((t) => t.id)))}
                        className="text-[11px] text-accent-primary hover:underline cursor-pointer">
                        {selectedIds.size === sortedTrades.length ? 'נקה בחירה' : `בחר את כל ${sortedTrades.length}`}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                        className="h-9 px-3 rounded-lg border border-border-primary text-xs text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer">
                        ביטול
                      </button>
                      <button type="button" onClick={deleteSelected} disabled={!selectedIds.size}
                        className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                        <Trash2 className="w-3.5 h-3.5" />
                        מחק{selectedIds.size ? ` (${selectedIds.size})` : ''}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'exchange' && (
        <Suspense fallback={<TabFallback />}>
          <OpenPositionsTab />
        </Suspense>
      )}

      {tab === 'analytics' && (
        <Suspense fallback={<TabFallback />}>
          <JournalAnalyticsTab
            trades={trades}
            period={period}
            onPeriodChange={setPeriod}
            stats={stats}
            activeJournal={activeJournal}
            balanceIsLive={balanceIsLive}
            displayedCurrentBalance={displayedCurrentBalance}
            onFilterJump={filterAndJump}
            customFields={customFields}
            onAddFirstTrade={() => { setTab('trades'); setFormOpen(true); }}
          />
        </Suspense>
      )}

      {tab === 'calendar' && (
        <Suspense fallback={<TabFallback />}>
          <MonthlyCalendar trades={trades} journalName={activeJournal?.name} />
        </Suspense>
      )}

      <Modal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        maxWidth="max-w-2xl"
        title={(
          <span className="inline-flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" style={{ stroke: 'url(#ai-grad)' }} />
            <span className="text-gradient font-bold">{GUIDANCE_FEATURE_NAME}</span>
          </span>
        )}
      >
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-bg-tertiary" />}>
          <AICoachPanel trades={trades} />
        </Suspense>
      </Modal>

      {/* Lazy modals, each in its own boundary so one loading (e.g. import,
          opened from inside settings) never blanks another that is open.
          fallback={null}: the Modal draws its own backdrop once loaded. */}
      {/* While the form's chunk is still loading (first open on a slow
          connection) show a spinner, so the click visibly did something. */}
      <Suspense fallback={(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" role="status" aria-label="פותח טופס עסקה">
          <Loader2 className="w-7 h-7 animate-spin text-accent-primary" />
        </div>
      )}>
        {formMounted && (
          <TradeForm isOpen={formOpen} onClose={handleCloseForm} trade={editingTrade} onSave={handleSave}
            prefill={tradePrefill}
            breachWarning={showRiskBreach && !editingTrade ? riskNotice.summary : null}
            onDismissBreach={dismissRiskBanner}
            riskSettings={{ riskType: activeJournal?.riskType, riskValue: activeJournal?.riskValue, currentBalance: formBalance, balanceKnown: formBalanceKnown }}
            accountBalance={editingTrade ? balanceForTrade(returnBook, editingTrade) : (accountReturnMode ? returnBook.current : 0)}
            strictAccount={accountReturnMode}
            journalAssetClass={activeJournal?.assetClass || 'crypto'}
            customFields={customFields}
            customFieldsReady={customFieldsReady}
            customFieldsDoc={customFieldsDoc}
            onSaveCustomFields={saveCustomFields}
            livePrices={prices} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {importMounted && (
          <ImportTrades isOpen={importOpen} onClose={() => setImportOpen(false)} onImport={addTrade} onImportBulk={addTradesBulk}
            assetClass={activeJournal?.assetClass || 'crypto'} existingTrades={trades} customFields={customFields} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {settingsMounted && (
          <JournalSettingsModal
            isOpen={settingsOpen}
            demoActive={showingDemo}
            onClose={() => setSettingsOpen(false)}
            onArchive={(name) => { setArchiveTargetName(name); setArchiveAnimating(true); }}
            onImport={() => setImportOpen(true)}
            onExport={exportCSV}
            canExport={trades.length > 0}
            onShare={() => {
              if (showingDemo) {
                toast('במצב דמו אי אפשר לשתף. כבו את הדמו כדי לשתף את היומן האמיתי.');
                return;
              }
              setSettingsOpen(false);
              setShareOpen(true);
            }}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {journalShareMounted && (
          <JournalShareDialog
            isOpen={shareOpen}
            onClose={() => setShareOpen(false)}
            journal={activeJournal}
            trades={realTrades.filter((trade) => !pendingDeletes.has(trade.id))}
            ownerEmail={user?.email || ''}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {shareMounted && (
          <TradeShareModal
            isOpen={!!shareTarget}
            onClose={() => setShareTarget(null)}
            trade={shareTarget}
            accountBalance={balanceForTrade(returnBook, shareTarget)}
            strictAccount={accountReturnMode}
          />
        )}
      </Suspense>

      <ArchiveAnimation
        isOpen={archiveAnimating}
        journalName={archiveTargetName}
        onComplete={() => setArchiveAnimating(false)}
      />
    </m.div>
  );
}
