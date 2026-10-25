import { useState, useEffect, useRef, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, Zap, TrendingUp, TrendingDown,
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
        style={{ background: 'linear-gradient(135deg,#8b5cf6,#007ba7)' }}
      >
        {sym.slice(0, 1)}
      </span>
    );
  }
  return <img src={url} alt={sym} loading="lazy" onError={() => setErr(true)} className={`${className} rounded-full shrink-0 object-cover`} />;
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

// A single feed row — LTR so the coin sits on the LEFT and numbers read
// naturally, while the badges stay Hebrew. $1M+ prints are highlighted.
function FeedRow({ whale, sym, badge, badgeClass, usd, usdClass, price, t, highlight }) {
  return (
    <m.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      dir="ltr"
      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg border-t border-border-primary/50 first:border-t-0 ${highlight || ''}`}
    >
      <CoinIcon sym={sym} className="w-6 h-6" />
      <span className="font-mono text-sm font-bold text-text-primary w-12">{sym}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}>{badge}</span>
      {whale && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">1M+</span>}
      <span className={`num-mono text-sm font-bold ml-auto ${usdClass}`}>{fmtUsd(usd)}</span>
      <span className="num-mono text-xs text-text-secondary hidden sm:inline w-20 text-right">@{fmtPrice(price)}</span>
      <span className="num-mono text-xs text-text-secondary w-11 text-right">{fmtWhen(t)}</span>
    </m.div>
  );
}

// Two amounts as one bar (first on the right in RTL).
function SplitBar({ a, b, aClass, bClass }) {
  const total = a + b;
  // Nothing yet → a neutral bar, not a fake 50/50 split.
  if (!total) return <div className="h-2.5 rounded-full bg-bg-tertiary" />;
  const pa = (a / total) * 100;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-bg-tertiary">
      <span className={`h-full transition-all duration-500 ${aClass}`} style={{ width: `${pa}%` }} />
      <span className={`h-full transition-all duration-500 ${bClass}`} style={{ width: `${100 - pa}%` }} />
    </div>
  );
}

const panel = 'bg-bg-secondary border border-border-primary rounded-2xl p-4 md:p-5';

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

  const net = flow.buys - flow.sells;
  const liqTotal = liqStats.long + liqStats.short;
  const liqLead = liqTotal === 0 ? null : liqStats.long >= liqStats.short
    ? 'בעיקר לונגים — לחץ מכירה'
    : 'בעיקר שורטים — דלק לעליות';

  return (
    <m.div
      {...(embedded ? {} : { variants: pageVariants, initial: 'initial', animate: 'animate', exit: 'exit', transition: pageTransition })}
      className={embedded ? 'space-y-4' : 'px-4 py-6 max-w-6xl mx-auto space-y-4'}>

      {/* Status line — the page header above already names the page. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <LiveDot status={paused ? 'connecting' : status} />
          <span className="text-sm text-text-secondary">עסקאות ענק, זרימת כסף גדול וחיסולים — ישירות מהשוק</span>
        </div>
        <button
          onClick={() => setShowInfo((v) => !v)}
          aria-expanded={showInfo}
          className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${showInfo ? 'bg-accent-primary/12 border-accent-primary/40 text-accent-hover' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}
        >
          <HelpCircle className="w-4 h-4" /> מה רואים כאן?
        </button>
      </div>

      {/* Explanations — collapsed behind the button */}
      <AnimatePresence>
        {showInfo && (
          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={`${panel} grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-text-secondary leading-relaxed`}>
              <div>
                <div className="font-bold text-text-primary mb-1">עסקאות ענק</div>
                כל עסקה מעל $50K בחוזים הגדולים. רצף קניות ענק באותו מטבע = כסף גדול נכנס; רצף מכירות = חלוקה.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-1">כסף גדול נטו</div>
                קניות פחות מכירות של העסקאות הגדולות. חיובי = הלוויתנים צוברים; שלילי = מחלקים.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-1">חיסולים</div>
                פוזיציות ממונפות שנסגרו בכוח. גל חיסולי לונגים = לחץ מכירה שנשרף, לפעמים תחתית מקומית; חיסולי שורטים = דלק לעליות.
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* The two headline numbers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${panel} flex flex-col gap-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-text-primary inline-flex items-center gap-2"><Scale className="w-4 h-4 text-accent-hover" /> כסף גדול · נטו</h2>
            <span className="text-xs text-text-secondary">מהעסקאות הגדולות שנטענו</span>
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <b dir="ltr" className={`num-mono text-3xl md:text-4xl font-extrabold leading-none ${net >= 0 ? 'text-profit' : 'text-loss'}`}>{net > 0 ? '+' : ''}{fmtUsd(net)}</b>
            <span className="text-sm text-text-secondary">{flow.buys + flow.sells === 0 ? 'אוסף נתונים…' : net >= 0 ? 'הלוויתנים קונים' : 'הלוויתנים מוכרים'}</span>
          </div>
          <SplitBar a={flow.buys} b={flow.sells} aClass="bg-profit" bClass="bg-loss" />
          <div className="flex justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-text-secondary"><TrendingUp className="w-4 h-4 text-profit" /> קניות <b dir="ltr" className="num-mono text-profit">{fmtUsd(flow.buys)}</b></span>
            <span className="inline-flex items-center gap-1.5 text-text-secondary"><TrendingDown className="w-4 h-4 text-loss" /> מכירות <b dir="ltr" className="num-mono text-loss">{fmtUsd(flow.sells)}</b></span>
          </div>
        </section>

        <section className={`${panel} flex flex-col gap-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-text-primary inline-flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> חיסולים · 24 שעות</h2>
            <span className="text-xs text-text-secondary">Bybit · נשמר אצלך</span>
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <b dir="ltr" className="num-mono text-3xl md:text-4xl font-extrabold leading-none text-text-primary">{fmtUsd(liqTotal)}</b>
            <span className="text-sm text-text-secondary">{liqLead || 'אין חיסולים ב-24 השעות האחרונות'}</span>
          </div>
          <SplitBar a={liqStats.long} b={liqStats.short} aClass="bg-loss" bClass="bg-profit" />
          <div className="flex justify-between gap-2 text-sm flex-wrap">
            <span className="text-text-secondary">לונגים <b dir="ltr" className="num-mono text-loss">{fmtUsd(liqStats.long)}</b></span>
            {liqStats.biggest > 0 && <span className="text-xs text-text-secondary self-center">הגדול: <b dir="ltr" className="num-mono text-text-primary">{fmtUsd(liqStats.biggest)}</b> · {liqStats.biggestSym}</span>}
            <span className="text-text-secondary">שורטים <b dir="ltr" className="num-mono text-profit">{fmtUsd(liqStats.short)}</b></span>
          </div>
        </section>
      </div>

      {/* Net whale flow — diverging bars per coin */}
      <section className={panel}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-[15px] font-bold text-text-primary">זרימה לפי מטבע</h2>
          <span className="text-xs text-text-secondary">ירוק = נטו קניות · אדום = נטו מכירות</span>
        </div>
        {flow.rows.length === 0 ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-7 rounded-lg bg-bg-tertiary animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {flow.rows.map((r) => {
              const w = (Math.abs(r.net) / flow.maxAbs) * 50;
              const positive = r.net >= 0;
              return (
                <div key={r.sym} dir="ltr" className="flex items-center gap-2.5">
                  <CoinIcon sym={r.sym} className="w-6 h-6" />
                  <span className="font-mono text-sm font-bold text-text-primary w-12">{r.sym}</span>
                  <div className="relative flex-1 h-3 rounded-full bg-bg-tertiary overflow-hidden">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border-hover" />
                    <span className={`absolute inset-y-0 rounded-full ${positive ? 'bg-profit' : 'bg-loss'}`}
                      style={positive ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
                  </div>
                  <span className={`num-mono text-sm font-bold w-20 text-right ${positive ? 'text-profit' : 'text-loss'}`}>{positive ? '+' : ''}{fmtUsd(r.net)}</span>
                  <span className="text-xs text-text-secondary w-16 text-right hidden sm:inline">{r.count} עסקאות</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-[15px] font-bold text-text-primary inline-flex items-center gap-2"><CircleDollarSign className="w-4 h-4 text-accent-hover" /> עסקאות לוויתנים</h2>
            <div className="flex gap-1" role="group" aria-label="סף">
              {TRADE_THRESHOLDS.map((t) => (
                <button key={t.v} onClick={() => setThreshold(t.v)} aria-pressed={threshold === t.v} dir="ltr"
                  className={`h-7 text-[11px] px-2.5 rounded-full border transition-colors cursor-pointer font-semibold ${threshold === t.v ? 'bg-accent-primary/15 border-accent-primary/50 text-accent-hover' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[440px] overflow-y-auto overscroll-contain -mx-2">
            {visibleTrades.length === 0 ? (
              !backfilled ? (
                <div className="space-y-1.5 px-2 py-1">{[...Array(6)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-bg-tertiary animate-pulse" />)}</div>
              ) : (
                <div className="text-sm text-text-secondary py-10 text-center">אין כרגע עסקאות מעל {fmtUsd(threshold)} — נסה סף נמוך יותר.</div>
              )
            ) : visibleTrades.map((tr) => (
              <FeedRow
                key={tr.id}
                sym={tr.sym}
                whale={tr.usd >= 1_000_000}
                highlight={tr.usd >= 1_000_000 ? (tr.buy ? 'bg-profit/8' : 'bg-loss/8') : ''}
                badge={tr.buy ? 'קנייה' : 'מכירה'}
                badgeClass={tr.buy ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}
                usd={tr.usd}
                usdClass={tr.buy ? 'text-profit' : 'text-loss'}
                price={tr.price}
                t={tr.t}
              />
            ))}
          </div>
        </section>

        <section className={panel}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-[15px] font-bold text-text-primary inline-flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> חיסולים</h2>
            <span className="text-xs text-text-secondary">היסטוריה נשמרת בין ביקורים</span>
          </div>
          <div className="max-h-[440px] overflow-y-auto overscroll-contain -mx-2">
            {liqs.length === 0 ? (
              <div className="text-sm text-text-secondary py-10 text-center leading-relaxed px-4">אוסף חיסולים חיים… הרשימה נבנית מרגע הביקור הראשון ונשמרת גם בין כניסות.</div>
            ) : liqs.map((l) => (
              <FeedRow
                key={l.id ?? `${l.t}-${l.sym}-${l.usd}`}
                sym={l.sym}
                whale={l.usd >= 1_000_000}
                highlight={l.usd >= 250_000 ? (l.longLiq ? 'bg-loss/8' : 'bg-profit/8') : ''}
                badge={l.longLiq ? 'לונג חוסל' : 'שורט חוסל'}
                badgeClass={l.longLiq ? 'bg-loss/15 text-loss' : 'bg-profit/15 text-profit'}
                usd={l.usd}
                usdClass={l.longLiq ? 'text-loss' : 'text-profit'}
                price={l.price}
                t={l.t}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted pb-2">
        <Radio className="w-3.5 h-3.5" />
        נתונים חיים מה-API הציבורי של Bybit · אינו ייעוץ השקעות
      </div>
    </m.div>
  );
}
