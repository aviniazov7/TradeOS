import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Waves, HelpCircle, Zap, TrendingUp, TrendingDown,
  Radio, Scale, CircleDollarSign,
} from 'lucide-react';
import { openWhaleStream, fetchRecentBigTrades } from '../../services/whaleStream';
import { getCachedImage, prefetchCoinImages } from '../../services/coinImageCache';
import { pageVariants, pageTransition } from '../../utils/animations';

// Perps we track. Liquidations are rare events; trades are heavy on BTC/ETH
// but everything under the minimum notional is dropped at ingest.
const STREAM_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT',
];
const MIN_TRADE_USD = 50_000;
const TRADE_THRESHOLDS = [
  { v: 50_000, label: '50K+' },
  { v: 100_000, label: '100K+' },
  { v: 250_000, label: '250K+' },
  { v: 1_000_000, label: '1M+' },
];
const TRADE_STORE_CAP = 400;   // kept in memory (feeds the net-flow chart)
const LIQ_STORE_CAP = 120;     // persisted to localStorage → history survives visits
const FEED_RENDER_CAP = 80;
const LIQ_LS_KEY = 'tradeos_whale_liqs_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtUsd = (v) => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
};
const fmtPrice = (p) => {
  const n = parseFloat(p);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : n.toPrecision(4);
};
// Old events keep their day so the persisted history reads correctly.
const fmtWhen = (t) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return Date.now() - t >= DAY_MS
    ? `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`
    : time;
};
const coinOf = (sym) => sym.replace(/USDT$/, '');

function loadStoredLiqs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIQ_LS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    // Keep the last 7 days so the page always opens with history.
    const cutoff = Date.now() - 7 * DAY_MS;
    return raw.filter((l) => l && l.t > cutoff).slice(0, LIQ_STORE_CAP);
  } catch {
    return [];
  }
}
function saveStoredLiqs(list) {
  try { localStorage.setItem(LIQ_LS_KEY, JSON.stringify(list.slice(0, LIQ_STORE_CAP))); } catch { /* full/blocked */ }
}

// ---- Small building blocks --------------------------------------------------

// Coin logo (CoinGecko CDN via the shared cache) with a gradient-letter
// fallback so unknown symbols still look intentional.
function CoinIcon({ sym, className = 'w-5 h-5' }) {
  const [err, setErr] = useState(false);
  const url = getCachedImage(sym);
  if (!url || err) {
    return (
      <span
        className={`${className} rounded-full grid place-items-center text-[8px] font-black text-white shrink-0`}
        style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}
      >
        {sym.slice(0, 1)}
      </span>
    );
  }
  return <img src={url} alt={sym} loading="lazy" onError={() => setErr(true)} className={`${className} rounded-full shrink-0 object-cover`} />;
}

function SectionCard({ Icon, title, badge, children, className = '' }) {
  return (
    <div className={`bg-bg-secondary border border-border-primary rounded-2xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4.5 h-4.5" style={{ stroke: 'url(#ai-grad)' }} />
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
        {badge}
      </div>
      {children}
    </div>
  );
}

function LiveDot({ status }) {
  const live = status === 'live';
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{
        color: live ? 'var(--color-profit, #22c55e)' : '#f59e0b',
        borderColor: live ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.35)',
        background: live ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
      }}>
      <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-profit animate-pulse' : 'bg-amber-400'}`} />
      {live ? 'LIVE' : status === 'connecting' ? 'מתחבר…' : 'מתחבר מחדש…'}
    </span>
  );
}

