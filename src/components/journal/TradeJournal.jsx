import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, BookOpen, Download, Upload, Settings,
  Wallet, TrendingUp, Target, Zap, Flame, Snowflake, Signal,
  Scale, BarChart3, Activity, Calendar,
  Clock, DollarSign, Percent, Link2, Undo2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { useTrades } from '../../hooks/useTrades';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { calculatePnL } from '../../utils/calculations';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useLinkedExchangeBalance } from '../../hooks/useLinkedExchangeBalance';
import { addToUserCollection, timestamp } from '../../services/firestoreService';
import { Timestamp } from 'firebase/firestore';
import JournalSwitcher from './JournalSwitcher';
import TradeForm from './TradeForm';
import TradeTable from './TradeTable';
import TradeFilters from './TradeFilters';
import StatCard from '../dashboard/StatCard';
import TimePeriodFilter from '../dashboard/TimePeriodFilter';
import StrategyPerformanceTable from '../dashboard/StrategyPerformanceTable';
import MonthlyPerformanceTable from '../dashboard/MonthlyPerformanceTable';
import TradeHeatmap from '../dashboard/TradeHeatmap';
import EquityCurveChart from '../analytics/EquityCurveChart';
import SessionAnalysisChart from '../analytics/SessionAnalysisChart';
import DayOfWeekChart from '../analytics/DayOfWeekChart';
import TradeDurationChart from '../analytics/TradeDurationChart';
import MonthlyCalendar from './MonthlyCalendar';
import ImportTrades from './ImportTrades';
import JournalSettingsModal from './JournalSettingsModal';
import ArchiveAnimation from './ArchiveAnimation';
import EmptyState from '../shared/EmptyState';
import ExchangeSettings from '../exchange/ExchangeSettings';
import TradeShareModal from './TradeShareModal';
import JournalSkeleton from './JournalSkeleton';
import { formatCurrency, formatPercent, formatDuration, formatDate } from '../../utils/formatters';
import { TAG_LABELS } from '../../utils/constants';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';

const defaultFilters = { search: '', direction: '', result: '', strategy: '', tag: '', timeframe: '', month: '' };
const tooltipStyle = { background: '#141414', border: '1px solid #1a1a1a', borderRadius: '8px', fontSize: '12px', color: '#f0f0f0' };
const PIE_COLORS = ['#22c55e', '#ef4444', '#eab308'];

