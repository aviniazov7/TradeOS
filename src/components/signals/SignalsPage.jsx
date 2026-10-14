import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { Plus, Radar, Flag, Zap, Timer, HelpCircle, Activity, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSignals } from '../../hooks/useSignals';
import { useWyckoffSetups } from '../../hooks/useWyckoffSetups';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import PageHeader from '../shared/PageHeader';
import StatTile from '../shared/StatTile';
import TabStrip from '../shared/TabStrip';
import ConfirmDialog from '../shared/ConfirmDialog';
import { headerIconBtn, headerPrimaryBtn } from '../shared/headerStyles';
import ScannerWatchlist from './ScannerWatchlist';
import ScannerHowItWorks from './ScannerHowItWorks';
import ScannerCalibration from './ScannerCalibration';
import SetupsDatabase from './SetupsDatabase';
import SignalCard from './SignalCard';
import SignalForm from './SignalForm';
import { signalToSetup, MAX_SCAN_TAGS } from '../../utils/wyckoff';
import { safeDate, formatRelativeTime, formatDateTime } from '../../utils/formatters';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';

// Status filters for the setups list.
const FILTERS = [
  { key: 'all',     label: 'הכל' },
  { key: 'waiting', label: 'ממתין' },
  { key: 'active',  label: 'פעיל' },
  { key: 'closed',  label: 'הושלם' },
];

// The page's two views; the view lives in the URL (?tab=training).
const VIEWS = ['setups', 'training'];

// The cron worker runs every 10 minutes (worker/wrangler.toml "*/10 * * * *").
const SCAN_CYCLE_MIN = 10;

const HOWTO_KEY = 'tradeos.scanner.howtoDismissed';
function readHowToDismissed() {
  try { return localStorage.getItem(HOWTO_KEY) === '1'; } catch { return false; }
}
function writeHowToDismissed() {
  try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* blocked storage — it just shows again next visit */ }
}

function getCoinFromPair(pair = '') {
  return pair.replace(/USDT$|BUSD$|USDC$|USD$/, '').toUpperCase();
}

// Minutes until the next scheduled cron tick (cron fires on the UTC 10-minute
// marks). Schedule-based: it is when the engine is due, not a scan receipt.
function minutesToNextScan(now) {
  const cycle = SCAN_CYCLE_MIN * 60;
  const rem = cycle - (Math.floor(now / 1000) % cycle);
  return Math.max(1, Math.ceil(rem / 60));
}

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-profit/30 bg-profit/10 text-profit" title="המנוע רץ בצד השרת כל 10 דקות">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
      </span>
      פעיל
    </span>
  );
}

function StatusRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border-primary/60 last:border-b-0">
      <dt className="text-[12px] text-text-muted shrink-0">{label}</dt>
      <dd className="text-[12px] text-text-primary text-left min-w-0">{children}</dd>
    </div>
  );
}

// Side panel: what the engine does and how well it has done so far.
function EngineStatus({ nextScanMin, precision, judged, onOpenTraining }) {
  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-primary">
        <Activity className="w-4 h-4 text-accent-primary shrink-0" />
        <h2 className="text-sm font-bold text-text-primary flex-1">מצב המנוע</h2>
        <LiveBadge />
      </div>
      <dl className="px-4 py-1">
        <StatusRow label="מחזור סריקה">כל {SCAN_CYCLE_MIN} דק׳ · בצד השרת</StatusRow>
        <StatusRow label="סריקה הבאה">בעוד <span className="num-mono">{nextScanMin}</span> דק׳</StatusRow>
        <StatusRow label="טיימפריימים">
          <span className="inline-flex gap-1" dir="ltr">
            {['30m', '4h', '1D'].map((tf) => (
              <span key={tf} className="num-mono text-[10.5px] px-1.5 py-px rounded-md bg-bg-tertiary border border-border-primary text-text-secondary">{tf}</span>
            ))}
          </span>
        </StatusRow>
        <StatusRow label="דיוק לפי המאגר">
          {precision != null
            ? <span><span className="num-mono font-bold text-accent-primary">{precision}%</span> <span className="text-text-muted">· {judged} מסומנים</span></span>
            : <span className="text-text-muted">אין עדיין סימונים</span>}
        </StatusRow>
      </dl>
      <button
        type="button"
        onClick={onOpenTraining}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border-primary text-[12px] font-semibold text-accent-primary hover:bg-bg-tertiary rounded-b-2xl transition-colors cursor-pointer"
      >
        כיול ואימון
        <ChevronLeft className="w-4 h-4" />
      </button>
    </section>
  );
}