function StatCard({ label, value, Icon, color, sub, wash }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-primary">
      <div className="absolute inset-0 opacity-80" style={{ background: wash }} />
      <div className="relative p-3.5 flex items-start gap-2.5">
        <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-bg-primary/60 border border-border-primary ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] text-text-muted mb-0.5">{label}</div>
          <div className={`text-xl font-black ${color}`} dir="ltr">{value}</div>
          {sub && <div className="text-[10px] text-text-muted mt-0.5 truncate">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

// A single feed row — LTR so the coin sits on the LEFT and numbers read
// naturally, while the badges stay Hebrew.
function FeedRow({ big, whale, icon, sym, badge, badgeClass, usd, usdClass, price, t }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      dir="ltr"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${big || 'bg-bg-primary/40 border-border-primary/60'}`}
    >
      {icon}
      <span className="font-mono text-xs font-bold text-text-primary w-11">{sym}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}>{badge}</span>
      {whale && <span className="text-sm">🐋</span>}
      <span className={`text-xs font-black ml-auto ${usdClass}`}>{fmtUsd(usd)}</span>
      <span className="text-[10px] text-text-muted font-mono hidden sm:inline">@{fmtPrice(price)}</span>
      <span className="text-[10px] text-text-muted tabular-nums">{fmtWhen(t)}</span>
    </motion.div>
  );
}

// ---- Main page ---------------------------------------------------------------

export default function WhalesPage({ embedded = false }) {
  const [showInfo, setShowInfo] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [paused, setPaused] = useState(false);

  const [liqs, setLiqs] = useState(loadStoredLiqs);
  const [trades, setTrades] = useState([]);
  const [backfilled, setBackfilled] = useState(false);
  const [threshold, setThreshold] = useState(100_000);

  const liqBuf = useRef([]);
  const tradeBuf = useRef([]);
  // Restored liqs carry ids from a previous session; starting the counter at 0
  // would hand live events ids that already exist in the list (duplicate React
  // keys → wrong DOM reuse). Lazy-init from the restored maximum instead.
  const idRef = useRef(null);
  if (idRef.current === null) {
    idRef.current = liqs.reduce((m, l) => (typeof l.id === 'number' && l.id > m ? l.id : m), 0);
  }

  // Minute tick — anchors the 24h liquidation window without calling
  // Date.now() during render (react-hooks/purity).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Pause the stream while the tab is hidden — no reason to burn data/battery.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Instant history: REST backfill of recent whale-sized prints, so the tape
  // has content the moment the page opens (the live stream takes over after).
  useEffect(() => {
    let cancelled = false;
    prefetchCoinImages().catch(() => {});
    fetchRecentBigTrades(STREAM_SYMBOLS, MIN_TRADE_USD).then((hist) => {
      if (cancelled || !hist.length) { setBackfilled(true); return; }
      setTrades((prev) => {
        const merged = [...prev, ...hist.map((h) => ({ ...h, id: ++idRef.current }))];
        merged.sort((a, b) => b.t - a.t);
        return merged.slice(0, TRADE_STORE_CAP);
      });
      setBackfilled(true);
    }).catch(() => { if (!cancelled) setBackfilled(true); }); // REST down → show the live feed, not an eternal skeleton
    return () => { cancelled = true; };
  }, []);

  // Live stream (buffered ingest — BTC/ETH can push dozens of events/sec).
  useEffect(() => {
    if (paused) return undefined;
    const stop = openWhaleStream({
      symbols: STREAM_SYMBOLS,
      onStatus: setStatus,
      onLiquidation: (d) => {
        const usd = parseFloat(d.p) * parseFloat(d.v);
        if (!Number.isFinite(usd) || usd < 1000) return;
        // Bybit sends the liquidation ORDER side: a Sell order force-closes a
        // long; a Buy order force-closes a short.
        liqBuf.current.push({ id: ++idRef.current, sym: coinOf(d.s), longLiq: d.S === 'Sell', usd, price: d.p, t: d.T });
      },
      onTrade: (d) => {
        const usd = parseFloat(d.p) * parseFloat(d.v);
        if (!Number.isFinite(usd) || usd < MIN_TRADE_USD) return;
        tradeBuf.current.push({ id: ++idRef.current, sym: coinOf(d.s), buy: d.S === 'Buy', usd, price: d.p, t: d.T });
      },
    });
    const flush = setInterval(() => {
      if (liqBuf.current.length) {
        const add = liqBuf.current.splice(0);
        setLiqs((prev) => {
          const next = [...add.reverse(), ...prev].slice(0, LIQ_STORE_CAP);
          saveStoredLiqs(next); // history survives refreshes/visits
          return next;
        });
      }
      if (tradeBuf.current.length) {
        const add = tradeBuf.current.splice(0);
        setTrades((prev) => [...add.reverse(), ...prev].slice(0, TRADE_STORE_CAP));
      }
    }, 700);
    return () => { clearInterval(flush); stop(); };
  }, [paused]);

  // Whale-flow aggregates over everything currently loaded (backfill + live).
  const flow = useMemo(() => {
    const bySym = new Map();
    let buys = 0, sells = 0;
    for (const tr of trades) {
      if (tr.buy) buys += tr.usd; else sells += tr.usd;
      const cur = bySym.get(tr.sym) || { sym: tr.sym, net: 0, vol: 0, count: 0 };
      cur.net += tr.buy ? tr.usd : -tr.usd;
      cur.vol += tr.usd;
      cur.count++;
      bySym.set(tr.sym, cur);
    }
    const rows = [...bySym.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 8);
    const maxAbs = Math.max(...rows.map((r) => Math.abs(r.net)), 1);
    return { rows, maxAbs, buys, sells };
  }, [trades]);

  // Liquidation totals over the last 24h (from the persisted history).
  const liqStats = useMemo(() => {
    const cutoff = nowTick - DAY_MS;
    let long = 0, short = 0, biggest = 0, biggestSym = '';
    for (const l of liqs) {
      if (l.t < cutoff) continue;
      if (l.longLiq) long += l.usd; else short += l.usd;
      if (l.usd > biggest) { biggest = l.usd; biggestSym = l.sym; }
    }
    return { long, short, biggest, biggestSym };
  }, [liqs, nowTick]);

  const visibleTrades = useMemo(
    () => trades.filter((t) => t.usd >= threshold).slice(0, FEED_RENDER_CAP),
    [trades, threshold],
  );

  return (
    // `embedded` (rendered inside Market Overview) drops the page chrome — the
    // outer padding/max-width and the page-transition animation — and just lays
    // out the sections; the hero header stays and reads as the section title.
    <motion.div
      {...(embedded ? {} : { variants: pageVariants, initial: 'initial', animate: 'animate', exit: 'exit', transition: pageTransition })}
      className={embedded ? 'space-y-4' : 'px-4 py-6 max-w-6xl mx-auto space-y-4'}>

      {/* Header — hero strip in the app's violet→cyan language */}
      <div className="relative overflow-hidden rounded-2xl" style={{ border: '1px solid var(--glass-border)' }}>
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.16) 0%, rgba(99,102,241,0.09) 45%, rgba(6,182,212,0.16) 100%)' }}
        />
        <div className="relative px-4 py-4 md:px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative shrink-0 grid place-items-center w-11 h-11 rounded-xl"
              style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.30)' }}>
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-xl"
                style={{ boxShadow: '0 0 22px 2px rgba(6,182,212,0.30)' }}
                animate={{ opacity: [0.35, 0.8, 0.35] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Waves className="relative w-5.5 h-5.5" style={{ stroke: 'url(#ai-grad)' }} />
            </span>
            <h1 className="flex-1 min-w-0 text-lg md:text-xl font-bold text-gradient leading-tight">מעקב לוויתנים</h1>
            <button
              onClick={() => setShowInfo((s) => !s)}
              className="shrink-0 p-1.5 rounded-full text-text-muted hover:text-accent-primary transition-colors cursor-pointer"
              title="מה רואים כאן?"
            >
              <HelpCircle className="w-4.5 h-4.5" />
            </button>
            <LiveDot status={paused ? 'connecting' : status} />
          </div>
          {/* Subtitle on its own full-width line so it isn't cramped on mobile */}
          <p className="text-[11.5px] md:text-xs text-text-muted mt-2 leading-snug">
            עסקאות ענק, זרימת כסף גדול וחיסולים — בזמן אמת, ישירות מהשוק
          </p>
        </div>
      </div>

      {/* Explanations — collapsed behind the "?" */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-secondary leading-relaxed">
              <div>
                <div className="font-bold text-text-primary mb-0.5">🖨️ עסקאות ענק</div>
                כל הדפסה מעל $50K בפרפים הגדולים. רצף קניות ענק באותו מטבע = כסף גדול נכנס; רצף מכירות = חלוקה. ההיסטוריה נטענת מיד והזרם החי ממשיך ממנה.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-0.5">⚖️ זרימת לוויתנים נטו</div>
                סכום הקניות פחות המכירות של הכסף הגדול, לכל מטבע. פס ירוק ימינה = הלוויתנים צוברים; אדום שמאלה = מחלקים.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-0.5">💥 חיסולים</div>
                פוזיציות ממונפות שנסגרו בכוח. גל חיסולי לונגים = לחץ מכירה שנשרף — לעיתים תחתית מקומית; חיסולי שורטים = דלק לעליות. ההיסטוריה נשמרת אצלך גם בין ביקורים.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Whale summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="קניות לוויתנים (נטען כרגע)"
          value={fmtUsd(flow.buys)}
          Icon={TrendingUp}
          color="text-profit"
          sub="עסקאות ≥ $50K"
          wash="linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.02) 60%, transparent 100%)"
        />
        <StatCard
          label="מכירות לוויתנים (נטען כרגע)"
          value={fmtUsd(flow.sells)}
          Icon={TrendingDown}
          color="text-loss"
          sub="עסקאות ≥ $50K"
          wash="linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.02) 60%, transparent 100%)"
        />
        <StatCard
          label="לונגים שחוסלו · 24ש׳"
          value={fmtUsd(liqStats.long)}
          Icon={Zap}
          color="text-loss"
          sub="מכירות כפויות — לחץ כלפי מטה"
          wash="linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.02) 60%, transparent 100%)"
        />
        <StatCard
          label="שורטים שחוסלו · 24ש׳"
          value={fmtUsd(liqStats.short)}
          Icon={Zap}
          color="text-profit"
          sub={liqStats.biggest > 0 ? `הגדול ביותר: ${fmtUsd(liqStats.biggest)} · ${liqStats.biggestSym}` : 'קניות כפויות — דלק לעליות'}
          wash="linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.02) 60%, transparent 100%)"
        />
      </div>

      {/* Net whale flow — diverging bars per coin */}
      <SectionCard Icon={Scale} title="זרימת לוויתנים נטו — לפי מטבע" badge={<span className="text-[10px] text-text-muted mr-auto">קניות מינוס מכירות · מהעסקאות הגדולות שנטענו</span>}>
        {flow.rows.length === 0 ? (
          <div className="space-y-2 py-1">
            {[...Array(4)].map((_, i) => <div key={i} className="h-7 rounded-lg bg-bg-tertiary animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {flow.rows.map((r) => {
              const pct = (Math.abs(r.net) / flow.maxAbs) * 50;
              const positive = r.net >= 0;
              return (
                <div key={r.sym} dir="ltr" className="flex items-center gap-2">
                  <CoinIcon sym={r.sym} className="w-5 h-5" />
                  <span className="font-mono text-xs font-bold text-text-primary w-11">{r.sym}</span>
                  <div className="relative flex-1 h-4 rounded bg-bg-tertiary/70 overflow-hidden">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border-primary" />
                    <span
                      className={`absolute inset-y-0.5 rounded-sm ${positive ? 'bg-profit/70' : 'bg-loss/70'}`}
                      style={positive ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-black w-20 text-right ${positive ? 'text-profit' : 'text-loss'}`}>{fmtUsd(r.net)}</span>
                  <span className="text-[10px] text-text-muted w-14 text-right hidden sm:inline">{r.count} עסקאות</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Live feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Whale trades tape */}
        <SectionCard
          Icon={CircleDollarSign}
          title="עסקאות לוויתנים"
          badge={(
            <div className="flex gap-1 mr-auto">
              {TRADE_THRESHOLDS.map((t) => (
                <button
                  key={t.v}
                  onClick={() => setThreshold(t.v)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    threshold === t.v
                      ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-bold'
                      : 'bg-bg-primary border-border-primary text-text-muted hover:text-text-primary'
                  }`}
                  dir="ltr"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        >
          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-1">
            {visibleTrades.length === 0 ? (
              !backfilled ? (
                <div className="space-y-1.5 py-1">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-8 rounded-lg bg-bg-tertiary animate-pulse" />)}
                </div>
              ) : (
                <div className="text-xs text-text-muted py-8 text-center">
                  אין כרגע עסקאות מעל {fmtUsd(threshold)} — נסה סף נמוך יותר.
                </div>
              )
            ) : visibleTrades.map((tr) => (
              <FeedRow
                key={tr.id}
                icon={<CoinIcon sym={tr.sym} className="w-4.5 h-4.5" />}
                sym={tr.sym}
                whale={tr.usd >= 1_000_000}
                big={tr.usd >= 1_000_000 && (tr.buy ? 'bg-profit/10 border-profit/40' : 'bg-loss/10 border-loss/40')}
                badge={tr.buy ? 'קנייה' : 'מכירה'}
                badgeClass={tr.buy ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}
                usd={tr.usd}
                usdClass={tr.buy ? 'text-profit' : 'text-loss'}
                price={tr.price}
                t={tr.t}
              />
            ))}
          </div>
        </SectionCard>

        {/* Liquidations */}
        <SectionCard Icon={Zap} title="חיסולים" badge={<span className="text-[10px] text-text-muted mr-auto">היסטוריה נשמרת · Bybit Perps</span>}>
          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-1">
            {liqs.length === 0 ? (
              <div className="text-xs text-text-muted py-8 text-center">
                אוסף חיסולים חיים… הרשימה נבנית ונשמרת מרגע הביקור הראשון, גם בין כניסות.
              </div>
            ) : liqs.map((l) => (
              <FeedRow
                key={l.id ?? `${l.t}-${l.sym}-${l.usd}`}
                icon={<CoinIcon sym={l.sym} className="w-4.5 h-4.5" />}
                sym={l.sym}
                whale={l.usd >= 1_000_000}
                big={l.usd >= 250_000 && (l.longLiq ? 'bg-loss/10 border-loss/40' : 'bg-profit/10 border-profit/40')}
                badge={l.longLiq ? 'לונג חוסל' : 'שורט חוסל'}
                badgeClass={l.longLiq ? 'bg-loss/15 text-loss' : 'bg-profit/15 text-profit'}
                usd={l.usd}
                usdClass={l.longLiq ? 'text-loss' : 'text-profit'}
                price={l.price}
                t={l.t}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted pb-2">
        <Radio className="w-3 h-3" />
        נתונים חיים מה-API הציבורי של Bybit · ללא עלות · אינו ייעוץ השקעות
      </div>
    </motion.div>
  );
}
