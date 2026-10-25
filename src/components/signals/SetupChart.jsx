import { useState, useEffect } from 'react';
import { fetchKlines } from '../../services/coingeckoApi';

const fmtP = (p) => (p >= 1000 ? Math.round(p).toLocaleString('en-US') : p >= 1 ? p.toFixed(2) : p.toFixed(5));
const W = 320, PAD_L = 6, PAD_R = 56, PAD_TOP = 8;

// Range boundaries + the bar index where each formed, so the line can start at
// the swing that created it (not glued to the left edge). Uses the recent window.
function rangeLevels(bars) {
  const recent = bars.slice(-30);
  if (recent.length < 6) return null;
  const off = bars.length - recent.length;
  let rH = -Infinity, rI = off, sL = Infinity, sI = off;
  recent.forEach((b, i) => {
    if (b.h > rH) { rH = b.h; rI = off + i; }
    if (b.l < sL) { sL = b.l; sI = off + i; }
  });
  return rH > sL ? { resistance: rH, resIdx: rI, support: sL, supIdx: sI } : null;
}

// A dashed level (entry / stop / target). Starts at x1 (where the setup formed,
// not the chart edge) and runs to the price axis, with a tag on the right.
function AnnoLine({ x1, yy, color, textColor, price }) {
  return (
    <g>
      <line x1={x1} y1={yy} x2={W - PAD_R} y2={yy} stroke={color} strokeWidth="1" strokeDasharray="4 3" />
      <rect x={W - PAD_R + 2} y={yy - 7} width={PAD_R - 5} height={14} rx={3} fill={color} />
      <text x={W - (PAD_R - 2) / 2} y={yy + 3.4} fill={textColor} fontSize="11" fontWeight="700" textAnchor="middle">{fmtP(price)}</text>
    </g>
  );
}

