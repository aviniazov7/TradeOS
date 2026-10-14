import { useMemo, useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, Gem, Star, CalendarClock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePolymarketLeaderboard } from '../../hooks/usePolymarketLeaderboard';
import { usePolymarketWatch } from '../../hooks/usePolymarketWatch';
import { useMarketHolders } from '../../hooks/usePolymarkets';
import { fmtUsd, shortWallet } from '../../utils/polymarketScore';
import { marketUrl, fetchMarketByCondition } from '../../services/polymarketService';
import ScoreRing from './ScoreRing';
import { pageVariants, pageTransition } from '../../utils/animations';

function fmtShares(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function daysLeft(endDate) {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  return Number.isFinite(d) ? d : null;
}

function Stat({ label, value, tone }) {
  const color = tone === 'accent' ? 'text-accent-primary' : 'text-text-primary';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      {/* no truncate on a number — clipping digits misreports the value */}
      <div className={`text-sm font-extrabold num-mono mt-0.5 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

// The moat: cross-reference this market's biggest holders against OUR smart-money
// leaderboard + the user's tracked wallets — "who of the sharp money is in here".
function SmartHolders({ conditionId, outcomes, prices }) {
  const { holders, loading } = useMarketHolders(conditionId);
  const { rows } = usePolymarketLeaderboard('overall'); // module-cached; no extra paging
  const { watchedSet } = usePolymarketWatch();
  const navigate = useNavigate();

  const smart = useMemo(() => {
    const byWallet = new Map(rows.map((r) => [r.wallet, r]));
    const out = [];
    for (const t of holders) {
      for (const h of t.holders) {
        const lb = byWallet.get(h.wallet);
        const tracked = watchedSet.has(h.wallet);
        if (!lb && !tracked) continue;
        // `amount` from /holders is a SHARE COUNT — price it to get $ exposure.
        const idx = Number.isInteger(h.outcomeIndex) ? h.outcomeIndex : null;
        const valueUsd = h.amount * (idx != null ? (prices?.[idx] ?? 0) : 0);
        out.push({
          ...h,
          lbRow: lb || null,
          tracked,
          valueUsd,
          outcome: (idx != null && outcomes[idx]) || '—',
        });
      }
    }
    return out.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 12);
  }, [holders, rows, watchedSet, outcomes, prices]);

  return (
    <section className="mt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Gem className="w-3.5 h-3.5 text-accent-primary" />
        <h2 className="text-sm font-bold text-text-primary">כסף חכם שמחזיק כאן</h2>
        <span className="text-[11px] text-text-muted">— מחזיקים גדולים שמופיעים בטופ-200 או במעקב שלך</span>
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
      ) : smart.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-muted rounded-xl border border-dashed border-border-primary">
          אין ארנקים מהטופ-200 (או מהמעקב שלך) בין המחזיקים הגדולים כאן
        </div>
      ) : (
        <div className="space-y-2">
          {smart.map((h) => (
            <div key={`${h.wallet}-${h.outcomeIndex}`}
              onClick={() => h.lbRow && navigate(`/polymarket/wallet/${h.wallet}`, { state: { row: h.lbRow } })}
              role={h.lbRow ? 'button' : undefined} tabIndex={h.lbRow ? 0 : undefined}
              onKeyDown={(e) => { if (h.lbRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(`/polymarket/wallet/${h.wallet}`, { state: { row: h.lbRow } }); } }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-bg-secondary border border-border-primary ${h.lbRow ? 'cursor-pointer hover:border-accent-primary/40 transition-colors' : ''}`}>
              {h.profileImage
                ? <img src={h.profileImage} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" loading="lazy" />
                : <div className="w-7 h-7 rounded-full bg-bg-tertiary shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-text-primary truncate" dir="auto">{h.name || shortWallet(h.wallet)}</span>
                  {h.tracked && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                </div>
                <span className="text-[10px] text-text-muted" dir="ltr">
                  <span className="num-mono">{fmtUsd(h.valueUsd)}</span>
                  <span className="num-mono"> · {fmtShares(h.amount)} shares</span> · {h.outcome}
                </span>
              </div>
              {h.lbRow?.smartScore != null && <ScoreRing score={h.lbRow.smartScore} size="md" />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// In-app market page: live probabilities per outcome, market stats, and the
// smart-money holders overlay. Premium (redirects like the wallet page).
export default function MarketDetailPage() {
  const { isPremium } = useAuth();
  const { conditionId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  // Arriving from the board carries the market in router state; a refresh or a
  // shared link doesn't, so fetch it by id instead of bouncing the user back.
  const passed = state?.market?.conditionId === conditionId ? state.market : null;
  const [fetched, setFetched] = useState(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    if (passed || !conditionId) return undefined;
    const controller = new AbortController();
    setLoadErr(false);
    fetchMarketByCondition(conditionId, { signal: controller.signal })
      .then((row) => { if (row) setFetched(row); else setLoadErr(true); })
      .catch((e) => { if (e.name !== 'AbortError') setLoadErr(true); });
    return () => controller.abort();
  }, [conditionId, passed]);

  const m = passed || fetched;

  if (!isPremium) return <Navigate to="/market?tab=polymarket" replace />;

  if (!m) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(state?.from || '/market?tab=polymarket')} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-3 cursor-pointer">
          <ArrowRight className="w-4 h-4" /> חזרה לשווקים
        </button>
        {loadErr ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <AlertCircle className="w-7 h-7 text-loss" />
            <p className="text-sm text-text-primary font-medium">השוק לא נמצא</p>
            <p className="text-[11px] text-text-muted max-w-xs leading-relaxed">ייתכן שהשוק נסגר או הוסר. חזור לרשימת השווקים ובחר אחר.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-28 rounded-2xl bg-bg-secondary animate-pulse" />
            <div className="h-16 rounded-xl bg-bg-secondary animate-pulse" />
            <div className="h-16 rounded-xl bg-bg-secondary animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  const link = marketUrl(m.eventSlug, m.slug);
  const dl = daysLeft(m.endDate);

  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-3xl mx-auto">
      <button onClick={() => navigate(state?.from || '/market?tab=polymarket')} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-3 cursor-pointer">
        <ArrowRight className="w-4 h-4" /> חזרה לשווקים
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 p-4 mb-4" style={{ background: 'var(--pm-hero-bg)' }}>
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-accent-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          {m.icon
            ? <img src={m.icon} alt="" className="w-12 h-12 rounded-xl object-cover" loading="lazy" />
            : <div className="w-12 h-12 rounded-xl bg-white/10" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-snug" dir="auto" style={{ color: 'var(--pm-hero-fg)' }}>{m.question}</h1>
            {dl != null && (
              <span className="inline-flex items-center gap-1 text-[11px] mt-1" style={{ color: 'var(--pm-hero-fg-faint)' }}>
                <CalendarClock className="w-3 h-3" /> {dl <= 0 ? 'נסגר היום' : `נסגר בעוד ${dl} ימים`}
              </span>
            )}
          </div>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="relative inline-flex items-center gap-1.5 mt-3 text-[11px] font-semibold text-accent-primary hover:text-accent-hover transition-colors">
            פתח את השוק ב-Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Probabilities */}
      <div className="space-y-2 mb-4">
        {m.outcomes.map((o, i) => {
          const p = m.prices[i] ?? 0;
          const lead = p >= 0.5;
          return (
            <div key={o} className="rounded-xl bg-bg-secondary border border-border-primary p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-text-primary truncate" dir="auto">{o}</span>
                <span className={`text-sm font-extrabold num-mono ${lead ? 'text-profit' : 'text-loss'}`}>{Math.round(p * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
                <div className={`h-full rounded-full ${lead ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${Math.min(100, p * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="נפח 24ש׳" value={fmtUsd(m.volume24hr)} tone="accent" />
        <Stat label="נזילות" value={fmtUsd(m.liquidity)} />
        <Stat label="ספרד" value={`${Math.round((m.spread || 0) * 100)}¢`} />
      </div>

      <SmartHolders conditionId={m.conditionId} outcomes={m.outcomes} prices={m.prices} />
    </m.div>
  );
}
