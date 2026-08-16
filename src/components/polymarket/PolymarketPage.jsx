import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy, Crown, Lock, Search, ShieldCheck, Info, ArrowDownUp, AlertCircle, RefreshCw, Star, ChevronDown, Users, Globe, Waves, Compass, UserRoundSearch, Gem, Download, GraduationCap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { usePolymarketLeaderboard } from '../../hooks/usePolymarketLeaderboard';
import { usePolymarketWatch } from '../../hooks/usePolymarketWatch';
import { usePolymarketStrategies } from '../../hooks/usePolymarketStrategies';
import { useSmartConsensus } from '../../hooks/useSmartConsensus';
import { useCountUp } from '../../hooks/useCountUp';
import ScoreRing from './ScoreRing';
import MarketsExplorer from './MarketsExplorer';
import WhaleRadar from './WhaleRadar';
import StrategyModal from './StrategyModal';
import PersonalAnalystModal from './PersonalAnalystModal';
import SmartConsensus from './SmartConsensus';
import WatchedWalletsModal from './WatchedWalletsModal';
import AcademyModal from './AcademyModal';
import { fmtUsd, fmtPct, shortWallet, roiPct } from '../../utils/polymarketScore';
import { downloadCsv, stampedName } from '../../utils/csv';
import { pageVariants, pageTransition, staggerContainer, staggerItem } from '../../utils/animations';

const SORTS = [
  { key: 'score', label: 'ציון' },
  { key: 'pnl', label: 'רווח' },
  { key: 'roi', label: 'יעילות (ROI)' },
  { key: 'volume', label: 'מחזור' },
];

// Lookup instead of a nested ternary — keeps the sort memo compilable.
const SORT_VALUE = {
  score: (r) => r.smartScore ?? -1,
  pnl: (r) => r.pnl,
  roi: (r) => r.roi,
  volume: (r) => r.volume,
};

// Verified live: the leaderboard `category` param returns data only for these
// slugs (others — e.g. business, world, gaming — come back empty).
const CATEGORIES = [
  { key: 'overall', label: 'כל הנושאים' },
  { key: 'crypto', label: 'קריפטו' },
  { key: 'politics', label: 'פוליטיקה' },
  { key: 'sports', label: 'ספורט' },
  { key: 'esports', label: 'Esports' },
  { key: 'finance', label: 'פיננסים' },
  { key: 'tech', label: 'טכנולוגיה' },
  { key: 'culture', label: 'תרבות' },
  { key: 'weather', label: 'מזג אוויר' },
  { key: 'mentions', label: 'אזכורים' },
];

