import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Crown, Lock, Search, ShieldCheck, Info, ArrowDownUp, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePolymarketLeaderboard } from '../../hooks/usePolymarketLeaderboard';
import WalletDetailModal from './WalletDetailModal';
import { fmtUsd, fmtPct, shortWallet, roiPct } from '../../utils/polymarketScore';
import { pageVariants, pageTransition } from '../../utils/animations';

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

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-[10px] text-text-muted">—</span>;
  const tone = score >= 75 ? 'text-profit border-profit/40 bg-profit/10'
    : score >= 50 ? 'text-accent-primary border-accent-primary/40 bg-accent-primary/10'
    : 'text-text-secondary border-border-primary bg-bg-tertiary';
  return <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm font-extrabold num-mono ${tone}`}>{score}</span>;
}

function WalletRow({ r, rank, onClick }) {
  const name = r.name || shortWallet(r.wallet);
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary hover:border-accent-primary/40 transition-colors text-right cursor-pointer">
      <span className="text-xs font-bold text-text-muted num-mono w-5 shrink-0 text-center">{rank}</span>
      <ScoreBadge score={r.smartScore} />
      {r.profileImage
        ? <img src={r.profileImage} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />
        : <div className="w-8 h-8 rounded-full bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-text-primary truncate">{name}</span>
          {r.verified && <ShieldCheck className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
        </div>
        <span className="text-[10px] text-text-muted num-mono" dir="ltr">{shortWallet(r.wallet)}</span>
      </div>
      <div className="text-left shrink-0">
        <div className={`text-sm font-extrabold num-mono ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(r.pnl)}</div>
        <div className="text-[10px] num-mono text-text-muted">ROI {fmtPct(r.roi)} · {fmtUsd(r.volume)}</div>
      </div>
    </button>
  );
}

// Non-premium teaser — the page is visible in the menu, but the content is
// Premium: blurred sample behind a lock + upgrade CTA (no real data leaks).
function LockedTeaser() {
  const navigate = useNavigate();
  return (
    <div className="relative rounded-2xl border border-border-primary overflow-hidden">
      <div className="space-y-2 p-3 blur-sm select-none pointer-events-none" aria-hidden="true">
        {[92, 81, 74, 66, 59].map((s, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary">
            <span className="w-9 h-9 rounded-xl bg-accent-primary/15" />
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

// Polymarket Money Radar — a smart-money leaderboard over public Polymarket
// data. Ranks wallets by a preliminary efficiency score (PnL × ROI), not raw
// PnL, so luck is separated from skill. Read-only, no trading, no keys.
export default function PolymarketPage() {
  const { isPremium } = useAuth();
  const { rows, loading, error } = usePolymarketLeaderboard('overall');
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

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border-primary bg-[#050609] p-5 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-accent-primary/15 border border-accent-primary/40 flex items-center justify-center shrink-0">
            <Crosshair className="w-6 h-6 text-accent-primary" />
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
        {isPremium && !loading && !error && rows.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-center">
              <div className="text-sm font-extrabold num-mono text-profit">{fmtUsd(stats.topPnl)}</div>
              <div className="text-[10px] text-white/50 mt-0.5">הרווח המוביל</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-center">
              <div className="text-sm font-extrabold num-mono text-white">{stats.count}</div>
              <div className="text-[10px] text-white/50 mt-0.5">ארנקים כשירים</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-center">
              <div className="text-sm font-extrabold num-mono text-accent-primary">{fmtPct(stats.medianRoi)}</div>
              <div className="text-[10px] text-white/50 mt-0.5">ROI חציוני</div>
            </div>
          </div>
        )}
      </div>

      {!isPremium ? (
        <LockedTeaser />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl px-3 py-2 flex-1 min-w-[180px] focus-within:border-accent-primary/50 transition-colors">
              <Search className="w-4 h-4 text-text-muted shrink-0" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ארנק (שם או כתובת)…"
                className="bg-transparent text-sm text-text-primary placeholder-text-muted outline-none w-full" />
            </div>
            <div className="inline-flex bg-bg-secondary border border-border-primary rounded-xl p-1 gap-0.5 overflow-x-auto">
              {SORTS.map((s) => (
                <button key={s.key} onClick={() => setSort(s.key)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${sort === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <button onClick={() => setEligibleOnly((v) => !v)}
              title="הצג רק ארנקים שעברו את סף הכשירות (מחזור מספק, רווח חיובי)"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer ${eligibleOnly ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'text-text-muted border-border-primary'}`}>
              <ArrowDownUp className="w-3 h-3" /> כשירים בלבד
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-loss"><AlertCircle className="w-4 h-4" />{error}</div>
          ) : view.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">לא נמצאו ארנקים בסינון הזה</div>
          ) : (
            <div className="space-y-2">
              {view.map((r, i) => <WalletRow key={r.wallet} r={r} rank={i + 1} onClick={() => setSelected(r)} />)}
            </div>
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
      )}
    </motion.div>
  );
}
