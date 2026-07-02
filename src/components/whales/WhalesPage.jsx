import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Waves, HelpCircle, Zap, TrendingUp, TrendingDown,
  Gauge, Radio, Flame, Scale, CircleDollarSign,
} from 'lucide-react';
import { openWhaleStream, fetchFearGreed } from '../../services/whaleStream';
import { fetchLinearTickers, fetchAccountRatio } from '../../services/bybitDirect';
import { pageVariants, pageTransition } from '../../utils/animations';

// Perps we stream live. Liquidations are rare events; trades are heavy on
// BTC/ETH but we drop everything under the minimum notional at ingest.
const STREAM_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT',
];
const MIN_TRADE_USD = 50_000;      // ingest floor for the tape
const TRADE_THRESHOLDS = [
  { v: 50_000, label: '50K+' },
  { v: 100_000, label: '100K+' },
  { v: 250_000, label: '250K+' },
  { v: 1_000_000, label: '1M+' },
];
const FEED_CAP = 70;

const fmtUsd = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtPrice = (p) => {
  const n = parseFloat(p);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : n.toPrecision(4);
};
const fmtTime = (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const coinOf = (sym) => sym.replace(/USDT$/, '');

const FNG_HE = {
  'Extreme Fear': 'פחד קיצוני',
  Fear: 'פחד',
  Neutral: 'ניטרלי',
  Greed: 'חמדנות',
  'Extreme Greed': 'חמדנות קיצונית',
};

// ---- Small building blocks --------------------------------------------------

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
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold mr-auto px-2 py-0.5 rounded-full border"
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

// Fear & Greed — number, Hebrew label, gradient meter with a position marker.
function FearGreedCard({ fng }) {
  const v = fng?.value;
  const tone = v == null ? 'var(--text-muted)' : v < 25 ? '#ef4444' : v < 45 ? '#f59e0b' : v < 55 ? '#a3a3a3' : v < 75 ? '#84cc16' : '#22c55e';
  const delta = fng?.yesterday != null && v != null ? v - fng.yesterday : null;
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="w-4.5 h-4.5" style={{ stroke: 'url(#ai-grad)' }} />
        <h2 className="text-sm font-bold text-text-primary">מדד פחד וחמדנות</h2>
      </div>
      {v == null ? (
        <div className="text-xs text-text-muted py-3">לא זמין כרגע</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: tone }} dir="ltr">{v}</span>
            <span className="text-sm font-semibold" style={{ color: tone }}>{FNG_HE[fng.label] || fng.label}</span>
            {delta != null && delta !== 0 && (
              <span className={`text-[11px] ${delta > 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">
                {delta > 0 ? '+' : ''}{delta} מאתמול
              </span>
            )}
          </div>
          <div className="relative h-2 rounded-full mt-3 overflow-visible"
            style={{ background: 'linear-gradient(90deg,#ef4444 0%,#f59e0b 35%,#a3a3a3 50%,#84cc16 70%,#22c55e 100%)' }}>
            <span className="absolute -top-[3px] w-3.5 h-3.5 rounded-full border-2 border-bg-primary shadow"
              style={{ right: `calc(${100 - v}% - 7px)`, background: tone }} />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted mt-1">
            <span>חמדנות קיצונית</span>
            <span>פחד קיצוני</span>
          </div>
        </>
      )}
    </div>
  );
}

function LiqTotalCard({ label, value, Icon, color, sub }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} /> {label}
      </div>
      <div className={`text-2xl font-black ${color}`} dir="ltr">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ---- Main page ---------------------------------------------------------------

export default function WhalesPage() {
  const [showInfo, setShowInfo] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [paused, setPaused] = useState(false);

  const [liqs, setLiqs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [totals, setTotals] = useState({ long: 0, short: 0, biggest: 0, biggestSym: '' });
  const [threshold, setThreshold] = useState(100_000);

  const [tickers, setTickers] = useState(null);
  const [ratios, setRatios] = useState({});
  const [fng, setFng] = useState(null);

  // Buffered ingest — BTC/ETH tape can push dozens of events/sec; flushing on
  // a timer keeps React renders sane.
  const liqBuf = useRef([]);
  const tradeBuf = useRef([]);
  const totalsRef = useRef({ long: 0, short: 0, biggest: 0, biggestSym: '' });
  const idRef = useRef(0);

  // Pause the stream while the tab is hidden — no reason to burn data/battery.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Live stream
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
        const longLiq = d.S === 'Sell';
        const t = totalsRef.current;
        if (longLiq) t.long += usd; else t.short += usd;
        if (usd > t.biggest) { t.biggest = usd; t.biggestSym = coinOf(d.s); }
        liqBuf.current.push({ id: ++idRef.current, sym: coinOf(d.s), longLiq, usd, price: d.p, t: d.T });
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
        setLiqs((prev) => [...add.reverse(), ...prev].slice(0, FEED_CAP));
        setTotals({ ...totalsRef.current });
      }
      if (tradeBuf.current.length) {
        const add = tradeBuf.current.splice(0);
        setTrades((prev) => [...add.reverse(), ...prev].slice(0, FEED_CAP));
      }
    }, 700);
    return () => { clearInterval(flush); stop(); };
  }, [paused]);

  // Derivatives snapshot — funding/OI for all perps in one call, then the
  // long/short account ratio for the biggest ones. Refreshes every minute.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await fetchLinearTickers();
      if (cancelled || !list) return;
      const top = list
        .filter((t) => t.symbol.endsWith('USDT') && parseFloat(t.openInterestValue) > 0)
        .sort((a, b) => parseFloat(b.openInterestValue) - parseFloat(a.openInterestValue))
        .slice(0, 12);
      setTickers(top);
      const wanted = top.slice(0, 8).map((t) => t.symbol);
      const entries = await Promise.all(wanted.map(async (s) => [s, await fetchAccountRatio(s)]));
      if (!cancelled) setRatios(Object.fromEntries(entries.filter(([, r]) => r)));
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFearGreed().then((f) => { if (!cancelled) setFng(f); });
    return () => { cancelled = true; };
  }, []);

  const visibleTrades = useMemo(() => trades.filter((t) => t.usd >= threshold), [trades, threshold]);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
      className="px-4 py-6 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Waves className="w-6 h-6" style={{ stroke: 'url(#ai-grad)' }} />
        <h1 className="text-xl font-bold text-gradient">מעקב לוויתנים</h1>
        <button
          onClick={() => setShowInfo((s) => !s)}
          className="p-1 rounded-full text-text-muted hover:text-accent-primary transition-colors cursor-pointer"
          title="מה רואים כאן?"
        >
          <HelpCircle className="w-4.5 h-4.5" />
        </button>
        <LiveDot status={paused ? 'connecting' : status} />
      </div>

      {/* Explanations — collapsed behind the "?" like the wallets page */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-text-secondary leading-relaxed">
              <div>
                <div className="font-bold text-text-primary mb-0.5">💥 חיסולים (Liquidations)</div>
                פוזיציות ממונפות שנסגרו בכוח. גל חיסולי לונגים גדול = לחץ מכירה שנגמר מהר — לעיתים תחתית מקומית; חיסולי שורטים = דלק לעליות (short squeeze).
              </div>
              <div>
                <div className="font-bold text-text-primary mb-0.5">🖨️ עסקאות ענק</div>
                הדפסות בשווי $50K ומעלה בפרפים של Bybit בזמן אמת. רצף קניות ענק באותו מטבע = כסף גדול נכנס; רצף מכירות = חלוקה.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-0.5">⚖️ Funding + לונג/שורט</div>
                Funding חיובי גבוה = הלונגים צפופים ומשלמים לשורטים — שוק מחומם שמועד לתיקון. Funding שלילי = דוביות קיצונית, קרקע ל-squeeze.
              </div>
              <div>
                <div className="font-bold text-text-primary mb-0.5">📊 Open Interest (OI)</div>
                כמה כסף פתוח בפוזיציות. OI עולה עם המחיר = מהלך אמיתי עם ביקוש; OI יורד בעלייה = כיסוי שורטים בלבד. הנתונים חינמיים מ-Bybit ומתעדכנים חיים.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top strip: Fear&Greed + session liquidation totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FearGreedCard fng={fng} />
        <LiqTotalCard
          label="לונגים שחוסלו (מאז שנכנסת)"
          value={fmtUsd(totals.long)}
          Icon={TrendingDown}
          color="text-loss"
          sub="מכירות כפויות — לחץ כלפי מטה"
        />
        <LiqTotalCard
          label="שורטים שחוסלו (מאז שנכנסת)"
          value={fmtUsd(totals.short)}
          Icon={TrendingUp}
          color="text-profit"
          sub={totals.biggest > 0 ? `החיסול הגדול ביותר: ${fmtUsd(totals.biggest)} · ${totals.biggestSym}` : 'קניות כפויות — דלק לעליות'}
        />
      </div>

      {/* Live feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Liquidations */}
        <SectionCard Icon={Zap} title="חיסולים חיים" badge={<span className="text-[10px] text-text-muted">Bybit Perps</span>}>
          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-1">
            {liqs.length === 0 ? (
              <div className="text-xs text-text-muted py-8 text-center">
                ממתין לחיסול הבא… <span className="text-text-secondary">(מופיעים ברגע שקורים — לפעמים זה שקט, לפעמים מבול)</span>
              </div>
            ) : liqs.map((l) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${
                  l.usd >= 250_000
                    ? (l.longLiq ? 'bg-loss/10 border-loss/40' : 'bg-profit/10 border-profit/40')
                    : 'bg-bg-primary/40 border-border-primary/60'
                }`}
              >
                {l.usd >= 1_000_000 && <span className="text-sm">🐋</span>}
                <span className="font-mono text-xs font-bold text-text-primary w-12">{l.sym}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  l.longLiq ? 'bg-loss/15 text-loss' : 'bg-profit/15 text-profit'
                }`}>
                  {l.longLiq ? 'לונג חוסל' : 'שורט חוסל'}
                </span>
                <span className={`text-xs font-black mr-auto ${l.longLiq ? 'text-loss' : 'text-profit'}`} dir="ltr">
                  {fmtUsd(l.usd)}
                </span>
                <span className="text-[10px] text-text-muted font-mono" dir="ltr">@{fmtPrice(l.price)}</span>
                <span className="text-[10px] text-text-muted" dir="ltr">{fmtTime(l.t)}</span>
              </motion.div>
            ))}
          </div>
        </SectionCard>

        {/* Large trades tape */}
        <SectionCard
          Icon={CircleDollarSign}
          title="עסקאות ענק"
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
              <div className="text-xs text-text-muted py-8 text-center">
                ממתין לעסקה מעל {fmtUsd(threshold)}… <span className="text-text-secondary">(ב-BTC וב-ETH זה בדרך כלל עניין של שניות)</span>
              </div>
            ) : visibleTrades.map((tr) => (
              <motion.div
                key={tr.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${
                  tr.usd >= 1_000_000
                    ? (tr.buy ? 'bg-profit/10 border-profit/40' : 'bg-loss/10 border-loss/40')
                    : 'bg-bg-primary/40 border-border-primary/60'
                }`}
              >
                {tr.usd >= 1_000_000 && <span className="text-sm">🐋</span>}
                <span className="font-mono text-xs font-bold text-text-primary w-12">{tr.sym}</span>
                {tr.buy
                  ? <TrendingUp className="w-3.5 h-3.5 text-profit" />
                  : <TrendingDown className="w-3.5 h-3.5 text-loss" />}
                <span className={`text-[10px] font-bold ${tr.buy ? 'text-profit' : 'text-loss'}`}>
                  {tr.buy ? 'קנייה' : 'מכירה'}
                </span>
                <span className={`text-xs font-black mr-auto ${tr.buy ? 'text-profit' : 'text-loss'}`} dir="ltr">
                  {fmtUsd(tr.usd)}
                </span>
                <span className="text-[10px] text-text-muted font-mono" dir="ltr">@{fmtPrice(tr.price)}</span>
                <span className="text-[10px] text-text-muted" dir="ltr">{fmtTime(tr.t)}</span>
              </motion.div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Derivatives map */}
      <SectionCard Icon={Scale} title="מפת המינוף — Funding · OI · לונג/שורט" badge={<span className="text-[10px] text-text-muted">מתעדכן כל דקה</span>}>
        {!tickers ? (
          <div className="space-y-2 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-bg-tertiary animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-text-muted border-b border-border-primary">
                  <th className="text-right py-2 font-semibold">מטבע</th>
                  <th className="text-left py-2 font-semibold">מחיר</th>
                  <th className="text-left py-2 font-semibold">24ש׳</th>
                  <th className="text-left py-2 font-semibold">Funding</th>
                  <th className="text-left py-2 font-semibold">OI פתוח</th>
                  <th className="text-right py-2 font-semibold w-40">לונג / שורט</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => {
                  const chg = (parseFloat(t.price24hPcnt) || 0) * 100;
                  const fr = (parseFloat(t.fundingRate) || 0) * 100;
                  const frTone = fr >= 0.1 ? 'text-loss' : fr >= 0.03 ? 'text-amber-400' : fr < 0 ? 'text-accent-primary' : 'text-text-secondary';
                  const r = ratios[t.symbol];
                  const longPct = r ? Math.round(r.longAccount * 100) : null;
                  return (
                    <tr key={t.symbol} className="border-b border-border-primary/40 last:border-0">
                      <td className="py-2.5 font-mono font-bold text-text-primary">
                        {coinOf(t.symbol)}
                        {fr >= 0.1 && <Flame className="inline w-3 h-3 text-loss mr-1" title="Funding חם — לונגים דחוסים" />}
                      </td>
                      <td className="py-2.5 text-left font-mono text-text-primary" dir="ltr">${fmtPrice(t.lastPrice)}</td>
                      <td className={`py-2.5 text-left font-semibold ${chg >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                      </td>
                      <td className={`py-2.5 text-left font-mono font-semibold ${frTone}`} dir="ltr">
                        {fr.toFixed(4)}%
                      </td>
                      <td className="py-2.5 text-left font-mono text-text-secondary" dir="ltr">
                        {fmtUsd(parseFloat(t.openInterestValue))}
                      </td>
                      <td className="py-2.5">
                        {longPct == null ? (
                          <span className="text-text-muted text-[10px]">—</span>
                        ) : (
                          <div>
                            <div className="h-1.5 rounded-full overflow-hidden flex bg-bg-tertiary">
                              <div className="h-full bg-profit" style={{ width: `${longPct}%` }} />
                              <div className="h-full bg-loss" style={{ width: `${100 - longPct}%` }} />
                            </div>
                            <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                              <span className="text-profit">{longPct}% לונג</span>
                              <span className="text-loss">{100 - longPct}%</span>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted pb-2">
        <Radio className="w-3 h-3" />
        נתונים חיים מה-API הציבורי של Bybit ומדד Fear&Greed של alternative.me · ללא עלות · אינו ייעוץ השקעות
      </div>
    </motion.div>
  );
}