// Rank medals — a premium leaderboard convention (gold / silver / bronze) that
// reads as ranking, not as a second theme color. Everything interactive stays
// on the app's accent.
const MEDAL = {
  1: { card: 'border-amber-400/40', badge: 'bg-amber-400/15 text-amber-300 border-amber-400/40', glow: 'radial-gradient(100% 80% at 50% 0%, rgba(251,191,36,0.13), transparent 60%)' },
  2: { card: 'border-slate-300/25', badge: 'bg-slate-300/10 text-slate-300 border-slate-300/30', glow: null },
  3: { card: 'border-orange-400/25', badge: 'bg-orange-400/10 text-orange-400 border-orange-400/30', glow: null },
};

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function HeroTile({ value, label, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'accent' ? 'text-accent-primary' : '';
  return (
    <div className="rounded-xl px-3 py-2.5 border transition-colors hover:border-accent-primary/40" style={{ background: 'var(--pm-hero-tile)', borderColor: 'var(--pm-hero-line)' }}>
      <div className={`text-base font-extrabold num-mono leading-none ${color}`} style={color ? undefined : { color: 'var(--pm-hero-fg)' }}>{value}</div>
      <div className="text-[10px] mt-1.5" style={{ color: 'var(--pm-hero-fg-faint)' }}>{label}</div>
    </div>
  );
}

// Hero action — an icon button that sits on the title row and opens a modal.
function HeroAction({ icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border hover:text-accent-primary hover:border-accent-primary/40 hover:bg-accent-primary/10 transition-colors cursor-pointer"
      style={{ color: 'var(--pm-hero-fg-soft)', background: 'var(--pm-hero-tile)', borderColor: 'var(--pm-hero-line)' }}>
      {icon}
      {badge > 0 && (
        <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[9px] font-extrabold text-bg-primary num-mono flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// App-native identity: a dark card with the app accent (no radar — that's the
// scanner's language; the distinction here is the podium + wallet page).
function Hero({ stats, watchedCount = 0, strategyCount = 0, onOpenAnalyst, onOpenStrategy, onOpenWatched, onOpenAcademy }) {
  const count = useCountUp(stats?.count ?? 0);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 p-5 mb-5" style={{ background: 'var(--pm-hero-bg)' }}>
      <div className="absolute -top-20 -left-16 w-64 h-64 rounded-full bg-accent-primary/10 blur-3xl pointer-events-none" />
      {/* On mobile the actions wrap to their own row — squeezing them beside
          the title broke it into three lines. */}
      <div className="relative flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-accent-primary bg-accent-primary/15 border border-accent-primary/40"
            style={{ boxShadow: '0 0 24px -6px rgba(59,130,246,0.6)' }}>
            <Trophy className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold leading-tight" style={{ color: 'var(--pm-hero-fg)' }}>ארנקים מובילים · Polymarket</h1>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary text-bg-primary font-bold"><Crown className="w-2.5 h-2.5" /> Premium</span>
            </div>
            <p className="text-[11px] sm:text-xs leading-relaxed mt-1" style={{ color: 'var(--pm-hero-fg-soft)' }}>
              הטריידרים הרווחיים ב-Polymarket, מדורגים לפי יעילות (רווח לכל $ מחזור) — לא רק רווח גולמי. דאטה ציבורי, 30 יום.
            </p>
          </div>
        </div>
        {/* Personal-workspace actions (the tabs stay for browsing) */}
        {onOpenAcademy && (
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <HeroAction onClick={onOpenAnalyst} label="האנליסט הפרטי שלי"
              icon={<UserRoundSearch className="w-4 h-4" />} />
            <HeroAction onClick={onOpenStrategy} badge={strategyCount} label={`האסטרטגיות שלי (${strategyCount})`}
              icon={<Compass className="w-4 h-4" />} />
            <HeroAction onClick={onOpenWatched} badge={watchedCount}
              label={`הארנקים שאני עוקב (${watchedCount})`}
              icon={<Star className={`w-4 h-4 ${watchedCount > 0 ? 'text-amber-400 fill-amber-400' : ''}`} />} />
            <HeroAction onClick={onOpenAcademy} label="איך קוראים את הלוח הזה"
              icon={<GraduationCap className="w-4 h-4" />} />
          </div>
        )}
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

function StarBtn({ isWatched, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isWatched ? 'הסר מהמעקב' : 'הוסף למעקב'}
      className="relative p-1.5 rounded-lg text-text-muted hover:text-amber-400 hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
    >
      <Star className={`w-4 h-4 ${isWatched ? 'fill-amber-400 text-amber-400' : ''}`} />
    </button>
  );
}

function Avatar({ src, className }) {
  return src
    ? <img src={src} alt="" className={`rounded-full object-cover shrink-0 ${className}`} loading="lazy" />
    : <div className={`rounded-full bg-bg-tertiary shrink-0 ${className}`} />;
}

// Top-3 as a podium of cards with rank medals — the visual break from the scanner.
function PodiumCard({ r, rank, isWatched, onToggle, onOpen }) {
  const name = r.name || shortWallet(r.wallet);
  const m = MEDAL[rank] || MEDAL[3];
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`group relative flex flex-col items-center text-center gap-2 p-3 rounded-2xl border bg-bg-secondary cursor-pointer transition-all overflow-hidden outline-none hover:-translate-y-0.5 hover:shadow-lg ${m.card}`}>
      {m.glow && <div className="absolute inset-0 pointer-events-none" style={{ background: m.glow }} />}
      <div className="relative flex items-center justify-between w-full">
        <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-extrabold num-mono border ${m.badge}`}>
          {rank === 1 ? <Crown className="w-3.5 h-3.5" /> : rank}
        </span>
        <StarBtn isWatched={isWatched} onToggle={onToggle} />
      </div>
      <Avatar src={r.profileImage} className="w-12 h-12" />
      <div className="relative flex items-center gap-1 min-w-0 max-w-full">
        <span className="text-sm font-bold text-text-primary truncate" dir="auto">{name}</span>
        {r.verified && <ShieldCheck className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
      </div>
      <ScoreRing score={r.smartScore} size="lg" />
      <div>
        <div className={`text-sm font-extrabold num-mono ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(r.pnl)}</div>
        <div className="text-[10px] num-mono text-text-muted">ROI {fmtPct(r.roi)}</div>
      </div>
    </div>
  );
}

function WalletRow({ r, rank, isWatched, onToggle, onOpen }) {
  const name = r.name || shortWallet(r.wallet);
  const hasComposition = r.smartScore != null && (r.sizeShare || r.effShare);
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary text-right cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      {rank != null && <span className="w-6 text-center text-xs font-bold text-text-muted num-mono shrink-0">{rank}</span>}
      <ScoreRing score={r.smartScore} size="md" />
      <Avatar src={r.profileImage} className="w-8 h-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-text-primary truncate" dir="auto">{name}</span>
          {r.verified && <ShieldCheck className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
        </div>
        {hasComposition ? (
          <div className="flex items-center gap-1.5 mt-1">
            {/* why this wallet ranks: light = size, bright = efficiency; filled = score */}
            <div className="h-1 rounded-full overflow-hidden flex w-24 bg-bg-tertiary" title="הרכב הציון: גודל מול יעילות">
              <div className="h-full bg-accent-primary/40" style={{ width: `${r.sizeShare * 50}%` }} />
              <div className="h-full bg-accent-primary" style={{ width: `${r.effShare * 50}%` }} />
            </div>
            <span className="text-[9px] text-text-muted num-mono" dir="ltr">{shortWallet(r.wallet)}</span>
          </div>
        ) : (
          <span className="text-[10px] text-text-muted num-mono" dir="ltr">{shortWallet(r.wallet)}</span>
        )}
      </div>
      <div className="text-left shrink-0">
        <div className={`text-sm font-extrabold num-mono ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtUsd(r.pnl)}</div>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className={`text-[11px] font-bold num-mono ${r.roi >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtPct(r.roi)}</span>
          <span className="text-[10px] text-text-muted num-mono">· {fmtUsd(r.volume)}</span>
        </div>
      </div>
      <StarBtn isWatched={isWatched} onToggle={onToggle} />
    </div>
  );
}

function snapshotToRow(w) {
  return {
    wallet: w.wallet,
    name: w.name || null,
    profileImage: w.profileImage || null,
    verified: false,
    pnl: w.snapshot?.pnl ?? 0,
    roi: w.snapshot?.roi ?? 0,
    volume: w.snapshot?.volume ?? 0,
    smartScore: w.snapshot?.smartScore ?? null,
    sizeShare: 0,
    effShare: 0,
  };
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
          הכירו את הטריידרים הרווחיים ביותר ב-Polymarket, מדורגים לפי יעילות אמיתית — ועקבו אחרי הארנקים החכמים.
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
  const navigate = useNavigate();
  // Tab lives in the URL so returning from a market/wallet page (and a plain
  // refresh) lands back where you were instead of resetting to wallets.
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_KEYS = ['wallets', 'markets', 'consensus', 'radar'];
  const urlTab = searchParams.get('tab');
  const mainTab = TAB_KEYS.includes(urlTab) ? urlTab : 'wallets';
  const setMainTab = (key) => setSearchParams({ tab: key }, { replace: true });
  const [category, setCategory] = useState('overall');
  const { rows, loading, error, refetch } = usePolymarketLeaderboard(category);
  const { watched, watchedSet, toggle } = usePolymarketWatch();
  const { strategies } = usePolymarketStrategies();
  const strategyCount = strategies.length;
  const [sort, setSort] = useState('score');
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [watchedOpen, setWatchedOpen] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(false);
  // Consensus doubles as the "how many smart wallets hold this market" source
  // for the strategy filter. MUST come after the modal state it reads — a const
  // is in its temporal dead zone until declared, which crashed the page.
  const { countByMarket, loading: smartLoading } = useSmartConsensus({ enabled: mainTab === 'consensus' || strategyOpen || analystOpen });

  const openWallet = (r) => navigate(`/polymarket/wallet/${r.wallet}`, { state: { row: r, from: `/polymarket?tab=${mainTab}` } });

  const watchedRows = useMemo(
    () => watched.map((w) => rows.find((r) => r.wallet === w.wallet) || snapshotToRow(w)),
    [watched, rows],
  );

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
    const val = SORT_VALUE[sort] || SORT_VALUE.score;
    return [...list].sort((a, b) => val(b) - val(a));
  }, [rows, eligibleOnly, query, sort]);

  const exportWallets = () => {
    downloadCsv(
      stampedName('polymarket_wallets'),
      ['דירוג', 'שם', 'ארנק', 'ציון', 'רווח 30 יום ($)', 'ROI %', 'מחזור ($)'],
      view.map((r, i) => [i + 1, r.name || '', r.wallet, r.smartScore ?? '', Math.round(r.pnl), r.roi.toFixed(2), Math.round(r.volume)]),
    );
    toast.success('הקובץ הורד');
  };

  const hasData = !loading && !error && rows.length > 0;
  // Podium only with 3+ results; otherwise everything falls through to the list
  // (a 1–2 result view must never render empty).
  const usePodium = !query && view.length >= 3;
  const podium = usePodium ? view.slice(0, 3) : [];
  const listRows = usePodium ? view.slice(3) : view;

  // Tabs browse market data; the personal workspace lives in the hero icons.
  const MAIN_TABS = [
    { key: 'wallets', label: 'ארנקים', icon: Users },
    { key: 'markets', label: 'שווקים', icon: Globe },
    { key: 'consensus', label: 'כסף חכם', icon: Gem },
    { key: 'radar', label: 'ראדאר', icon: Waves },
  ];

  return (
    <>
      <Hero stats={hasData ? stats : null} watchedCount={watchedRows.length} strategyCount={strategyCount}
        onOpenAnalyst={() => setAnalystOpen(true)} onOpenStrategy={() => setStrategyOpen(true)}
        onOpenWatched={() => setWatchedOpen(true)} onOpenAcademy={() => setAcademyOpen(true)} />

      {/* Main tabs: the smart-money board / the markets board / the live tape */}
      {/* Equal-width grid instead of a scrolling flex row — on a phone the
          labels shrink and the row still fits without sideways scroll. */}
      <div className="grid grid-cols-4 bg-bg-secondary border border-border-primary rounded-xl p-1 gap-0.5 mb-4">
        {MAIN_TABS.map((t) => (
          <button key={t.key} onClick={() => setMainTab(t.key)} title={t.label}
            className={`min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              mainTab === t.key ? 'bg-accent-primary/15 text-accent-primary shadow-[0_0_18px_-6px_rgba(59,130,246,0.6)]' : 'text-text-muted hover:text-text-primary'
            }`}>
            <t.icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {mainTab === 'markets' && <MarketsExplorer />}
      {mainTab === 'consensus' && <SmartConsensus />}
      {mainTab === 'radar' && <WhaleRadar />}

      {mainTab === 'wallets' && (
      <>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* category dropdown */}
        <div className="relative shrink-0">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="appearance-none bg-bg-secondary border border-border-primary rounded-lg py-2 ps-3 pe-8 text-sm font-semibold text-text-primary cursor-pointer outline-none focus:border-accent-primary/50">
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-text-muted absolute inset-y-0 my-auto left-2 pointer-events-none" />
        </div>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 flex-1 min-w-[150px] focus-within:border-accent-primary/50 transition-colors">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ארנק…"
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
          title="הצג רק ארנקים איכותיים: מחזור $10K+ ורווח חיובי ב-30 יום (מסנן קטנים/מפסידים)"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${eligibleOnly ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40' : 'text-text-muted border-border-primary'}`}>
          <ArrowDownUp className="w-3 h-3" /> רווחיים בלבד
        </button>
        <button onClick={exportWallets} disabled={view.length === 0} title="ייצוא הדירוג ל-CSV"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border-primary text-text-muted hover:text-accent-primary transition-colors cursor-pointer disabled:opacity-40">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      {/* Content */}
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
        <>
          {/* Podium — top 3 */}
          {podium.length === 3 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {podium.map((r, i) => (
                <PodiumCard key={r.wallet} r={r} rank={i + 1} isWatched={watchedSet.has(r.wallet)} onToggle={() => toggle(r)} onOpen={() => openWallet(r)} />
              ))}
            </div>
          )}
          {/* The rest */}
          <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
            {listRows.map((r, i) => (
              <motion.div key={r.wallet} variants={staggerItem}>
                <WalletRow r={r} rank={podium.length + i + 1} isWatched={watchedSet.has(r.wallet)} onToggle={() => toggle(r)} onOpen={() => openWallet(r)} />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
      </>
      )}

      <PersonalAnalystModal isOpen={analystOpen} onClose={() => setAnalystOpen(false)} smartCountByMarket={countByMarket} smartLoading={smartLoading} />
      <StrategyModal isOpen={strategyOpen} onClose={() => setStrategyOpen(false)} smartCountByMarket={countByMarket} smartLoading={smartLoading} />
      <WatchedWalletsModal isOpen={watchedOpen} onClose={() => setWatchedOpen(false)}
        rows={watchedRows} onOpen={openWallet} onRemove={toggle} />
      <AcademyModal isOpen={academyOpen} onClose={() => setAcademyOpen(false)} />

      {/* Disclaimer */}
      <div className="flex items-start gap-2 mt-5 p-3 rounded-xl bg-bg-secondary/60 border border-border-primary text-[11px] text-text-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          כלי אנליטיקה על דאטה ציבורי של Polymarket — לא ייעוץ פיננסי. מעקב אחרי טריידרים אחרים לא מבטיח רווח (הם טועים, הדאטה מגיעה באיחור, והנזילות שלהם שונה משלך).
          הציון מקדים ומבוסס על רווח + יעילות (30 יום); שיעור-הצלחה ועקביות יתווספו בהמשך.
        </p>
      </div>
    </>
  );
}

// Polymarket top-trader leaderboard over public data. Ranks wallets by a
// preliminary efficiency score (PnL × ROI), not raw PnL. Read-only, no keys.
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