// The Wyckoff scanner console. Setups the engine found are the main column;
// the scan universe (tagged coins) and the engine's status sit beside it.
// Calibration and the training DB are their own view.
export default function SignalsPage() {
  const { signals, loading, addSignal, updateSignal, deleteSignal } = useSignals();
  const { setups, loading: setupsLoading, addSetup, updateSetup, deleteSetup } = useWyckoffSetups();
  const { items: watchItems } = useWatchlist();
  const { prices } = useCryptoPrices();
  const taggedCount = watchItems.filter((i) => i.bias === 'long' || i.bias === 'short').length;

  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'setups';
  const setView = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === 'setups') next.delete('tab'); else next.set('tab', id);
    return next;
  }, { replace: true });

  const [tab, setTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSignal, setEditingSignal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [howToOpen, setHowToOpen] = useState(() => !readHowToDismissed());
  const now = useNow(15_000);

  const filtered = tab === 'all' ? signals : signals.filter((s) => s.status === tab);
  const counts = {
    all: signals.length,
    waiting: signals.filter((s) => s.status === 'waiting').length,
    active:  signals.filter((s) => s.status === 'active').length,
    closed:  signals.filter((s) => s.status === 'closed').length,
  };

  // Newest engine detection (scanner-sourced signal).
  const lastFound = useMemo(() => {
    let best = null;
    for (const s of signals) {
      if (s.source !== 'scanner') continue;
      const d = safeDate(s.createdAt);
      if (d && (!best || d > best)) best = d;
    }
    return best;
  }, [signals]);

  // Engine precision against the owner's verdicts — same rule as the training
  // DB panel (label !== 'invalid' counts as valid).
  const precision = useMemo(() => {
    const scanner = setups.filter((s) => s.source === 'scanner');
    const valid = scanner.filter((s) => s.label !== 'invalid').length;
    const judged = valid + scanner.filter((s) => s.label === 'invalid').length;
    return { judged, pct: judged ? Math.round((valid / judged) * 100) : null };
  }, [setups]);

  const nextScanMin = minutesToNextScan(now);

  const openNew = () => { setEditingSignal(null); setFormOpen(true); };
  const dismissHowTo = () => { setHowToOpen(false); writeHowToDismissed(); };
  const toggleHowTo = () => {
    if (view !== 'setups') { setView('setups'); setHowToOpen(true); return; }
    setHowToOpen((v) => !v);
  };

  const handleSave = async (data) => {
    try {
      if (editingSignal) {
        await updateSignal(editingSignal.id, data);
        toast.success('הסטאפ עודכן');
      } else {
        await addSignal(data);
        toast.success('הסטאפ נוסף');
      }
      setFormOpen(false);
      setEditingSignal(null);
    } catch {
      toast.error('שגיאה בשמירה');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSignal(deleteTarget);
      toast.success('הסטאפ נמחק');
      setDeleteTarget(null);
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateSignal(id, { status });
      toast.success(status === 'active' ? 'הסטאפ הופעל' : 'הסטאפ עודכן');
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  // Feedback loop: valid/invalid on a detected setup → ground-truth DB, no
  // retyping. Dedup by signalId (one training row per signal; re-clicking
  // updates it), and stamp the verdict back on the signal so the card stays
  // highlighted.
  const handleLabel = async (signal, label) => {
    try {
      const existing = setups.find((s) => s.signalId === signal.id);
      const payload = signalToSetup(signal, label);
      if (existing) await updateSetup(existing.id, payload);
      else await addSetup(payload);
      await updateSignal(signal.id, { labeled: label });
      toast.success(label === 'valid' ? 'נשמר לאימון כתקין' : 'נשמר לאימון כלא תקין');
    } catch {
      toast.error('שגיאה בתיוג');
    }
  };

  const handleSetupDelete = async (id) => {
    try {
      await deleteSetup(id);
      toast.success('הסטאפ נמחק מהמאגר');
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const filterTabs = FILTERS.map((f) => ({ id: f.key, label: f.label, count: counts[f.key] }));
  const filterLabel = FILTERS.find((f) => f.key === tab)?.label;

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={Radar}
        title="מנוע ויקוף"
        titleAside={<LiveBadge />}
        subtitle="זיהוי אוטומטי של LPS / LPSY על שלושה טיימפריימים"
        tabs={{
          tabs: [
            { id: 'setups', label: 'סטאפים', count: signals.length },
            { id: 'training', label: 'כיול ואימון', mobileLabel: 'כיול', count: setups.length },
          ],
          value: view,
          onChange: setView,
          layoutKey: 'scanner-view',
        }}
        actions={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={toggleHowTo}
              className={`${headerIconBtn} ${howToOpen && view === 'setups' ? 'text-accent-primary border-accent-primary/40' : ''}`}
              title="איך זה עובד"
              aria-label="איך זה עובד"
              aria-pressed={howToOpen && view === 'setups'}
            >
              <HelpCircle className="w-[18px] h-[18px]" />
            </button>
            <button type="button" onClick={openNew} className={`${headerPrimaryBtn} flex-1 sm:flex-none`} title="הוסף סטאפ שהמנוע פספס — למעקב חי">
              <Plus className="w-4 h-4" /> הוסף סטאפ
            </button>
          </div>
        )}
      />

      {/* Live status strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6">
        <StatTile icon={Flag} label="מטבעות בסריקה" value={`${taggedCount}/${MAX_SCAN_TAGS}`} sub={`${watchItems.length} במעקב`} />
        <StatTile icon={Zap} label="סטאפים פעילים" value={String(counts.active)} tone={counts.active ? 'text-accent-primary' : 'text-text-primary'} sub={`${counts.waiting} ממתינים`} />
        <StatTile
          icon={Radar}
          label="אותר לאחרונה"
          value={lastFound ? formatRelativeTime(lastFound) : '—'}
          mono={false}
          title={lastFound ? formatDateTime(lastFound) : undefined}
          sub={lastFound ? formatDateTime(lastFound) : 'עדיין לא אותר סטאפ'}
        />
        <StatTile icon={Timer} label="סריקה הבאה" value={`${nextScanMin} דק׳`} mono={false} sub={`מחזור של ${SCAN_CYCLE_MIN} דק׳`} />
      </div>

      {/* ── Setups view: console ── */}
      <div className={view === 'setups' ? 'space-y-4' : 'hidden'}>
        {howToOpen && <ScannerHowItWorks onDismiss={dismissHowTo} />}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* Side: scan universe + engine. First in the DOM so on phones the
              (collapsed) watchlist sits above the results. */}
          <aside className="space-y-4 min-w-0">
            <ScannerWatchlist />
            <div className="hidden xl:block">
              <EngineStatus
                nextScanMin={nextScanMin}
                precision={precision.pct}
                judged={precision.judged}
                onOpenTraining={() => setView('training')}
              />
            </div>
          </aside>

          {/* Main: setups the engine found */}
          <section className="min-w-0" aria-label="סטאפים שנמצאו">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0 rounded-xl bg-bg-tertiary border border-border-primary p-1">
                <div className="hidden sm:block"><TabStrip tabs={filterTabs} value={tab} onChange={setTab} variant="desktop" layoutKey="scanner-filter" /></div>
                <div className="sm:hidden"><TabStrip tabs={filterTabs} value={tab} onChange={setTab} variant="mobile" layoutKey="scanner-filter" /></div>
              </div>
              <span className="hidden md:inline text-[11px] text-text-muted shrink-0">
                <span className="num-mono">{filtered.length}</span> סטאפים
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-bg-secondary border border-border-primary rounded-2xl h-72 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-border-primary bg-bg-secondary px-6 py-12 text-center">
                <span className="mx-auto mb-3 w-11 h-11 rounded-xl bg-accent-primary/12 border border-accent-primary/20 grid place-items-center">
                  <Radar className="w-5 h-5 text-accent-primary" />
                </span>
                <h3 className="text-sm font-bold text-text-primary">
                  {tab === 'all' ? 'אין סטאפים עדיין' : `אין סטאפים בסטטוס ${filterLabel}`}
                </h3>
                <p className="text-[12px] text-text-muted mt-1 max-w-xs mx-auto leading-relaxed">
                  {tab !== 'all'
                    ? 'בחר סינון אחר כדי לראות סטאפים נוספים.'
                    : taggedCount === 0
                      ? 'תייג מטבע לונג או שורט ברשימת המעקב כדי להתחיל לסרוק.'
                      : `המנוע סורק ${taggedCount} מטבעות. סטאפ יופיע כאן כשיושלם מבנה ויקוף.`}
                </p>
              </div>
            ) : (
              <m.div
                className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {filtered.map((signal) => {
                  const coin = getCoinFromPair(signal.pair);
                  const currentPrice = prices[coin]?.price ?? null;
                  return (
                    <m.div key={signal.id} className="min-w-0">
                      <SignalCard
                        signal={signal}
                        currentPrice={currentPrice}
                        onEdit={(s) => { setEditingSignal(s); setFormOpen(true); }}
                        onDelete={setDeleteTarget}
                        onStatusChange={handleStatusChange}
                        onLabel={handleLabel}
                      />
                    </m.div>
                  );
                })}
              </m.div>
            )}
          </section>
        </div>
      </div>

      {/* ── Training view: calibration + ground-truth DB. Kept mounted (hidden)
          so an unsaved calibration survives a tab switch. ── */}
      <div className={view === 'training' ? 'grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start' : 'hidden'}>
        <ScannerCalibration setups={setups} />
        <SetupsDatabase
          setups={setups}
          loading={setupsLoading}
          onAdd={addSetup}
          onUpdate={updateSetup}
          onDelete={handleSetupDelete}
        />
      </div>

      <SignalForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingSignal(null); }}
        signal={editingSignal}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת סטאפ"
        message="למחוק את הסטאפ? לא ניתן לבטל פעולה זו."
      />
    </m.div>
  );
}