export default function TradeJournal() {
  const { user } = useAuth();
  const { activeJournal, activeJournalId, journals } = useJournalContext();
  const { trades, loading, addTrade, updateTrade, deleteTrade } = useTrades(activeJournalId);
  const { prices } = useCryptoPrices();
  const [searchParams] = useSearchParams();
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
  const [tab, setTab] = useState('trades');
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  // Render only a window of rows so the table stays fast with hundreds of trades.
  // Analytics/calendar still use the full `trades` array — this caps the DOM only.
  const [visibleCount, setVisibleCount] = useState(50);
  const [archiveAnimating, setArchiveAnimating] = useState(false);
  const [archiveTargetName, setArchiveTargetName] = useState('');
  const deleteTimersRef = useRef({});
  const deleteBatchRef = useRef(new Set());
  const deleteBatchTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Helper: filter trades and jump to trades tab
  const filterAndJump = (partialFilter) => {
    setFilters(f => ({ ...f, ...partialFilter }));
    setTab('trades');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };
  const deleteBatchToastRef = useRef(null);

  // Cleanup delete timers on unmount — also clears batch timer to avoid
  // setState-after-unmount and orphaned deletes when navigating away mid-undo window
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(deleteTimersRef.current).forEach(clearTimeout);
      if (deleteBatchTimerRef.current) clearTimeout(deleteBatchTimerRef.current);
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

  // Reset the rendered window when the visible set changes
  useEffect(() => {
    setVisibleCount(50);
  }, [filters, activeJournalId]);

  // When the journal is linked to a connected exchange, derive the starting
  // balance so currentBalance + every percentage-based stat (drawdown,
  // Recovery, Sortino, Calmar, Sharpe…) is calibrated to the real wallet:
  //   effectiveInitial = liveBalance − totalPnL(closed)
  // so stats.currentBalance = effectiveInitial + totalPnL = liveBalance.
  const liveExchangeBalance = useLinkedExchangeBalance(activeJournal?.exchange);
  const balanceIsLive = liveExchangeBalance != null;
  const totalClosedPnL = useMemo(
    () => trades
      .filter((t) => t.status === 'closed' || (parseFloat(t.exitPrice) > 0 && t.status !== 'partial'))
      .reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0),
    [trades]
  );
  const effectiveInitial = balanceIsLive
    ? Math.max(0, liveExchangeBalance - totalClosedPnL)
    : (activeJournal?.initialBalance || 0);
  const stats = useDashboardStats(trades, effectiveInitial, period);
  const displayedCurrentBalance = stats.currentBalance;

  useEffect(() => {
    if (searchParams.get('new') === '1') setFormOpen(true);
  }, [searchParams]);

  // Period-filtered trades — same logic as useDashboardStats so analytics match the selected period
  const periodTrades = useMemo(() => {
    if (period === 'all') return trades;
    const now = new Date();
    const start = new Date(now);
    if (period === 'week')  { start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0); }
    if (period === 'month') { start.setMonth(start.getMonth() - 1); start.setHours(0, 0, 0, 0); }
    if (period === 'year')  { start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0); }
    return trades.filter((t) => {
      const raw = t.exitDate || t.entryDate;
      if (!raw) return false;
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      return d >= start;
    });
  }, [trades, period]);

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
    return trades.filter((t) => {
      if (pendingDeletes.has(t.id)) return false;
      if (filters.search && !t.pair.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.result && t.result !== filters.result) return false;
      if (filters.strategy && t.strategy !== filters.strategy) return false;
      if (filters.timeframe && (filters.timeframe === 'N/A' ? !!t.timeframe : t.timeframe !== filters.timeframe)) return false;
      if (filters.tag && !(Array.isArray(t.tags) ? t.tags : []).includes(filters.tag)) return false;
      if (filters.month && monthKey(t) !== filters.month) return false;
      return true;
    }).sort((a, b) => getTime(b) - getTime(a));
  }, [trades, filters, pendingDeletes]);

  const analytics = useMemo(() => {
    const closed = periodTrades.filter((t) => t.exitPrice > 0);
    if (!closed.length) return null;

    const wins = closed.filter((t) => t.result === 'win');
    const losses = closed.filter((t) => t.result === 'loss');
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0) / losses.length) : 0;
    const largestWin = wins.length ? Math.max(...wins.map((t) => t.netPnl ?? t.pnl ?? 0)) : 0;
    const largestLoss = losses.length ? Math.min(...losses.map((t) => t.netPnl ?? t.pnl ?? 0)) : 0;

    const safeTradeDate = (t) => {
      const raw = t.exitDate || t.entryDate;
      if (!raw) return new Date(0);
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      return isNaN(d.getTime()) ? new Date(0) : d;
    };

    const sorted = [...closed].sort((a, b) => safeTradeDate(a) - safeTradeDate(b));

    const be = closed.filter((t) => t.result === 'breakeven').length;
    const pieData = [
      { name: 'רווח', value: wins.length },
      { name: 'הפסד', value: losses.length },
      { name: 'אפס', value: be },
    ].filter((d) => d.value > 0);

    const dailyMap = {};
    sorted.forEach((t) => {
      const d = safeTradeDate(t);
      const key = format(d, 'MM/dd');
      if (!dailyMap[key]) dailyMap[key] = 0;
      dailyMap[key] += t.netPnl ?? t.pnl ?? 0;
    });
    const dailyPnL = Object.entries(dailyMap).map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));

    const pairMap = {};
    closed.forEach((t) => {
      if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, losses: 0, pnl: 0 };
      if (t.result === 'win') pairMap[t.pair].wins++;
      else if (t.result === 'loss') pairMap[t.pair].losses++;
      pairMap[t.pair].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const byPair = Object.entries(pairMap).map(([pair, d]) => {
      const total = d.wins + d.losses;
      return { pair, ...d, total, winRate: total > 0 ? (d.wins / total) * 100 : 0 };
    }).sort((a, b) => b.pnl - a.pnl);

    const tfMap = {};
    closed.forEach((t) => {
      const tf = t.timeframe || 'N/A';
      if (!tfMap[tf]) tfMap[tf] = { wins: 0, total: 0, pnl: 0 };
      tfMap[tf].total++;
      if (t.result === 'win') tfMap[tf].wins++;
      tfMap[tf].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const byTimeframe = Object.entries(tfMap).map(([tf, d]) => ({ timeframe: tf, ...d, winRate: ((d.wins / d.total) * 100) })).sort((a, b) => b.pnl - a.pnl);

    const tagMap = {};
    closed.forEach((t) => {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      tags.forEach((tag) => {
        if (!tagMap[tag]) tagMap[tag] = { wins: 0, losses: 0, pnl: 0, count: 0 };
        tagMap[tag].count++;
        if (t.result === 'win') tagMap[tag].wins++;
        else if (t.result === 'loss') tagMap[tag].losses++;
        tagMap[tag].pnl += t.netPnl ?? t.pnl ?? 0;
      });
    });
    const byTag = Object.entries(tagMap).map(([tag, d]) => ({ tag, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl);

    let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
    sorted.forEach((t) => {
      if (t.result === 'win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
      else if (t.result === 'loss') { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
      else { curWin = 0; curLoss = 0; }
    });

    const longTrades = closed.filter((t) => t.direction === 'long');
    const shortTrades = closed.filter((t) => t.direction === 'short');
    const longWins = longTrades.filter((t) => t.result === 'win').length;
    const shortWins = shortTrades.filter((t) => t.result === 'win').length;
    const longWinRate = longTrades.length ? (longWins / longTrades.length) * 100 : 0;
    const shortWinRate = shortTrades.length ? (shortWins / shortTrades.length) * 100 : 0;
    const longPnl = longTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const shortPnl = shortTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);

    // By strategy — sorted by trade count
    const stratMap = {};
    closed.forEach((t) => {
      if (!t.strategy) return;
      if (!stratMap[t.strategy]) stratMap[t.strategy] = { wins: 0, losses: 0, pnl: 0, count: 0 };
      stratMap[t.strategy].count++;
      if (t.result === 'win') stratMap[t.strategy].wins++;
      else if (t.result === 'loss') stratMap[t.strategy].losses++;
      stratMap[t.strategy].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const byStrategy = Object.entries(stratMap)
      .map(([name, d]) => ({ name, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    return { avgWin, avgLoss, largestWin, largestLoss, pieData, dailyPnL, byPair, byTimeframe, byTag, byStrategy, maxWin, maxLoss, longWinRate, shortWinRate, longPnl, shortPnl, longCount: longTrades.length, shortCount: shortTrades.length, longWins, shortWins };
  }, [periodTrades]);

  const handleSave = async (data) => {
    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, data);
        toast.success('העסקה עודכנה');
      } else {
        // Warn on duplicate: same pair + direction + entry price within 10 min
        const entryMs = data.entryDate instanceof Date ? data.entryDate.getTime() : new Date(data.entryDate).getTime();
        const isDuplicate = trades.some((t) => {
          if (t.pair !== data.pair || t.direction !== data.direction || t.entryPrice !== data.entryPrice) return false;
          const tMs = t.entryDate?.toDate ? t.entryDate.toDate().getTime() : new Date(t.entryDate).getTime();
          return Math.abs(tMs - entryMs) < 10 * 60 * 1000;
        });
        if (isDuplicate) {
          toast('עסקה דומה כבר קיימת — בדוק שאין כפל', { icon: '⚠️', duration: 4000 });
        }
        await addTrade(data);
        toast.success('העסקה נוספה');
      }
      // Confetti on winning closed trade
      if (data.exitPrice > 0) {
        const pnl = calculatePnL(data.direction, data.entryPrice, data.exitPrice, data.quantity);
        if (pnl > 0) {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors: ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#38bdf8'] });
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

  const handleDeleteWithUndo = (trade) => {
    setPendingDeletes((prev) => new Set(prev).add(trade.id));
    deleteBatchRef.current.add(trade.id);

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
        { duration: 5000, style: { background: '#1a1a2e', color: '#f0f0f0', border: '1px solid #2a2a3e' } },
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

  const exportCSV = () => {
    if (!filteredTrades.length) return;
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
    const rows = filteredTrades.map((t) => {
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
        (isNaN(pnlPct) ? 0 : pnlPct).toFixed(2), (t.rrRatio ?? 0).toFixed(2), t.strategy || '',
        t.timeframe || '', t.exitPrice > 0 ? 'סגורה' : 'פתוחה',
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

  const getCoinFromPair = (pair = '') => pair.replace(/USDT$|BUSD$|USDC$|USD$/, '').toUpperCase();

  const isLimitPending = (trade) => {
    if (trade.orderType !== 'limit' || trade.exitPrice > 0) return false;
    if (trade.limitTriggered) return false; // triggered → active, not pending
    const currentPrice = prices[getCoinFromPair(trade.pair)]?.price;
    if (!currentPrice || !trade.entryPrice) return true; // no price data → assume pending
    const entry = parseFloat(trade.entryPrice);
    return trade.direction === 'long' ? currentPrice > entry : currentPrice < entry;
  };

  if (loading) return <JournalSkeleton />;

  if (!activeJournal && journals.length === 0) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
        <EmptyState
          icon={BookOpen}
          title="אין יומנים פעילים"
          description="כל היומנים שלך בארכיון. שחזר יומן או צור חדש."
        />
        <ArchiveAnimation
          isOpen={archiveAnimating}
          journalName={archiveTargetName}
          onComplete={() => setArchiveAnimating(false)}
        />
      </motion.div>
    );
  }

  const streakText = stats.currentStreak.count > 0
    ? `${stats.currentStreak.count} ${stats.currentStreak.type === 'win' ? 'רווחים' : 'הפסדים'}`
    : '0';
  const streakColor = stats.currentStreak.type === 'win' ? 'text-profit' : stats.currentStreak.type === 'loss' ? 'text-loss' : 'text-text-primary';
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';
  const pnlColor = (v) => v >= 0 ? 'text-profit' : 'text-loss';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Top Navigation Bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5 space-y-2 relative z-10">
        {/* Row 1: Journal switcher + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 md:gap-3 min-w-0">
            <JournalSwitcher compact />
            <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
            {/* Desktop tabs inline */}
            <div className="hidden md:flex items-center">
              <button
                onClick={() => setTab('trades')}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'trades' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                עסקאות ({trades.length})
              </button>
              <button
                onClick={() => setTab('analytics')}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'analytics' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                ניתוחים
              </button>
              <button
                onClick={() => setTab('calendar')}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'calendar' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                יומן חודשי
              </button>
              <button
                onClick={() => setTab('exchange')}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'exchange' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                חיבור בורסאות
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {tab === 'analytics' && <div className="hidden md:block"><TimePeriodFilter value={period} onChange={setPeriod} compact /></div>}
            <button onClick={() => setSettingsOpen(true)} className="p-1.5 md:p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="הגדרות יומן">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={() => setImportOpen(true)} className="p-1.5 md:p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="ייבוא CSV">
              <Upload className="w-4 h-4" />
            </button>
            {trades.length > 0 && (
              <button onClick={exportCSV} className="p-1.5 md:p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="ייצוא CSV">
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 bg-accent-primary text-bg-primary font-semibold px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer text-xs md:text-sm">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">עסקה חדשה</span>
            </button>
          </div>
        </div>

        {/* Row 2: Mobile tabs + period filter */}
        <div className="md:hidden flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => setTab('trades')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'trades' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              עסקאות ({trades.length})
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'analytics' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              ניתוחים
            </button>
            <button
              onClick={() => setTab('calendar')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'calendar' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              יומן חודשי
            </button>
            <button
              onClick={() => setTab('exchange')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'exchange' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              בורסאות
            </button>
          </div>
          {tab === 'analytics' && <TimePeriodFilter value={period} onChange={setPeriod} dropdown />}
        </div>
      </div>

      {tab === 'trades' && (
        <>
          {trades.length > 0 && <TradeFilters filters={filters} onChange={setFilters} trades={trades} />}

          {filteredTrades.length === 0 && !loading ? (
            <EmptyState
              icon={BookOpen}
              title={trades.length === 0 ? 'אין עסקאות עדיין' : 'אין עסקאות תואמות'}
              description={trades.length === 0 ? 'התחל לתעד את העסקאות שלך למעקב ביצועים' : 'נסה לשנות את הפילטרים'}
              action={
                trades.length === 0 ? (
                  <button
                    onClick={() => setFormOpen(true)}
                    className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    הוסף את העסקה הראשונה
                  </button>
                ) : (
                  <button
                    onClick={() => setFilters(defaultFilters)}
                    className="mt-2 px-4 py-2 bg-bg-tertiary text-text-primary border border-border-primary rounded-lg hover:bg-border-hover transition-colors cursor-pointer text-sm"
                  >
                    נקה פילטרים
                  </button>
                )
              }
            />
          ) : (
            <>
              <TradeTable trades={filteredTrades.slice(0, visibleCount)} onEdit={handleEdit} onDelete={handleDeleteWithUndo} onShare={setShareTarget} isLimitPending={isLimitPending} />
              {filteredTrades.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount((c) => c + 50)}
                  className="mt-3 w-full py-2.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:bg-border-hover transition-colors cursor-pointer text-sm"
                >
                  טען עוד ({filteredTrades.length - visibleCount})
                </button>
              )}
            </>
          )}
        </>
      )}

      {tab === 'analytics' && (
        <>
          {/* Row 1: Main Stats */}
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-3 md:mb-4" variants={staggerContainer} initial="initial" animate="animate">
            <StatCard label={balanceIsLive ? `יתרה נוכחית · ${activeJournal.exchange}` : 'יתרה נוכחית'}
              value={formatCurrency(displayedCurrentBalance).replace('+', '')}
              subtitle={balanceIsLive ? 'מסונכרן עם הבורסה' : (activeJournal?.initialBalance > 0 ? `${formatPercent(stats.balanceChangePercent)} מההתחלה` : `${stats.totalTrades} עסקאות`)}
              subtitleColor={balanceIsLive ? 'text-accent-primary' : (stats.balanceChangePercent >= 0 ? 'text-profit' : 'text-loss')} icon={Wallet} color="text-accent-primary"
              gradient={stats.totalPnL >= 0 ? 'profit' : 'loss'} />
            <StatCard label="רווח נקי" value={formatCurrency(stats.totalPnL)} subtitle={`${stats.totalTrades} עסקאות`}
              icon={DollarSign} color={stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'} />
            <StatCard label="אחוז הצלחה" value={`${stats.winRate.toFixed(1)}%`} subtitle={`${stats.winCount}W ${stats.lossCount}L`}
              icon={Target} color="text-accent-primary" />
            <StatCard label="תוחלת" value={formatCurrency(stats.expectancy)} subtitle={`ממוצע ${stats.avgRR.toFixed(2)}R`}
              icon={Zap} color={stats.expectancy >= 0 ? 'text-profit' : 'text-loss'} />
          </motion.div>

          {/* Combined Metrics Grid */}
          <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 md:mb-6 p-3">
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-px">
              {[
                { label: 'רצף נוכחי', value: streakText, color: streakColor },
                { label: 'Profit Factor', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1.5 ? 'text-profit' : 'text-loss' },
                { label: 'Sharpe', value: stats.sharpeRatio.toFixed(2) },
                { label: 'Calmar', value: stats.calmarRatio.toFixed(2) },
                { label: 'Sortino', value: stats.sortinoRatio === Infinity ? '∞' : stats.sortinoRatio.toFixed(2) },
                { label: 'Recovery', value: stats.recoveryFactor.toFixed(2), color: stats.recoveryFactor >= 1 ? 'text-profit' : 'text-loss' },
                { label: 'Max DD', value: `-${stats.maxDrawdown.toFixed(1)}%`, color: 'text-loss' },
                { label: 'R/R', value: `1:${stats.avgRR.toFixed(2)}` },
                { label: 'ימי מסחר', value: stats.tradingDays },
                { label: 'עסקאות/יום', value: stats.tradesPerDay.toFixed(1) },
                { label: 'משך ממוצע', value: formatDuration(stats.avgDurationHours) },
                { label: 'עמלות', value: formatCurrency(-stats.totalFees), color: 'text-loss' },
                ...(analytics ? [
                  { label: 'ממוצע רווח', value: formatCurrency(analytics.avgWin), color: 'text-profit' },
                  { label: 'ממוצע הפסד', value: formatCurrency(-analytics.avgLoss), color: 'text-loss' },
                  { label: 'רווח מקס׳', value: formatCurrency(analytics.largestWin), color: 'text-profit' },
                  { label: 'הפסד מקס׳', value: formatCurrency(analytics.largestLoss), color: 'text-loss' },
                  { label: 'רצף רווחים', value: analytics.maxWin, color: 'text-profit' },
                  { label: 'רצף הפסדים', value: analytics.maxLoss, color: 'text-loss' },
                  { label: `Long (${analytics.longCount})`, value: `${analytics.longWinRate.toFixed(0)}%`, color: 'text-long' },
                  { label: `Short (${analytics.shortCount})`, value: `${analytics.shortWinRate.toFixed(0)}%`, color: 'text-short' },
                ] : []),
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center py-3 px-2">
                  <span className="text-[10px] text-text-muted whitespace-nowrap mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color || 'text-text-primary'} whitespace-nowrap`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {analytics && (
            <>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className={`${cardClass} p-5`}>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">התפלגות תוצאות</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={analytics.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                        {analytics.pieData.map((d, i) => <Cell key={d.name} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a0a0b8', fontSize: '11px' }} itemStyle={{ color: '#f0f0f0' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-3 text-[10px] mt-1">
                    {analytics.pieData.map((d, i) => {
                      const resultKey = d.name === 'רווח' ? 'win' : d.name === 'הפסד' ? 'loss' : 'breakeven';
                      return (
                        <div key={d.name} onClick={() => filterAndJump({ result: resultKey })}
                          className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                          <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                          <span className="text-text-muted">{d.name} ({d.value}) ↗</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={`${cardClass} p-5`}>
                  <h3 className="text-sm font-semibold text-text-primary mb-3">רווח/הפסד יומי</h3>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={analytics.dailyPnL}>
                      <XAxis dataKey="date" tick={{ fill: '#606070', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#606070', fontSize: 10 }} axisLine={false} tickLine={false} orientation="right" />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a0a0b8', fontSize: '11px' }} itemStyle={{ color: '#f0f0f0' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(val) => [formatCurrency(val), 'רווח/הפסד']} />
                      <Bar dataKey="pnl" radius={[4, 4, 0, 0]} animationDuration={800}>
                        {analytics.dailyPnL.map((entry) => (
                          <Cell key={entry.date} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <EquityCurveChart data={stats.equityChartData} />
                <TradeDurationChart trades={periodTrades} />
              </div>
            </>
          )}

          {/* Long vs Short visual card */}
          {analytics && (analytics.longCount > 0 || analytics.shortCount > 0) && (
            <div className={`${cardClass} mb-4 p-5`}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Long vs Short</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Long */}
                <div onClick={() => filterAndJump({ direction: 'long' })}
                  className="cursor-pointer rounded-lg p-2 hover:bg-accent-primary/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-profit">Long ↗</span>
                    <span className="text-xs text-text-muted">{analytics.longCount} עסקאות · {analytics.longWins}W</span>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-profit rounded-full transition-all duration-700" style={{ width: `${analytics.longWinRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-profit">{analytics.longWinRate.toFixed(1)}% הצלחה</span>
                    <span className={analytics.longPnl >= 0 ? 'text-profit' : 'text-loss'}>{analytics.longPnl >= 0 ? '+' : ''}{analytics.longPnl.toFixed(2)}$</span>
                  </div>
                </div>
                {/* Short */}
                <div onClick={() => filterAndJump({ direction: 'short' })}
                  className="cursor-pointer rounded-lg p-2 hover:bg-accent-primary/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-loss">Short ↗</span>
                    <span className="text-xs text-text-muted">{analytics.shortCount} עסקאות · {analytics.shortWins}W</span>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-loss rounded-full transition-all duration-700" style={{ width: `${analytics.shortWinRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-loss">{analytics.shortWinRate.toFixed(1)}% הצלחה</span>
                    <span className={analytics.shortPnl >= 0 ? 'text-profit' : 'text-loss'}>{analytics.shortPnl >= 0 ? '+' : ''}{analytics.shortPnl.toFixed(2)}$</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <TradeHeatmap trades={periodTrades} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <SessionAnalysisChart data={stats.sessionPerformance} />
            <DayOfWeekChart data={stats.dayOfWeekPerformance} />
            {analytics?.byTag?.length > 0 && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי תגית</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">תגית</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byTag.map((t) => (
                        <tr key={t.tag} onClick={() => filterAndJump({ tag: t.tag })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{TAG_LABELS[t.tag] || t.tag} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{t.count}</td>
                          <td className="py-2 text-text-secondary">{t.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(t.pnl)}`}>{formatCurrency(t.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StrategyPerformanceTable
              data={analytics?.byStrategy}
              onStrategyClick={(name) => filterAndJump({ strategy: name })}
            />
            <MonthlyPerformanceTable data={stats.monthlyPerformance} />
            {analytics && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי זוג</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">זוג</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byPair.map((p) => (
                        <tr key={p.pair} onClick={() => filterAndJump({ search: p.pair })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{p.pair} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{p.wins + p.losses}</td>
                          <td className="py-2 text-text-secondary">{p.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(p.pnl)}`}>{formatCurrency(p.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה לסינון עסקאות לפי זוג</p>
              </div>
            )}
            {analytics?.byTimeframe?.length > 0 && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי טווח זמן</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">טווח זמן</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byTimeframe.map((tf) => (
                        <tr key={tf.timeframe} onClick={() => filterAndJump({ timeframe: tf.timeframe })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{tf.timeframe} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{tf.total}</td>
                          <td className="py-2 text-text-secondary">{tf.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(tf.pnl)}`}>{formatCurrency(tf.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה לסינון עסקאות לפי טווח זמן</p>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'calendar' && (
        <MonthlyCalendar trades={trades} journalName={activeJournal?.name} />
      )}

      {tab === 'exchange' && (
        <div className="mt-2">
          <ExchangeSettings
            journalId={activeJournalId}
            existingExternalIds={new Set(trades.filter(t => t.externalId).map(t => t.externalId))}
            onImportTrade={async (t) => {
              if (!user) throw new Error('No user');
              const safeTs = (raw) => {
                if (!raw) return null;
                const d = new Date(raw);
                return isNaN(d.getTime()) ? null : d;
              };
              const entryD = safeTs(t.entryDate) || new Date();
              const exitD = safeTs(t.exitDate) || entryD;
              const fees = typeof t.fees === 'number' ? Math.abs(t.fees) : 0;

              // Open positions from the exchange: keep status=open and save
              // every field the worker provided (stopLoss, tps, leverage,
              // qty, …) instead of squashing them into a closed-trade shape.
              if (t._isOpen) {
                const ep = t.entryPrice > 0 ? t.entryPrice : 0;
                const qty = t.quantity > 0 ? t.quantity : 0;
                const lev = Math.min(200, Math.max(1, t.leverage || 1));
                return addToUserCollection(user.uid, 'trades', {
                  pair: t.pair, direction: t.direction,
                  entryPrice: ep, quantity: qty, leverage: lev,
                  stopLoss: parseFloat(t.stopLoss) || 0,
                  tps: Array.isArray(t.tps) ? t.tps : [],
                  fees,
                  status: 'open',
                  orderType: t.orderType || 'market',
                  entryDate: entryD,
                  source: t.source, externalId: t.externalId,
                  positionSize: t.positionSize || ep * qty,
                  margin: ep * qty / lev,
                  ...(t.session ? { session: t.session } : {}),
                  ...(t.liquidationPrice ? { liquidationPrice: t.liquidationPrice } : {}),
                  journalId: activeJournalId || null,
                  createdAt: timestamp(),
                  updatedAt: timestamp(),
                });
              }

              // Upsert: update existing trade if externalId already in journal
              const existing = t.externalId
                ? trades.find(tr => tr.externalId === t.externalId)
                : null;
              if (existing) {
                return updateTrade(existing.id, {
                  entryDate: entryD,
                  exitDate: exitD,
                  fees,
                  entryPrice: t.entryPrice > 0 ? t.entryPrice : existing.entryPrice,
                  exitPrice: t.exitPrice > 0 ? t.exitPrice : existing.exitPrice,
                  pnlFromExchange: t.pnlFromExchange ?? existing.pnlFromExchange,
                  pnl: t.pnlFromExchange ?? existing.pnl,
                  netPnl: t.pnlFromExchange ?? existing.netPnl,
                  updatedAt: timestamp(),
                });
              }

              // Create new trade — compute netPnl correctly by subtracting fees,
              // and derive result from netPnl (not gross pnl) so a small win
              // eaten by large fees is correctly classified as a loss
              const ep = t.entryPrice > 0 ? t.entryPrice : 1;
              // exitPrice fallback: use entry price (yields 0 PnL) instead of
              // 1, which previously surfaced as a phantom TP at price 1.
              const xp = t.exitPrice > 0 ? t.exitPrice : ep;
              const qty = t.quantity > 0 ? t.quantity : 1;
              const lev = Math.min(200, Math.max(1, t.leverage || 1));
              const pnl = t.pnlFromExchange ?? 0;
              const netPnlImport = pnl - fees;
              const result = netPnlImport > 0 ? 'win' : netPnlImport < 0 ? 'loss' : 'breakeven';
              return addToUserCollection(user.uid, 'trades', {
                pair: t.pair, direction: t.direction,
                entryPrice: ep, exitPrice: xp, quantity: qty, leverage: lev,
                stopLoss: parseFloat(t.stopLoss) || 0,
                tps: Array.isArray(t.tps) ? t.tps : [],
                ...(t.session ? { session: t.session } : {}),
                fees, status: 'closed',
                entryDate: entryD, exitDate: exitD,
                source: t.source, externalId: t.externalId,
                pnlFromExchange: pnl, pnl, netPnl: netPnlImport,
                pnlPercent: (pnl / (ep * qty)) * 100 * lev,
                rrRatio: 0, result,
                positionSize: ep * qty, margin: (ep * qty) / lev,
                journalId: activeJournalId,
                createdAt: Timestamp.fromDate(entryD), updatedAt: timestamp(),
              });
            }}
          />
        </div>
      )}

      <TradeForm isOpen={formOpen} onClose={handleCloseForm} trade={editingTrade} onSave={handleSave}
        riskSettings={{ riskType: activeJournal?.riskType, riskValue: activeJournal?.riskValue, currentBalance: stats.currentBalance }}
        livePrices={prices} />

      <ImportTrades isOpen={importOpen} onClose={() => setImportOpen(false)} onImport={addTrade} />

      <JournalSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onArchive={(name) => { setArchiveTargetName(name); setArchiveAnimating(true); }} />

      <TradeShareModal
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        trade={shareTarget}
      />

      <ArchiveAnimation
        isOpen={archiveAnimating}
        journalName={archiveTargetName}
        onComplete={() => setArchiveAnimating(false)}
      />
    </motion.div>
  );
}
