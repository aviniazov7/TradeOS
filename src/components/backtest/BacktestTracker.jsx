import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, FlaskConical, Trash2, Pencil, ExternalLink, TrendingUp, TrendingDown, Settings, Download, ChevronDown, ChevronRight, ChevronLeft, Eye, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import toast from 'react-hot-toast';
import { useBacktests } from '../../hooks/useBacktests';
import { useBacktestStats } from '../../hooks/useBacktestStats';
import { useBacktestContext } from '../../contexts/BacktestContext';
import BacktestSwitcher from './BacktestSwitcher';
import BacktestFilters from './BacktestFilters';
import BacktestAnalytics from './BacktestAnalytics';
import BacktestAICoachPanel from './BacktestAICoachPanel';
import TimePeriodFilter from '../dashboard/TimePeriodFilter';
import BacktestSettingsModal from './BacktestSettingsModal';
import StrategyView from './StrategyView';
import EmptyState from '../shared/EmptyState';
import BacktestSkeleton from './BacktestSkeleton';
import ConfirmDialog from '../shared/ConfirmDialog';
import CoinIcon from '../shared/CoinIcon';
import Modal from '../shared/Modal';
import PairSearch from '../journal/PairSearch';
import TimeframeSelector from '../shared/TimeframeSelector';
import StrategySelector from '../shared/StrategySelector';
import { PAIRS, SESSIONS, getSessionClasses } from '../../utils/constants';
import { formatDate, formatDateShort, formatTime } from '../../utils/formatters';
import { safeHttpUrl } from '../../utils/urls';
import { useUserStrategies } from '../../hooks/useUserStrategies';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';
import { useUserTriggers } from '../../hooks/useUserTriggers';
import { pageVariants, pageTransition } from '../../utils/animations';


function getSessionFromDate(date) {
  if (!date) return '';
  const h = date.getHours();
  if (h >= 0 && h < 8) return 'Asia';
  if (h >= 8 && h < 13) return 'London';
  if (h >= 13 && h < 17) return 'London/NY Overlap';
  if (h >= 17 && h < 22) return 'New York';
  return 'Asia';
}

// A function, not a module-level object: the default date must be "now" at the
// moment the form opens, not frozen at app load (a tab left open for two days
// was silently stamping backtests with a stale date + wrong auto-session).
const makeDefaultForm = () => ({
  pair: 'BTCUSDT', direction: 'long', strategy: '', trigger: '',
  timeframe: '4H', session: '', date: new Date().toISOString(),
  maxR: '', stopDistancePct: '', rResult: '', result: 'win',
  entryChartUrl: '', managementChartUrl: '', notes: '',
});

const defaultFilters = { search: '', direction: '', result: '', strategy: '', session: '' };

