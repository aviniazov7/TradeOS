import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Crown, Lock, Search, ShieldCheck, Info, ArrowDownUp, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePolymarketLeaderboard } from '../../hooks/usePolymarketLeaderboard';
import { useCountUp } from '../../hooks/useCountUp';
import WalletDetailModal from './WalletDetailModal';
import ScoreRing from './ScoreRing';
import { fmtUsd, fmtPct, shortWallet, roiPct } from '../../utils/polymarketScore';
import { pageVariants, pageTransition, staggerContainer, staggerItem } from '../../utils/animations';

const SORTS = [
  { key: 'score', label: 'ציון חכם' },
  { key: 'pnl', label: 'רווח' },
  { key: 'roi', label: 'יעילות (ROI)' },
  { key: 'volume', label: 'מחזור' },
];

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Subtle rotating radar sweep behind the hero — the page IS a "מכ״ם" (radar).
function RadarSweep() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <motion.div
        className="absolute right-[-20%] top-1/2 -translate-y-1/2 w-[420px] h-[420px]"
        style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(56,189,248,0.10) 38deg, transparent 76deg)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute right-8 top-1/2 -translate-y-1/2 w-44 h-44 rounded-full border border-white/[0.06]" />
      <div className="absolute right-8 top-1/2 -translate-y-1/2 w-28 h-28 rounded-full border border-white/[0.06] translate-x-8" />
    </div>
  );
}

function HeroTile({ value, label, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'accent' ? 'text-accent-primary' : 'text-white';
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-3 py-2.5 transition-all duration-200 hover:border-accent-primary/40 hover:-translate-y-0.5 hover:shadow-[0_0_22px_-8px_rgba(56,189,248,0.6)]">
      <div className={`text-base font-extrabold num-mono leading-none ${color}`}>{value}</div>
      <div className="text-[10px] text-white/50 mt-1.5">{label}</div>
    </div>
  );
}

function Hero({ stats }) {
  const count = useCountUp(stats?.count ?? 0);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050609] p-5 mb-5">
      <RadarSweep />
      <div className="relative flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-accent-primary"
          style={{ background: 'linear-gradient(145deg, rgba(56,189,248,0.2), transparent)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.32), 0 0 24px -6px rgba(56,189,248,0.6)' }}>
          <Crosshair className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-white">מכ״ם כסף חכם · Polymarket</h1>
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold"><Crown className="w-2.5 h-2.5" /> Premium</span>
          </div>
          <p className="text-xs text-white/60 leading-relaxed mt-1">
            מי באמת מרוויח ב-Polymarket — דירוג לפי יעילות (רווח לכל $ מחזור), לא רק רווח גולמי. דאטה ציבורי, 30 יום.
          </p>
        </div>
      </div>
      {stats && (
        <div className="relative grid grid-cols-3 gap-2 mt-4">
          <HeroTile value={fmtUsd(stats.topPnl)} label="הרווח המוביל" tone="profit" />
          <HeroTile value={count} label="ארנקים כשירים" />
          <HeroTile value={fmtPct(stats.medianRoi)} label="ROI חציוני" tone="accent" />
        </div>
      )}
    </div>
  );
}

