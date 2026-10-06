import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, BookOpen, Settings, Undo2, BrainCircuit, ListChecks, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTrades } from '../../hooks/useTrades';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import { useJournalContext } from '../../contexts/JournalContext';
import { calculatePnL, calculateFuturesPnL, isClosedTrade, safePnl, localDayKey } from '../../utils/calculations';
import { computeUnrealized, sortJournalTrades } from '../../utils/journalAnalytics';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useLinkedExchangeBalance } from '../../hooks/useLinkedExchangeBalance';
import { useExchangeImport } from '../../hooks/useExchangeImport';
import JournalSwitcher from './JournalSwitcher';
import JournalTabs from './JournalTabs';
import JournalSummaryBar from './JournalSummaryBar';
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
import { formatDate } from '../../utils/formatters';
import { TAG_LABELS } from '../../utils/constants';
import { pageVariants, pageTransition } from '../../utils/animations';

const JOURNAL_TABS = ['trades', 'analytics', 'calendar', 'exchange'];
const defaultFilters = { search: '', direction: '', result: '', status: '', strategy: '', tag: '', timeframe: '', month: '', from: '', to: '' };
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
const JournalAnalyticsTab = lazy(() => import('./JournalAnalyticsTab'));
const MonthlyCalendar = lazy(() => import('./MonthlyCalendar'));
const ExchangeSettings = lazy(() => import('../exchange/ExchangeSettings'));
const TradeForm = lazy(() => import('./TradeForm'));
const AICoachPanel = lazy(() => import('./AICoachPanel'));
const ImportTrades = lazy(() => import('./ImportTrades'));
const JournalSettingsModal = lazy(() => import('./JournalSettingsModal'));
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
  const { activeJournal, activeJournalId, journals, addJournal } = useJournalContext();
  const { trades, loading, addTrade, addTradesBulk, updateTrade, deleteTrade } = useTrades(activeJournalId);
  const { prices } = useCryptoPrices();
  const livePriceOf = (trade) => prices[getCoinFromPair(trade.pair)]?.price;
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
  const [pendingDeletes, setPendingDeletes] = useState(new Set());
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
  const tab = JOURNAL_TABS.includes(tabParam) ? tabParam : 'trades';
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
  const importMounted = useOpenedOnce(importOpen);
  const settingsMounted = useOpenedOnce(settingsOpen);
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
  // bleeding into another (e.g. filtering by strategy "SOW" that doesn't exist in Journal B)
  useEffect(() => {
    setFilters(defaultFilters);
  }, [activeJournalId]);

  // Persist filters to localStorage
  useEffect(() => {
    try { localStorage.setItem('tj_filters', JSON.stringify(filters)); } catch {}
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
  // balance so currentBalance + every percentage-based stat (drawdown,
  // Recovery, Sortino, Calmar, Sharpe…) is calibrated to the real wallet:
  //   effectiveInitial = liveBalance − totalPnL(closed)
  // so stats.currentBalance = effectiveInitial + totalPnL = liveBalance.
  const liveExchangeBalance = useLinkedExchangeBalance(activeJournal?.exchange);
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
  const stats = useDashboardStats(trades, effectiveInitial, period);
  // The headline balance always shows the true wallet when a live exchange is
  // linked — stats.currentBalance is period-scoped (initial + period PnL) and
  // only equals the wallet when period === 'all', so reading it directly would
  // make the headline swing whenever the user changes the period filter.
  const displayedCurrentBalance = balanceIsLive ? liveExchangeBalance : stats.currentBalance;

  // Import a single exchange-synced trade into the active journal. Shared by
  // the exchange tab (ExchangeSettings) and the trades-tab proposal banner
  // (ExchangeProposals) so both add trades identically, upserting when any of
  // the row's close-order ids is already in the journal.
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
    if (isNew) setFormOpen(true);
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
    const matchesSearch = (t) => [t.pair, t.strategy, t.notes, t.entryReason, ...(Array.isArray(t.tags) ? t.tags.map((tag) => `${tag} ${TAG_LABELS[tag] || ''}`) : [])]
      .some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
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
      if (filters.timeframe && (filters.timeframe === 'N/A' ? !!t.timeframe : t.timeframe !== filters.timeframe)) return false;
      if (filters.tag && !(Array.isArray(t.tags) ? t.tags : []).includes(filters.tag)) return false;
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
  }, [filteredTrades, prices]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedTrades = useMemo(() => sortJournalTrades(filteredTrades, sort, liveById), [filteredTrades, sort, liveById]);
  const changeSort = (key) => setSort((cur) => (
    cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'pair' ? 'asc' : 'desc' }
  ));

  const handleSave = async (data) => {
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
      // Confetti on winning closed trade. Mirror how PnL is actually computed
      // so the celebration is correct for exchange-imported and CME-futures
      // trades too, not just plain crypto (price × qty).
      if (data.exitPrice > 0) {
        const pnl = data.pnlFromExchange != null
          ? data.pnlFromExchange
          : data.contract?.pointValue
            ? calculateFuturesPnL(data.direction, data.entryPrice, data.exitPrice, data.contract.pointValue, data.contract.contracts)
            : calculatePnL(data.direction, data.entryPrice, data.exitPrice, data.quantity);
        if (pnl > 0) {
          import('canvas-confetti').then(({ default: confetti }) => {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors: ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#38bdf8'] });
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Save trade failed:', error);
      const msg = error.code === 'permission-denied' ? 'אין הרשאה לשמור' : 'שגיאה בשמירת העסקה — נסה שוב';
      toast.error(msg);
    }
  };

  const handleEdit = (trade) => {
    setEditingTrade(trade);
    setFormOpen(true);
  };

  // Delete one or many trades behind a single 5-second "undo" toast.
  const handleDeleteWithUndo = (tradeOrTrades) => {
    const list = Array.isArray(tradeOrTrades) ? tradeOrTrades : [tradeOrTrades];
    if (!list.length) return;
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

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingTrade(null);
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
    if (!sortedTrades.length) return;
    // Escape a CSV cell: quote when it contains a comma/quote/newline, and
    // neutralize spreadsheet formula injection on a leading =,+,-,@.
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const toDate = (raw) => (raw ? (raw.toDate ? raw.toDate() : new Date(raw)) : null);
    const headers = ['תאריך', 'תאריך סגירה', 'זוג', 'כיוון', 'כניסה', 'סגירה', 'סטופ לוס', 'גודל עסקה', 'מינוף', 'עמלות', 'רווח/הפסד', '%', 'R:R', 'אסטרטגיה', 'טווח זמן', 'סטטוס', 'סיבת כניסה', 'הערות', 'תגיות', 'רגש לפני', 'רגש אחרי', 'טעויות', 'ביטחון'];
    const rows = sortedTrades.map((t) => {
      const d = toDate(t.entryDate) || new Date();
      const xd = toDate(t.exitDate);
      const pnl = t.netPnl ?? t.pnl ?? 0;
      const pnlPct = t.pnlPercent != null
        ? t.pnlPercent
        : (t.entryPrice > 0 && t.quantity > 0 ? (pnl / (t.entryPrice * t.quantity)) * 100 * (t.leverage || 1) : 0);
      const tags = Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || '');
      const mistakes = Array.isArray(t.mistakes) ? t.mistakes.join(' ') : (t.mistakes || '');
      return [
        formatDate(d), xd ? formatDate(xd) : '', t.pair, t.direction, t.entryPrice, t.exitPrice,
        t.stopLoss, t.positionSize, t.leverage, t.fees, pnl.toFixed(2),
        (isNaN(pnlPct) ? 0 : pnlPct).toFixed(2), ((pnl < 0 ? -1 : 1) * Math.abs(t.rrRatio ?? 0)).toFixed(2), t.strategy || '',
        t.timeframe || '', t.status === 'partial' ? 'חלקית' : (isClosedTrade(t) ? 'סגורה' : 'פתוחה'),
        t.entryReason || '', t.notes || '', tags, t.emotionBefore || '', t.emotionAfter || '', mistakes, t.confidenceRating ?? '',
      ];
    });
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  };

  if (loading) return <JournalSkeleton />;

  if (!activeJournal && journals.length === 0) {
    // Recovery path, not just copy: the journal switcher is hidden in exactly
    // this state, so without an inline create button a user who archived or
    // deleted every journal has NO way back in (new users can also land here
    // if the default-journal migration hasn't run yet).
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
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
      </motion.div>
    );
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Top Navigation Bar. backdrop-filter is force-disabled here: this panel
          sits at the very top of the scroll content with nothing behind it to
          frost, and as a raised (z-10) translucent blur layer it rendered as a
          faint "glass band" that flashed whenever a hover re-rasterized the
          layer (e.g. hovering the period-filter pills). The bg-bg-secondary
          fill is kept, so it looks identical in both themes. */}
      <Card className="mb-4 px-3 md:px-4 py-2.5 space-y-2 relative z-10" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
        {/* Row 1: Journal switcher + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 md:gap-3 min-w-0">
            <JournalSwitcher compact />
            <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
            <div className="hidden md:block">
              <JournalTabs tabs={JOURNAL_TABS} value={tab} onChange={setTab} tradesCount={trades.length} />
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {tab === 'analytics' && <div className="hidden md:block"><TimePeriodFilter value={period} onChange={setPeriod} compact /></div>}
            {/* Mobile: period filter sits up here next to the actions (dropdown
                is compact) instead of taking its own row under the tabs. */}
            {tab === 'analytics' && <div className="md:hidden"><TimePeriodFilter value={period} onChange={setPeriod} dropdown /></div>}
            <button onClick={() => setSettingsOpen(true)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="הגדרות יומן">
              <Settings className="w-4 h-4" />
            </button>
            {/* Accent-colored so it stands out (like the old filled button),
                but no solid fill — just accent text + a subtle accent border,
                with a light accent tint only on hover. */}
            <button onClick={() => setFormOpen(true)} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-accent-primary border border-accent-primary/40 hover:bg-accent-primary/10 transition-colors cursor-pointer text-sm font-semibold">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">עסקה חדשה</span>
            </button>
          </div>
        </div>

        {/* Row 2: Mobile tabs (scroll horizontally so they never compress each
            other). The period filter lives up in Row 1's action group. */}
        <div className="md:hidden">
          <JournalTabs tabs={JOURNAL_TABS} value={tab} onChange={setTab} tradesCount={trades.length} variant="mobile" />
        </div>
      </Card>

      {tab === 'trades' && (
        <>
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
                icon={BookOpen}
                title="אין עסקאות עדיין"
                description="התחל לתעד את העסקאות שלך למעקב ביצועים"
                actionLabel="הוסף את העסקה הראשונה"
                onAction={() => setFormOpen(true)}
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
              <JournalSummaryBar trades={filteredTrades} filtered={hasActiveFilters} liveById={liveById} />

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
                isLimitPending={isLimitPending}
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
            onOpenAI={() => setAiModalOpen(true)}
            onFilterJump={filterAndJump}
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
            <span className="text-gradient font-bold">ניתוח AI</span>
          </span>
        )}
      >
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-bg-tertiary" />}>
          <AICoachPanel trades={trades} />
        </Suspense>
      </Modal>

      {tab === 'exchange' && (
        <div className="mt-2">
          <Suspense fallback={<TabFallback />}>
            <ExchangeSettings journalId={activeJournalId} />
          </Suspense>
        </div>
      )}

      {/* Lazy modals, each in its own boundary so one loading (e.g. import,
          opened from inside settings) never blanks another that is open.
          fallback={null}: the Modal draws its own backdrop once loaded. */}
      <Suspense fallback={null}>
        {formMounted && (
          <TradeForm isOpen={formOpen} onClose={handleCloseForm} trade={editingTrade} onSave={handleSave}
            riskSettings={{ riskType: activeJournal?.riskType, riskValue: activeJournal?.riskValue, currentBalance: displayedCurrentBalance }}
            journalAssetClass={activeJournal?.assetClass || 'crypto'}
            livePrices={prices} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {importMounted && (
          <ImportTrades isOpen={importOpen} onClose={() => setImportOpen(false)} onImport={addTrade} onImportBulk={addTradesBulk} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {settingsMounted && (
          <JournalSettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onArchive={(name) => { setArchiveTargetName(name); setArchiveAnimating(true); }}
            onImport={() => setImportOpen(true)}
            onExport={exportCSV}
            canExport={trades.length > 0}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {shareMounted && (
          <TradeShareModal
            isOpen={!!shareTarget}
            onClose={() => setShareTarget(null)}
            trade={shareTarget}
          />
        )}
      </Suspense>

      <ArchiveAnimation
        isOpen={archiveAnimating}
        journalName={archiveTargetName}
        onComplete={() => setArchiveAnimating(false)}
      />
    </motion.div>
  );
}