// Sortable table header — click to sort by `col`, toggling asc/desc. Neutral
// arrows when inactive so the affordance is discoverable.
function SortableTh({ label, col, tip, sort, onSort }) {
  const active = sort.key === col;
  return (
    <th className="text-right pb-2.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        title={tip}
        className="inline-flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
      >
        {label}
        {active
          ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  );
}

export default function BacktestTracker() {
  const { activeJournal, activeJournalId, loading: journalLoading } = useBacktestContext();
  const { backtests, loading, addBacktest, updateBacktest, deleteBacktest } = useBacktests(activeJournalId);
  const { allStrategies, addStrategy, removeStrategy } = useUserStrategies('backtest');
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const { allTriggers, addTrigger, removeTrigger } = useUserTriggers();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(makeDefaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [period, setPeriod] = useState('all');
  const [tab, setTab] = useState('records');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [mobileStep, setMobileStep] = useState(0);

  const update = (field, value) => setForm((f) => {
    const next = { ...f, [field]: value };
    if (field === 'rResult') {
      const r = parseFloat(value);
      if (!isNaN(r)) next.result = r > 0 ? 'win' : r < 0 ? 'loss' : 'breakeven';
    }
    return next;
  });

  const openEdit = (bt) => {
    setEditingId(bt.id);
    setForm({
      pair: bt.pair || 'BTCUSDT',
      direction: bt.direction || 'long',
      strategy: bt.strategy || '',
      trigger: bt.trigger || '',
      timeframe: bt.timeframe || '4H',
      session: bt.session || '',
      date: bt.date || new Date().toISOString().slice(0, 10),
      maxR: bt.maxR || '',
      stopDistancePct: bt.stopDistancePct || '',
      rResult: bt.rResult || '',
      result: bt.result || 'win',
      entryChartUrl: bt.entryChartUrl || '',
      managementChartUrl: bt.managementChartUrl || '',
      notes: bt.notes || '',
    });
    setFormOpen(true);
    setMobileStep(0);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(makeDefaultForm());
    setFormOpen(true);
    setMobileStep(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.strategy && !form.trigger) { toast.error('נא להזין טריגר או אסטרטגיה'); return; }

    setSaving(true);
    const data = {
      pair: form.pair,
      direction: form.direction,
      strategy: form.strategy,
      trigger: form.trigger,
      timeframe: form.timeframe,
      session: form.session,
      date: form.date,
      maxR: parseFloat(form.maxR) || 0,
      stopDistancePct: parseFloat(form.stopDistancePct) || 0,
      rResult: parseFloat(form.rResult) || 0,
      result: form.result,
      entryChartUrl: form.entryChartUrl,
      managementChartUrl: form.managementChartUrl,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await updateBacktest(editingId, data);
        toast.success('העסקה עודכנה');
      } else {
        await addBacktest(data);
        toast.success('העסקה נוספה');
      }
      setForm({ ...makeDefaultForm(), pair: form.pair, strategy: form.strategy, timeframe: form.timeframe, session: form.session });
      setEditingId(null);
      setFormOpen(false);
    } catch { toast.error('שגיאה בשמירה'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteBacktest(deleteTarget.id); toast.success('נמחק'); setDeleteTarget(null); }
    catch { toast.error('שגיאה במחיקה'); }
  };

  const filtered = useMemo(() => {
    return backtests.filter((b) => {
      if (filters.search && !b.pair?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.direction && b.direction !== filters.direction) return false;
      if (filters.result && b.result !== filters.result) return false;
      if (filters.strategy && b.strategy !== filters.strategy) return false;
      if (filters.session && b.session !== filters.session) return false;
      return true;
    });
  }, [backtests, filters]);

  const filtersActive = !!(filters.search || filters.direction || filters.result || filters.strategy || filters.session);

  // Live summary over the CURRENTLY VISIBLE (filtered) rows — so filtering to
  // one strategy/session instantly shows that subset's win rate & R.
  const recordStats = useBacktestStats(filtered);

  // Sort the visible rows. Numeric columns sort by value; 'date' by timestamp.
  const sortedFiltered = useMemo(() => {
    const val = (b) => {
      if (sort.key === 'date') {
        const t = new Date(b.date || b.createdAt || 0).getTime();
        return Number.isFinite(t) ? t : 0;
      }
      return Number(b[sort.key]) || 0;
    };
    const arr = [...filtered].sort((a, b) => val(a) - val(b));
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [filtered, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ['תאריך', 'זוג', 'כיוון', 'טריגר', 'אסטרטגיה', 'TF', 'סשן', 'Max R', 'Stop %', 'R Result', 'תוצאה', 'הערות'];
    const rows = sortedFiltered.map((bt) => [
      bt.date || '', bt.pair, bt.direction, bt.trigger || '', bt.strategy || '',
      bt.timeframe || '', bt.session || '', bt.maxR || '', bt.stopDistancePct || '',
      bt.rResult || '', bt.result, bt.notes || '',
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backtest_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  };

  if (loading || journalLoading) return <BacktestSkeleton />;

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';
  const labelClass = 'block text-xs text-text-muted mb-1';
  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Top Navigation Bar. backdrop-filter is force-disabled here (same as the
          journal toolbar): a raised translucent blur layer at the top of the
          page rendered as a faint "glass band" that flashed on hover-triggered
          re-rasterization. Keeping the bg-bg-secondary fill keeps it identical
          in both themes. */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5 space-y-2 relative z-10" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
        {/* Row 1: Switcher + Tabs + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 md:gap-3 min-w-0">
            <BacktestSwitcher compact />
            <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
            {/* Desktop tabs */}
            <div className="hidden md:flex items-center">
              <button
                onClick={() => setTab('records')}
                className={`h-9 inline-flex items-center px-3.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'records' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                עסקאות ({backtests.length})
              </button>
              <button
                onClick={() => setTab('analytics')}
                className={`h-9 inline-flex items-center px-3.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  tab === 'analytics' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                ניתוחים
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {/* Period filter lives in the toolbar (like the journal) — compact
                segmented control on desktop, dropdown on mobile — shown only on
                the analytics tab. */}
            {tab === 'analytics' && <div className="hidden md:block"><TimePeriodFilter value={period} onChange={setPeriod} compact /></div>}
            {tab === 'analytics' && <div className="md:hidden"><TimePeriodFilter value={period} onChange={setPeriod} dropdown /></div>}
            <button onClick={() => setViewOpen(true)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="צפייה ביומן">
              <Eye className="w-4 h-4" />
            </button>
            <button onClick={() => setSettingsOpen(true)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="הגדרות">
              <Settings className="w-4 h-4" />
            </button>
            {backtests.length > 0 && (
              <button onClick={exportCSV} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="ייצוא CSV">
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={openNew} className="h-9 inline-flex items-center gap-1.5 text-accent-primary border border-accent-primary/40 font-semibold px-3.5 rounded-lg hover:bg-accent-primary/10 transition-colors cursor-pointer text-sm">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף עסקה</span>
            </button>
          </div>
        </div>

        {/* Row 2: Mobile tabs */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setTab('records')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'records' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            עסקאות ({backtests.length})
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'analytics' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            ניתוחים
          </button>
        </div>
      </div>

      {/* Tab: Records */}
      {tab === 'records' && (
        <>
          {/* Slim summary bar — a single contained row (NOT the big tiles the
              analytics tab shows, to avoid duplicating it). Reflects the active
              filters, so filtering to one strategy shows that subset's numbers. */}
          {filtered.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-5 gap-y-1.5 mb-3 px-3.5 py-2.5 bg-bg-secondary border border-border-primary rounded-xl">
              <span className="text-xs text-text-muted">{recordStats.total} עסקאות</span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs text-text-muted">הצלחה</span>
                <span className="text-sm font-bold text-text-primary" dir="ltr">{recordStats.winRate.toFixed(1)}%</span>
                <span className="text-[10px] text-text-muted" dir="ltr">({recordStats.wins}W/{recordStats.losses}L)</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs text-text-muted">ממוצע R</span>
                <span className={`text-sm font-bold ${recordStats.avgR >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{recordStats.avgR >= 0 ? '+' : ''}{recordStats.avgR.toFixed(2)}R</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs text-text-muted">סה״כ R</span>
                <span className={`text-sm font-bold ${recordStats.totalR >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{recordStats.totalR >= 0 ? '+' : ''}{recordStats.totalR.toFixed(2)}R</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs text-text-muted">PF</span>
                <span className="text-sm font-bold text-text-primary" dir="ltr">{recordStats.profitFactorR === Infinity ? '∞' : recordStats.profitFactorR.toFixed(2)}</span>
              </span>
            </div>
          )}

          {backtests.length > 0 && <BacktestFilters filters={filters} onChange={setFilters} />}

          {/* Result count + clear, shown only while filtering */}
          {backtests.length > 0 && filtersActive && (
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="text-text-muted">מציג {filtered.length} מתוך {backtests.length}</span>
              <button
                onClick={() => setFilters(defaultFilters)}
                className="inline-flex items-center gap-1 text-accent-primary hover:underline cursor-pointer"
              >
                <X className="w-3 h-3" /> נקה סינון
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title={backtests.length === 0 ? 'אין עסקאות בקטסט' : 'אין עסקאות תואמות'}
              description={backtests.length === 0 ? 'התחל לבדוק אסטרטגיות על נתוני עבר' : 'נסה לשנות את הפילטרים'}
              action={
                backtests.length === 0 && (
                  <button onClick={openNew} className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
                    הוסף עסקה ראשונה
                  </button>
                )
              }
            />
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-2.5">
                {sortedFiltered.map((bt) => {
                  const isExpanded = expandedCard === bt.id;
                  return (
                    <div key={bt.id} className={`${cardClass}`}>
                      {/* Main row - always visible */}
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedCard(isExpanded ? null : bt.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <CoinIcon pair={bt.pair} className="w-4 h-4" />
                          <span className="text-text-primary font-semibold text-sm">{bt.pair}</span>
                          <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${bt.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                            {bt.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {bt.direction === 'long' ? 'Long' : 'Short'}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${bt.result === 'win' ? 'bg-profit/15 text-profit' : bt.result === 'breakeven' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-loss/15 text-loss'}`}>
                            {bt.result === 'win' ? 'W' : bt.result === 'breakeven' ? 'BE' : 'L'}
                          </span>
                          {bt.strategy && <span className="text-[11px] text-text-secondary truncate">{bt.strategy}</span>}
                          <span className="text-[11px] text-text-muted">
                            {formatDateShort(bt.date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-sm font-bold ${(bt.rResult || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {bt.rResult != null ? `${bt.rResult >= 0 ? '+' : ''}${bt.rResult.toFixed(2)}R` : '–'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 pt-2.5 border-t border-border-primary/50 space-y-2.5">
                          {/* Details grid */}
                          <div className="grid grid-cols-5 gap-x-2 text-[11px]">
                            <div>
                              <span className="text-text-muted">שעה</span>
                              <p className="text-text-secondary">{bt.date ? new Date(bt.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '–'}</p>
                            </div>
                            <div>
                              <span className="text-text-muted">TF</span>
                              <p className="text-text-secondary">{bt.timeframe || '–'}</p>
                            </div>
                            <div>
                              <span className="text-text-muted">Max R</span>
                              <p className="text-text-primary">{bt.maxR ? bt.maxR.toFixed(1) : '–'}</p>
                            </div>
                            <div>
                              <span className="text-text-muted">Stop %</span>
                              <p className="text-text-primary">{bt.stopDistancePct ? `${bt.stopDistancePct.toFixed(2)}%` : '–'}</p>
                            </div>
                            <div>
                              <span className="text-text-muted">טריגר</span>
                              <p className="text-text-secondary truncate">{bt.trigger || '–'}</p>
                            </div>
                          </div>

                          {/* Session + Chart links */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {bt.session && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSessionClasses(bt.session)}`}>
                                  {bt.session}
                                </span>
                              )}
                              {safeHttpUrl(bt.entryChartUrl) && (
                                <a href={safeHttpUrl(bt.entryChartUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-accent-primary text-[10px]">
                                  <ExternalLink className="w-3 h-3" />כניסה
                                </a>
                              )}
                              {safeHttpUrl(bt.managementChartUrl) && (
                                <a href={safeHttpUrl(bt.managementChartUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-purple-400 text-[10px]">
                                  <ExternalLink className="w-3 h-3" />ניהול
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Notes + Actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-border-primary/50">
                            <p className="text-[11px] text-text-muted flex-1 min-w-0 truncate">{bt.notes || '–'}</p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); openEdit(bt); }} className="p-1.5 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(bt); }} className="p-1.5 rounded text-text-muted hover:text-loss transition-colors cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table — transparent wrapper (no bg-bg-secondary
                  card) so it sits on the app's black background, matching the
                  main journal's TradeTable instead of reading as a grey panel. */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-border-primary">
                      <SortableTh label="תאריך" col="date" sort={sort} onSort={toggleSort} />
                      <th className="text-right pb-2.5 font-medium">זוג</th>
                      <th className="text-right pb-2.5 font-medium">כיוון</th>
                      <th className="text-right pb-2.5 font-medium">טריגר</th>
                      <th className="text-right pb-2.5 font-medium">אסטרטגיה</th>
                      <th className="text-right pb-2.5 font-medium">TF</th>
                      <th className="text-right pb-2.5 font-medium">סשן</th>
                      <SortableTh label="Max R" col="maxR" tip="ה-R המקסימלי שהעסקה הגיעה אליו לפני הסגירה" sort={sort} onSort={toggleSort} />
                      <SortableTh label="Stop %" col="stopDistancePct" sort={sort} onSort={toggleSort} />
                      <SortableTh label="R Result" col="rResult" tip="תוצאת ה-R הסופית של העסקה" sort={sort} onSort={toggleSort} />
                      <th className="text-right pb-2.5 font-medium">Result</th>
                      <th className="text-right pb-2.5 font-medium">צ'ארט</th>
                      <th className="text-right pb-2.5 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFiltered.map((bt) => {
                      return (
                      <tr key={bt.id} className="border-b border-border-primary/50 hover:bg-bg-tertiary/50 transition-colors">
                        <td className="py-2.5 text-text-secondary text-xs whitespace-nowrap">
                          {bt.date ? formatDate(bt.date) : '–'}{bt.date && <span className="text-text-muted mr-1"> {formatTime(bt.date)}</span>}
                        </td>
                        <td className="py-2.5 text-text-primary font-medium"><span className="inline-flex items-center gap-1.5"><CoinIcon pair={bt.pair} className="w-4 h-4" />{bt.pair}</span></td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${bt.direction === 'long' ? 'text-long' : 'text-short'}`}>
                            {bt.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {bt.direction === 'long' ? 'Long' : 'Short'}
                          </span>
                        </td>
                        <td className="py-2.5 text-text-secondary text-xs max-w-[120px] truncate">{bt.trigger || '–'}</td>
                        <td className="py-2.5 text-text-secondary text-xs max-w-[100px] truncate">{bt.strategy || '–'}</td>
                        <td className="py-2.5 text-text-muted text-xs">{bt.timeframe || '–'}</td>
                        <td className="py-2.5">
                          {bt.session ? (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getSessionClasses(bt.session)}`}>
                              {bt.session}
                            </span>
                          ) : <span className="text-text-muted text-xs">–</span>}
                        </td>
                        <td className="py-2.5 text-text-primary text-xs">{bt.maxR ? `${bt.maxR.toFixed(1)}` : '–'}</td>
                        <td className="py-2.5 text-text-primary text-xs">{bt.stopDistancePct ? `${bt.stopDistancePct.toFixed(2)}%` : '–'}</td>
                        <td className={`py-2.5 text-xs font-medium ${(bt.rResult || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {bt.rResult != null ? `${bt.rResult >= 0 ? '+' : ''}${bt.rResult.toFixed(2)}R` : '–'}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            bt.result === 'win' ? 'bg-profit/10 text-profit' : bt.result === 'breakeven' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-loss/10 text-loss'
                          }`}>
                            {bt.result === 'win' ? 'Win' : bt.result === 'breakeven' ? 'BE' : 'Loss'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            {safeHttpUrl(bt.entryChartUrl) && (
                              <a href={safeHttpUrl(bt.entryChartUrl)} target="_blank" rel="noopener noreferrer"
                                className="text-accent-primary hover:underline text-xs flex items-center gap-0.5">
                                <ExternalLink className="w-3 h-3" />כניסה
                              </a>
                            )}
                            {safeHttpUrl(bt.managementChartUrl) && (
                              <a href={safeHttpUrl(bt.managementChartUrl)} target="_blank" rel="noopener noreferrer"
                                className="text-purple-400 hover:underline text-xs flex items-center gap-0.5">
                                <ExternalLink className="w-3 h-3" />ניהול
                              </a>
                            )}
                            {!safeHttpUrl(bt.entryChartUrl) && !safeHttpUrl(bt.managementChartUrl) && '–'}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(bt)} className="p-1 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(bt)} className="p-1 rounded text-text-muted hover:text-loss transition-colors cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Tab: Analytics — AI coach leads, then the detailed charts + tables. */}
      {tab === 'analytics' && (
        backtests.length === 0 ? (
          <EmptyState icon={FlaskConical} title="אין נתונים לניתוח" description="הוסף עסקאות בקטסט כדי לראות ניתוחים מתקדמים"
            actionLabel="עבור לרשומות" onAction={() => setTab('records')} />
        ) : (
          <div className="space-y-4">
            <BacktestAICoachPanel backtests={backtests} />
            <BacktestAnalytics backtests={backtests} period={period} />
          </div>
        )
      )}

      {/* Add/Edit Entry Modal */}
      <Modal isOpen={formOpen} onClose={() => { setFormOpen(false); setEditingId(null); }} title={editingId ? 'עריכת עסקה' : 'עסקת בקטסט חדשה'} maxWidth="max-w-5xl">
        <form onSubmit={handleSubmit}>
          <div className="md:grid md:grid-cols-2 md:gap-5 space-y-3 md:space-y-0">
            {/* Right Column */}
            <div className={`space-y-2 ${mobileStep !== 0 ? 'hidden' : ''} md:!block`}>
              <div className="grid grid-cols-2 gap-2">
                <PairSearch value={form.pair} onChange={(v) => update('pair', v)} label="זוג" />
                <StrategySelector
                  label="אסטרטגיה"
                  value={form.strategy}
                  onChange={(s) => update('strategy', s)}
                  strategies={allStrategies}
                  onAdd={addStrategy}
                  onRemove={removeStrategy}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>כיוון</label>
                  <div className="flex gap-1">
                    {['long', 'short'].map((d) => (
                      <button key={d} type="button" onClick={() => update('direction', d)}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          form.direction === d
                            ? d === 'long' ? 'bg-long/15 text-long border border-long/30' : 'bg-short/15 text-short border border-short/30'
                            : 'bg-bg-tertiary text-text-muted border border-transparent'
                        }`}>
                        {d === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {d === 'long' ? 'Long' : 'Short'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <TimeframeSelector
                    label="טווח זמן"
                    value={form.timeframe}
                    onChange={(tf) => update('timeframe', tf)}
                    timeframes={allTimeframes}
                    onAdd={addTimeframe}
                    onRemove={removeTimeframe}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>תאריך</label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : new Date()}
                    onChange={(date) => {
                      if (!date) return; // clearing the text field emits null
                      const prev = form.date ? new Date(form.date) : new Date();
                      date.setHours(prev.getHours(), prev.getMinutes());
                      update('date', date.toISOString());
                      const autoSession = getSessionFromDate(date);
                      if (autoSession) update('session', autoSession);
                    }}
                    dateFormat="dd/MM/yyyy"
                    className={inputClass}
                    popperPlacement="bottom-start"
                    portalId="datepicker-portal"
                  />
                </div>
                <div>
                  <label className={labelClass}>שעה</label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : new Date()}
                    onChange={(date) => {
                      if (!date) return; // clearing the text field emits null
                      const prev = form.date ? new Date(form.date) : new Date();
                      prev.setHours(date.getHours(), date.getMinutes());
                      update('date', prev.toISOString());
                      const autoSession = getSessionFromDate(prev);
                      if (autoSession) update('session', autoSession);
                    }}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={15}
                    timeFormat="HH:mm"
                    dateFormat="HH:mm"
                    className={inputClass}
                    popperPlacement="bottom-start"
                    portalId="datepicker-portal"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StrategySelector
                  label="טריגר כניסה"
                  value={form.trigger}
                  onChange={(t) => update('trigger', t)}
                  strategies={allTriggers}
                  onAdd={addTrigger}
                  onRemove={removeTrigger}
                  addLabel="טריגר מותאם"
                  inputPlaceholder="שם טריגר..."
                  emptyText="אין טריגרים"
                  placeholder="בחר טריגר..."
                />
                <div />
              </div>
              <div>
                <label className={labelClass}>סשן <span className="text-text-muted/60">(מתמלא אוטומטית)</span></label>
                <div className="flex gap-1.5 flex-wrap">
                  {SESSIONS.map((s) => (
                    <button key={s} type="button" onClick={() => update('session', form.session === s ? '' : s)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                        form.session === s ? getSessionClasses(s) : 'border-border-primary text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Left Column */}
            <div className={`space-y-2 ${mobileStep !== 1 ? 'hidden' : ''} md:!block`}>
              <div>
                <label className={labelClass}>תוצאה <span className="text-text-muted/60">(מתמלא אוטומטית)</span></label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => update('result', 'win')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${form.result === 'win' ? 'bg-profit/15 text-profit border border-profit/30' : 'bg-bg-tertiary text-text-muted border border-transparent'}`}>
                    Win
                  </button>
                  <button type="button" onClick={() => update('result', 'breakeven')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${form.result === 'breakeven' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' : 'bg-bg-tertiary text-text-muted border border-transparent'}`}>
                    BE
                  </button>
                  <button type="button" onClick={() => update('result', 'loss')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${form.result === 'loss' ? 'bg-loss/15 text-loss border border-loss/30' : 'bg-bg-tertiary text-text-muted border border-transparent'}`}>
                    Loss
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>R Result</label>
                  <input type="number" step="any" value={form.rResult} onChange={(e) => update('rResult', e.target.value)} className={inputClass} placeholder="1.2" />
                </div>
                <div>
                  <label className={labelClass}>Max R</label>
                  <input type="number" step="any" value={form.maxR} onChange={(e) => update('maxR', e.target.value)} className={inputClass} placeholder="5.7" />
                </div>
                <div>
                  <label className={labelClass}>Stop Distance %</label>
                  <input type="number" step="any" value={form.stopDistancePct} onChange={(e) => update('stopDistancePct', e.target.value)} className={inputClass} placeholder="0.90" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>לינק צ'ארט כניסה</label>
                  <input type="url" value={form.entryChartUrl} onChange={(e) => update('entryChartUrl', e.target.value)} className={inputClass} placeholder="https://tradingview.com/..." />
                </div>
                <div>
                  <label className={labelClass}>לינק צ'ארט ניהול</label>
                  <input type="url" value={form.managementChartUrl} onChange={(e) => update('managementChartUrl', e.target.value)} className={inputClass} placeholder="https://tradingview.com/..." />
                </div>
              </div>
              <div>
                <label className={labelClass}>הערות</label>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} h-14 resize-none`} placeholder="תובנות..." />
              </div>
            </div>
          </div>

          {/* Mobile step navigation */}
          <div className="flex items-center justify-between pt-4 md:hidden">
            <button type="button" onClick={() => setMobileStep((s) => s - 1)} disabled={mobileStep === 0}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-bg-tertiary text-text-primary text-sm font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default">
              <ChevronRight className="w-4 h-4" /> הקודם
            </button>
            <div className="flex items-center gap-1.5">
              {[0, 1].map((i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === mobileStep ? 'bg-accent-primary' : 'bg-bg-tertiary'}`} />
              ))}
            </div>
            {mobileStep < 1 ? (
              <button type="button" onClick={() => setMobileStep((s) => s + 1)}
                className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-accent-primary text-black text-sm font-semibold transition-colors cursor-pointer">
                הבא <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <button type="submit" disabled={saving}
                className="px-4 py-2.5 rounded-lg bg-accent-primary text-black text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50">
                {saving ? 'שומר...' : editingId ? 'עדכן עסקה' : 'הוסף עסקה'}
              </button>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex gap-3 pt-3">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="flex-1 py-2.5 rounded-lg bg-bg-tertiary text-text-primary hover:bg-border-hover transition-colors cursor-pointer">ביטול</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-accent-primary text-black font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50">{saving ? 'שומר...' : editingId ? 'עדכן עסקה' : 'הוסף עסקה'}</button>
          </div>
        </form>
      </Modal>

      <BacktestSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="מחיקת עסקה" message="למחוק את העסקה? לא ניתן לבטל פעולה זו." />

      <StrategyView isOpen={viewOpen} onClose={() => setViewOpen(false)} journal={activeJournal} />
    </motion.div>
  );
}
