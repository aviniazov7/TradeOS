import { useMemo, useState } from 'react';
import { UserRoundSearch, AlertCircle, Star, Target, Activity } from 'lucide-react';
import { usePolymarketWatch } from '../../hooks/usePolymarketWatch';
import { usePolymarketStrategies } from '../../hooks/usePolymarketStrategies';
import { usePolymarkets } from '../../hooks/usePolymarkets';
import ThinkingIndicator from '../shared/ThinkingIndicator';
import AiReport from './AiReport';
import { generateCoachReport } from '../../services/aiCoachService';
import { fetchActivity } from '../../services/polymarketService';
import { runStrategy, describeStrategy } from '../../utils/polymarketStrategy';
import { shortWallet } from '../../utils/polymarketScore';

const STEPS = ['סורק את הארנקים שבמעקב', 'בודק מהלכים אחרונים', 'מריץ את האסטרטגיות שלך', 'מגבש תדרוך אישי'];
const MAX_WALLETS_SCANNED = 6;   // cap the fan-out; the newest tracked wallets

function Tile({ icon, value, label }) {
  return (
    <div className="rounded-xl bg-bg-secondary border border-border-primary px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-accent-primary shrink-0">{icon}</span>
        <span className="text-base font-extrabold num-mono text-text-primary leading-none">{value}</span>
      </div>
      <div className="text-[10px] text-text-muted mt-1.5 truncate">{label}</div>
    </div>
  );
}

// "האנליסט הפרטי שלי" — reads YOUR workspace (tracked wallets, their latest
// moves, your saved strategies and what matches them right now) and writes a
// personal Hebrew brief. Distinct from the per-wallet analyst.
export default function PersonalAnalyst({ smartCountByMarket = {}, smartLoading = false, embedded = false }) {
  const { watched } = usePolymarketWatch();
  const { strategies } = usePolymarketStrategies();
  const { markets } = usePolymarkets();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');

  // Matches per strategy — also the headline count on the tiles.
  const strategyMatches = useMemo(
    () => strategies.map((s) => ({ s, matches: runStrategy(markets, s, smartCountByMarket) })),
    [strategies, markets, smartCountByMarket],
  );
  const totalMatches = strategyMatches.reduce((n, x) => n + x.matches.length, 0);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      // Recent moves of the tracked wallets (bounded fan-out).
      const wallets = watched.slice(0, MAX_WALLETS_SCANNED);
      const moves = await Promise.all(wallets.map(async (w) => {
        try {
          const acts = await fetchActivity(w.wallet, { limit: 8 });
          return {
            wallet: w.name || shortWallet(w.wallet),
            smartScore: w.snapshot?.smartScore ?? null,
            pnl30dUsd: w.snapshot?.pnl != null ? Math.round(w.snapshot.pnl) : null,
            roiPct: w.snapshot?.roi != null ? Math.round(w.snapshot.roi * 10) / 10 : null,
            recent: acts.slice(0, 4).map((a) => ({
              side: a.side, usd: Math.round(a.usdcSize),
              market: (a.title || '').slice(0, 60), outcome: a.outcome,
            })),
          };
        } catch {
          return { wallet: w.name || shortWallet(w.wallet), recent: [] };
        }
      }));

      const payload = {
        trackedWallets: moves,
        trackedCount: watched.length,
        strategies: strategyMatches.map(({ s, matches }) => ({
          name: s.name,
          rules: describeStrategy(s),
          matchCount: matches.length,
          topMatches: matches.slice(0, 5).map((m) => ({
            market: (m.market.question || '').slice(0, 70),
            outcome: m.band.outcome,
            priceCents: Math.round(m.band.price * 100),
            liquidityUsd: Math.round(m.market.liquidity),
            daysLeft: m.daysLeft,
            smartHolders: m.smartCount,
            fit: m.fit,
          })),
        })),
        marketsScanned: markets.length,
      };
      const text = await generateCoachReport(payload, 'deep', 'polymarket-brief');
      setReport(text);
    } catch (e) {
      setError(e.message || 'התדרוך נכשל. נסה שוב בעוד רגע.');
      setReport('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header — the modal supplies the title when embedded, so only the
          summary tiles are kept there. */}
      {embedded ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Tile icon={<Star className="w-3.5 h-3.5" />} value={watched.length} label="ארנקים במעקב" />
          <Tile icon={<Target className="w-3.5 h-3.5" />} value={strategies.length} label="אסטרטגיות" />
          <Tile icon={<Activity className="w-3.5 h-3.5" />} value={totalMatches} label="התאמות פתוחות" />
        </div>
      ) : (
      <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 bg-[#070b12] p-4 mb-4">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-accent-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-accent-primary bg-accent-primary/15 border border-accent-primary/40"
            style={{ boxShadow: '0 0 24px -6px rgba(59,130,246,0.6)' }}>
            <UserRoundSearch className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">האנליסט הפרטי שלי</h2>
            <p className="text-xs text-white/60 leading-relaxed mt-1">
              תדרוך אישי על סביבת העבודה שלך — הארנקים שאתה עוקב, מה הם עשו לאחרונה, והאם משהו תואם לאסטרטגיות שלך.
            </p>
          </div>
        </div>
        <div className="relative grid grid-cols-3 gap-2 mt-4">
          <Tile icon={<Star className="w-3.5 h-3.5" />} value={watched.length} label="ארנקים במעקב" />
          <Tile icon={<Target className="w-3.5 h-3.5" />} value={strategies.length} label="אסטרטגיות" />
          <Tile icon={<Activity className="w-3.5 h-3.5" />} value={totalMatches} label="התאמות פתוחות" />
        </div>
      </div>
      )}

      {/* Run */}
      {!report && !loading && (
        <div className="text-center py-6 rounded-2xl border border-dashed border-border-primary">
          {watched.length === 0 && strategies.length === 0 ? (
            <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed px-6">
              כדי לקבל תדרוך אישי — הוסף לפחות ארנק אחד למעקב (⭐ בטאב הארנקים) או בנה אסטרטגיה אחת. אז יהיה לאנליסט על מה לדבר.
            </p>
          ) : (
            <>
              <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed mb-4 px-6">
                ה-AI יקרא {watched.length} ארנקים במעקב, {strategies.length} אסטרטגיות ו-{totalMatches} התאמות פתוחות — ויכתוב לך מה חשוב עכשיו.
              </p>
              <button onClick={run} disabled={smartLoading}
                title={smartLoading ? 'ממתין לנתוני הכסף החכם' : undefined}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <UserRoundSearch className="w-4 h-4" /> {smartLoading ? 'טוען נתונים…' : 'תן לי תדרוך'}
              </button>
            </>
          )}
        </div>
      )}

      {loading && <ThinkingIndicator steps={STEPS} />}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {!loading && <AiReport report={report} onRerun={run} />}

      {/* Per-strategy quick view under the brief */}
      {strategyMatches.length > 0 && (
        <div className="mt-4 space-y-2">
          {strategyMatches.map(({ s, matches }) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-secondary border border-border-primary">
              <Target className="w-3.5 h-3.5 text-accent-primary shrink-0" />
              <span className="text-xs font-bold text-text-primary truncate flex-1">{s.name}</span>
              <span className="text-[11px] num-mono text-text-muted shrink-0">{matches.length} התאמות</span>
              {matches[0] && <span className="text-[11px] num-mono text-accent-primary shrink-0">· מוביל {matches[0].fit}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
