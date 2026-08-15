import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Waves, Star, AlertCircle } from 'lucide-react';
import { fetchTrades } from '../../services/polymarketService';
import { openTradeStream } from '../../services/polymarketLive';
import { usePolymarketWatch } from '../../hooks/usePolymarketWatch';
import { fmtUsd, shortWallet } from '../../utils/polymarketScore';

const POLL_MS = 20_000;
const SIZES = [
  { key: 1_000, label: '$1K+' },
  { key: 10_000, label: '$10K+' },
  { key: 50_000, label: '$50K+' },
];
const MAX_FEED = 60;

function timeAgo(ts) {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (secs < 60) return 'עכשיו';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `לפני ${mins} ד׳`;
  return `לפני ${Math.floor(mins / 60)} ש׳`;
}

function TradeRow({ t, tracked, onOpenWallet }) {
  const isBuy = t.side === 'BUY';
  return (
    <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-secondary border transition-colors ${tracked ? 'border-amber-400/40' : 'border-border-primary'}`}>
      {t.icon
        ? <img src={t.icon} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-8 h-8 rounded-lg bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-text-primary truncate">{t.title}</span>
          {tracked && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" title="ארנק במעקב שלך" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>{isBuy ? 'קנייה' : 'מכירה'}</span>
          {t.outcome && <span className="text-[10px] text-text-muted">{t.outcome}</span>}
          <button onClick={() => onOpenWallet(t)} className="text-[10px] text-text-muted hover:text-accent-primary transition-colors num-mono cursor-pointer" dir="ltr">
            {t.name || shortWallet(t.wallet)}
          </button>
          <span className="text-[10px] text-text-muted num-mono">· {timeAgo(t.timestamp)}</span>
        </div>
      </div>
      <div className="text-left shrink-0">
        <div className={`text-sm font-extrabold num-mono ${isBuy ? 'text-profit' : 'text-loss'}`}>{fmtUsd(t.usd)}</div>
        <div className="text-[10px] num-mono text-text-muted">{Math.round(t.price * 100)}¢</div>
      </div>
    </motion.div>
  );
}

// The whale radar — a genuinely real-time tape over Polymarket's public
// live-data socket (every trade on the platform, pushed). REST seeds the list
// so the tab isn't empty on open, and polling only takes over if the socket
// can't hold. Trades by wallets on YOUR watchlist are highlighted.
export default function WhaleRadar() {
  const navigate = useNavigate();
  const { watchedSet } = usePolymarketWatch();
  const [minUsd, setMinUsd] = useState(10_000);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting | live | down

  // Merge helper shared by the socket and the REST fallback.
  const merge = (rows) => setFeed((prev) => {
    const known = new Set(prev.map((x) => x.id));
    const merged = [...prev];
    for (const t of rows) {
      if (known.has(t.id)) continue;
      known.add(t.id);
      merged.push(t);
    }
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, 400);
  });

  // Seed from REST once so the tape has history immediately.
  useEffect(() => {
    let stop = false;
    fetchTrades({ limit: 100 })
      .then((rows) => { if (!stop) { merge(rows); setLoading(false); } })
      .catch(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  // Live socket — pushes every trade as it happens.
  useEffect(() => {
    const stopStream = openTradeStream(
      (t) => { merge([t]); setLoading(false); },
      (s) => { setStatus(s); if (s === 'live') setError(''); },
    );
    return stopStream;
  }, []);

  // Fallback: if the socket is down, keep the tape alive over REST.
  useEffect(() => {
    if (status !== 'down') return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const rows = await fetchTrades({ limit: 100 });
        if (!stop) { merge(rows); setError(''); }
      } catch {
        if (!stop) setError('החיבור החי נפל — מנסה להתחבר מחדש…');
      } finally {
        if (!stop) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [status]);

  const view = useMemo(
    () => feed.filter((t) => t.usd >= minUsd || watchedSet.has(t.wallet)).slice(0, MAX_FEED),
    [feed, minUsd, watchedSet],
  );

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span className="relative flex h-2 w-2">
            {status === 'live' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-60" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'live' ? 'bg-profit' : 'bg-text-muted'}`} />
          </span>
          {status === 'live' && 'זמן אמת · כל עסקה ברגע שהיא קורית'}
          {status === 'connecting' && 'מתחבר לשידור החי…'}
          {status === 'down' && 'מצב גיבוי · מתעדכן כל 20 שניות'}
        </div>
        <div className="inline-flex bg-bg-secondary border border-border-primary rounded-lg p-0.5 gap-0.5">
          {SIZES.map((s) => (
            <button key={s.key} onClick={() => setMinUsd(s.key)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer num-mono ${minUsd === s.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && !loading && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-loss/10 text-[11px] text-loss"><AlertCircle className="w-3.5 h-3.5" />{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-bg-secondary animate-pulse" />)}</div>
      ) : view.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border border-dashed border-border-primary text-text-muted">
          <Waves className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">אין עסקאות מעל הסף כרגע — הפיד ימשיך להתעדכן</span>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {view.map((t) => (
              <TradeRow key={t.id} t={t} tracked={watchedSet.has(t.wallet)}
                onOpenWallet={(x) => navigate(`/polymarket/wallet/${x.wallet}`)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