function WalletRow({ r, rank, onClick }) {
  const name = r.name || shortWallet(r.wallet);
  const isTop = rank === 1;
  const isPodium = rank <= 3;
  return (
    <button onClick={onClick}
      className={`group relative w-full flex items-center gap-3 bg-bg-secondary border text-right cursor-pointer transition-colors overflow-hidden ${
        isTop ? 'px-4 py-3.5 rounded-2xl border-amber-400/30' : 'px-3 py-2.5 rounded-xl border-border-primary hover:border-accent-primary/40'
      }`}>
      {isTop && <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 100% at 100% 0%, rgba(245,158,11,0.10), transparent 60%)' }} />}

      {/* rank marker */}
      {isPodium ? (
        <span className={`relative flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${isTop ? 'bg-amber-400/15 border border-amber-400/40' : 'bg-text-secondary/10 border border-text-secondary/25'}`}>
          {isTop ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <span className="text-[11px] font-extrabold num-mono text-text-secondary">{rank}</span>}
        </span>
      ) : (
        <span className="w-6 text-center text-xs font-bold text-text-muted num-mono shrink-0">{rank}</span>
      )}

      <ScoreRing score={r.smartScore} size={isTop ? 'lg' : 'md'} />

      {r.profileImage
        ? <img src={r.profileImage} alt="" className={`rounded-full object-cover shrink-0 ${isTop ? 'w-10 h-10' : 'w-8 h-8'}`} loading="lazy" />
        : <div className={`rounded-full bg-bg-tertiary shrink-0 ${isTop ? 'w-10 h-10' : 'w-8 h-8'}`} />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold text-text-primary truncate ${isTop ? 'text-base' : 'text-sm'}`}>{name}</span>
          {r.verified && <ShieldCheck className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
        </div>
        {r.smartScore != null ? (
          <div className="flex items-center gap-1.5 mt-1">
            {/* why this wallet ranks: purple = size, accent = efficiency; filled = score */}
            <div className="h-1 rounded-full overflow-hidden flex w-24 bg-bg-tertiary" title="הרכב הציון: גודל מול יעילות">
              <div className="h-full bg-purple-500" style={{ width: `${r.sizeShare * 50}%` }} />
              <div className="h-full bg-accent-primary" style={{ width: `${r.effShare * 50}%` }} />
            </div>
            <span className="text-[9px] text-text-muted num-mono" dir="ltr">{shortWallet(r.wallet)}</span>
          </div>
        ) : (
          <span className="text-[10px] text-text-muted num-mono" dir="ltr">{shortWallet(r.wallet)}</span>
        )}
      </div>

      <div className="relative text-left shrink-0">
        <div className={`font-extrabold num-mono ${r.pnl >= 0 ? 'text-profit' : 'text-loss'} ${isTop ? 'text-base' : 'text-sm'}`}>{fmtUsd(r.pnl)}</div>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className={`text-[11px] font-bold num-mono ${r.roi >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtPct(r.roi)}</span>
          <span className="text-[10px] text-text-muted num-mono">· {fmtUsd(r.volume)}</span>
        </div>
      </div>
    </button>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary animate-pulse">
      <span className="w-6 h-6 rounded-full bg-bg-tertiary shrink-0" />
      <span className="w-9 h-9 rounded-full bg-bg-tertiary shrink-0" />
      <span className="w-8 h-8 rounded-full bg-bg-tertiary shrink-0" />
      <div className="flex-1"><div className="h-3 w-28 bg-bg-tertiary rounded" /><div className="h-2 w-20 bg-bg-tertiary rounded mt-1.5" /></div>
      <div className="h-4 w-16 bg-bg-tertiary rounded" />
    </div>
  );
}

// Non-premium teaser — page is visible in the menu, content is Premium. The
// data hook never mounts for non-premium (see PolymarketPage), so nothing leaks.
function LockedTeaser() {
  const navigate = useNavigate();
  return (
    <div className="relative rounded-2xl border border-border-primary overflow-hidden">
      <div className="space-y-2 p-3 blur-sm select-none pointer-events-none" aria-hidden="true">
        {[92, 81, 74, 66, 59].map((s, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary">
            <span className="w-9 h-9 rounded-full bg-accent-primary/15" />
            <div className="w-8 h-8 rounded-full bg-bg-tertiary" />
            <div className="flex-1"><div className="h-3 w-28 bg-bg-tertiary rounded" /><div className="h-2 w-20 bg-bg-tertiary rounded mt-1.5" /></div>
            <div className="h-4 w-16 bg-bg-tertiary rounded" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-primary/40 backdrop-blur-[2px] text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
          <Lock className="w-7 h-7 text-accent-primary" />
        </div>
        <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
          תוכן Premium <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold"><Crown className="w-2.5 h-2.5" /> Premium</span>
        </h2>
        <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
          מכ״ם הכסף החכם עוקב אחרי הארנקים הרווחיים ב-Polymarket ומדרג אותם לפי יעילות אמיתית — לא רק רווח גולמי.
        </p>
        <button onClick={() => navigate('/premium')}
          className="px-5 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer">
          שדרג ל-Premium
        </button>
      </div>
    </div>
  );
}

// The live board — only mounted for premium users, so the leaderboard is never
// fetched or scored for non-premium (the scoring is the paid deliverable).
function PolymarketBoard() {
  const { rows, loading, error, refetch } = usePolymarketLeaderboard('overall');
  const [sort, setSort] = useState('score');
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [selected, setSelected] = useState(null);

  const stats = useMemo(() => {
    const elig = rows.filter((r) => r.eligible);
    return {
      count: elig.length,
      topPnl: rows.length ? Math.max(...rows.map((r) => r.pnl)) : 0,
      medianRoi: median(elig.map((r) => roiPct(r))),
    };
  }, [rows]);

  const view = useMemo(() => {
    let list = rows;
    if (eligibleOnly) list = list.filter((r) => r.eligible);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.name || '').toLowerCase().includes(q) || (r.wallet || '').toLowerCase().includes(q));
    const val = (r) => (sort === 'score' ? (r.smartScore ?? -1) : sort === 'pnl' ? r.pnl : sort === 'roi' ? r.roi : r.volume);
    return [...list].sort((a, b) => val(b) - val(a));
  }, [rows, eligibleOnly, query, sort]);

  const hasData = !loading && !error && rows.length > 0;

  return (
    <>
      <Hero stats={hasData ? stats : null} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-3 py-2 flex-1 min-w-[180px] focus-within:border-accent-primary/50 transition-colors">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ארנק (שם או כתובת)…"
            className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full" />
        </div>
        <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={() => setEligibleOnly((v) => !v)}
          title="הצג רק ארנקים שעברו את סף הכשירות (מחזור מספק, רווח חיובי)"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${eligibleOnly ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'text-text-muted border-border-primary'}`}>
          <ArrowDownUp className="w-3 h-3" /> כשירים בלבד
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}</div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10 rounded-2xl border border-loss/25 bg-loss/5 text-center">
          <AlertCircle className="w-6 h-6 text-loss" />
          <p className="text-sm text-text-secondary max-w-xs">{error}</p>
          <button onClick={refetch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-xs font-semibold text-text-primary hover:text-accent-primary transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> נסה שוב
          </button>
        </div>
      ) : view.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border border-dashed border-border-primary text-text-muted">
          <Search className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">לא נמצאו ארנקים בסינון הזה</span>
          {(query || eligibleOnly) && (
            <button onClick={() => { setQuery(''); setEligibleOnly(false); }}
              className="text-[11px] font-semibold text-accent-primary hover:text-accent-hover transition-colors cursor-pointer">
              נקה סינון
            </button>
          )}
        </div>
      ) : (
        <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
          {view.map((r, i) => (
            <motion.div key={r.wallet} variants={staggerItem}>
              <WalletRow r={r} rank={i + 1} onClick={() => setSelected(r)} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 mt-5 p-3 rounded-xl bg-bg-secondary/60 border border-border-primary text-[11px] text-text-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          כלי אנליטיקה על דאטה ציבורי של Polymarket — לא ייעוץ פיננסי. מעקב אחרי טריידרים אחרים לא מבטיח רווח (הם טועים, הדאטה מגיעה באיחור, והנזילות שלהם שונה משלך).
          הציון מקדים ומבוסס על רווח + יעילות (30 יום); שיעור-הצלחה ועקביות יתווספו בהמשך.
        </p>
      </div>

      <WalletDetailModal walletRow={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </>
  );
}

// Polymarket Money Radar — a smart-money leaderboard over public Polymarket
// data. Ranks wallets by a preliminary efficiency score (PnL × ROI), not raw
// PnL, so luck is separated from skill. Read-only, no trading, no keys.
export default function PolymarketPage() {
  const { isPremium } = useAuth();
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-4xl mx-auto">
      {isPremium ? (
        <PolymarketBoard />
      ) : (
        <>
          <Hero stats={null} />
          <LockedTeaser />
        </>
      )}
    </motion.div>
  );
}