// Professional OHLC BAR chart in the trader's own style: WHITE bars, a VOLUME
// panel underneath, horizontal range S/R lines drawn from where they formed, and
// a position tool (entry / stop / target with red risk + green reward boxes at
// the setup). `vh` = viewBox height for this instance.
export default function SetupChart({ pair, entryPrice, stopLoss, interval = '30m', label, tps = [], vh = 132, showPosition = true }) {
  const [bars, setBars] = useState(null);
  const tp = Array.isArray(tps) && tps.length ? Number(tps[0]) : null;
  const H = vh;

  useEffect(() => {
    let alive = true;
    // ~90 bars so the range-forming events (SC / AR / BC) are visible to the left.
    fetchKlines(pair, interval, 90)
      .then((rows) => {
        if (!alive) return;
        setBars(rows
          .map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }))
          // Drop any malformed candle so one NaN can't blow up the whole scale.
          .filter((b) => Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l) && Number.isFinite(b.c)));
      })
      .catch(() => { if (alive) setBars([]); });
    return () => { alive = false; };
  }, [pair, interval]);

  if (bars === null) return <div className="rounded-lg bg-bg-tertiary/40 animate-pulse" style={{ height: Math.round(vh * 0.86) }} />;
  if (!bars.length) return null;

  const rng = rangeLevels(bars);
  // Position geometry: infer direction from entry vs stop, then a reward target —
  // the explicit TP if the setup has one, else a standard 2R projection so the
  // position tool shows a full risk/reward like the TradingView position tool.
  const isShort = entryPrice != null && stopLoss != null && Number(stopLoss) > Number(entryPrice);
  const risk = entryPrice != null && stopLoss != null ? Math.abs(entryPrice - stopLoss) : null;
  const target = tp != null ? tp : (risk ? (isShort ? entryPrice - 2 * risk : entryPrice + 2 * risk) : null);
  // HTF context charts scale to price + range only; the entry timeframe (30m)
  // also fits the full position (entry / stop / target).
  const extra = (showPosition ? [entryPrice, stopLoss, target, rng?.resistance, rng?.support] : [rng?.resistance, rng?.support]).filter((v) => v != null);
  const hi = Math.max(...bars.map((b) => b.h), ...extra);
  const lo = Math.min(...bars.map((b) => b.l), ...extra);
  const span = hi - lo || 1;

  const priceBottom = Math.round(H * 0.73);
  const volTop = Math.round(H * 0.80);
  const volBottom = H - 2;
  const y = (p) => PAD_TOP + (priceBottom - PAD_TOP) * (1 - (p - lo) / span);
  const maxVol = Math.max(...bars.map((b) => b.v), 1);
  const vy = (v) => volBottom - (volBottom - volTop) * (v / maxVol);

  const plotW = W - PAD_L - PAD_R;
  const bw = plotW / bars.length;
  const cx = (i) => PAD_L + i * bw + bw / 2;
  const tick = Math.max(0.9, Math.min(bw * 0.34, 4));
  // Keep the position tool a CONTAINED zone near the center (not glued to the
  // right edge) so the Wyckoff process is the focus, with room to its right.
  const procL = PAD_L + plotW * 0.42;
  const procR = PAD_L + plotW * 0.82;

  const eY = entryPrice != null ? y(entryPrice) : null;
  const sY = stopLoss != null ? y(stopLoss) : null;
  const tY = target != null ? y(target) : null;

  return (
    <div className="rounded-lg bg-black overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        {/* Faint price grid + right-axis ticks (TradingView feel) */}
        {[0.12, 0.5, 0.88].map((f) => {
          const gp = lo + f * span;
          const gy = y(gp);
          return (
            <g key={`grid-${f}`}>
              <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} stroke="#2a2a2a" strokeWidth="0.4" />
              <text x={W - PAD_R + 3} y={gy + 3} fill="#c8c8d4" fontSize="11">{fmtP(gp)}</text>
            </g>
          );
        })}
        {/* Position tool — ONLY on the entry timeframe (30m): a CONTAINED, centered
            RISK (red) + REWARD (green) pair with the entry as the solid pivot. */}
        {showPosition && eY != null && sY != null && (
          <rect x={procL} y={Math.min(eY, sY)} width={procR - procL} height={Math.abs(sY - eY)}
            fill="rgba(244,63,94,0.16)" stroke="rgba(244,63,94,0.55)" strokeWidth="0.5" />
        )}
        {showPosition && eY != null && tY != null && (
          <rect x={procL} y={Math.min(eY, tY)} width={procR - procL} height={Math.abs(tY - eY)}
            fill="rgba(34,197,94,0.16)" stroke="rgba(34,197,94,0.55)" strokeWidth="0.5" />
        )}
        {showPosition && eY != null && (
          <line x1={procL} y1={eY} x2={W - PAD_R} y2={eY} stroke="#007ba7" strokeWidth="1.2" />
        )}
        {/* Range support / resistance — the structure/context, from where each formed */}
        {rng && (
          <>
            <line x1={cx(rng.resIdx)} y1={y(rng.resistance)} x2={W - PAD_R} y2={y(rng.resistance)} stroke="#e2e8f0" strokeWidth="0.8" opacity="0.9" />
            <line x1={cx(rng.supIdx)} y1={y(rng.support)} x2={W - PAD_R} y2={y(rng.support)} stroke="#e2e8f0" strokeWidth="0.8" opacity="0.9" />
          </>
        )}
        {/* WHITE OHLC bars */}
        {bars.map((b, i) => {
          const x0 = cx(i);
          return (
            <g key={i} stroke="#e6edf6" strokeWidth="0.9" strokeLinecap="round">
              <line x1={x0} y1={y(b.h)} x2={x0} y2={y(b.l)} />
              <line x1={x0 - tick} y1={y(b.o)} x2={x0} y2={y(b.o)} />
              <line x1={x0} y1={y(b.c)} x2={x0 + tick} y2={y(b.c)} />
            </g>
          );
        })}
        {/* Volume panel — WHITE bars */}
        <line x1={PAD_L} y1={volTop - 3} x2={W - PAD_R} y2={volTop - 3} stroke="#333333" strokeWidth="0.5" />
        {bars.map((b, i) => (
          <rect key={`v${i}`} x={cx(i) - bw * 0.3} y={vy(b.v)} width={Math.max(0.6, bw * 0.6)} height={Math.max(0, volBottom - vy(b.v))}
            fill={b.c >= b.o ? 'rgba(230,237,246,0.5)' : 'rgba(230,237,246,0.26)'} />
        ))}
        {/* Position levels + label — entry timeframe only */}
        {showPosition && label && sY != null && <text x={procL + 2} y={sY - 5} fill="#fb7185" fontSize="12" fontWeight="800">{label}</text>}
        {showPosition && tY != null && <AnnoLine x1={procL} yy={tY} color="#22c55e" textColor="#04140b" price={target} />}
        {showPosition && sY != null && <AnnoLine x1={procL} yy={sY} color="#f43f5e" textColor="#1a0209" price={stopLoss} />}
        {showPosition && eY != null && (
          <g>
            <rect x={W - PAD_R + 2} y={eY - 7} width={PAD_R - 5} height={14} rx={3} fill="#007ba7" />
            <text x={W - (PAD_R - 2) / 2} y={eY + 3.4} fill="#ffffff" fontSize="11" fontWeight="700" textAnchor="middle">{fmtP(entryPrice)}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
