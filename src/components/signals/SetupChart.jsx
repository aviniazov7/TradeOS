import { useState, useEffect } from 'react';
import { fetchKlines } from '../../services/coingeckoApi';

const fmtP = (p) => (p >= 1000 ? Math.round(p).toLocaleString('en-US') : p >= 1 ? p.toFixed(2) : p.toFixed(5));

// Fixed chart geometry (viewBox units); the SVG scales to its container width.
const W = 320, H = 132, PAD_L = 6, PAD_R = 56, PAD_Y = 10;

// A dashed horizontal level (entry / stop / target) with a price tag on the right.
function AnnoLine({ yy, color, textColor, price }) {
  return (
    <g>
      <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke={color} strokeWidth="1" strokeDasharray="4 3" />
      <rect x={W - PAD_R + 2} y={yy - 7} width={PAD_R - 5} height={14} rx={3} fill={color} />
      <text x={W - (PAD_R - 2) / 2} y={yy + 3.4} fill={textColor} fontSize="8.5" fontWeight="700" textAnchor="middle">{fmtP(price)}</text>
    </g>
  );
}

// Annotated OHLC BAR chart (bars, not candlesticks) with a TradingView-style
// position tool: the entry / stop / target levels, a RED risk box (entry↔stop)
// and a GREEN reward box (entry↔target). Teal = up bar, red = down bar.
export default function SetupChart({ pair, entryPrice, stopLoss, interval = '30m', label, tps = [] }) {
  const [bars, setBars] = useState(null);
  const tp = Array.isArray(tps) && tps.length ? Number(tps[0]) : null;

  useEffect(() => {
    let alive = true;
    fetchKlines(pair, interval, 56)
      .then((rows) => {
        if (!alive) return;
        setBars(rows.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4] })));
      })
      .catch(() => { if (alive) setBars([]); });
    return () => { alive = false; };
  }, [pair, interval]);

  if (bars === null) return <div className="h-[120px] rounded-lg bg-bg-tertiary/40 animate-pulse" />;
  if (!bars.length) return null;

  const extra = [entryPrice, stopLoss, tp].filter((v) => v != null);
  const hi = Math.max(...bars.map((b) => b.h), ...extra);
  const lo = Math.min(...bars.map((b) => b.l), ...extra);
  const range = hi - lo || 1;
  const y = (p) => PAD_Y + (H - 2 * PAD_Y) * (1 - (p - lo) / range);
  const plotW = W - PAD_L - PAD_R;
  const bw = plotW / bars.length;
  const cx = (i) => PAD_L + i * bw + bw / 2;
  const tick = Math.max(1.2, Math.min(bw * 0.34, 4));

  const eY = entryPrice != null ? y(entryPrice) : null;
  const sY = stopLoss != null ? y(stopLoss) : null;
  const tY = tp != null ? y(tp) : null;
  const zoneW = W - PAD_R - PAD_L;

  return (
    <div className="rounded-lg bg-bg-primary/50 border border-border-primary/60 overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        {/* Position tool: risk box (entry↔stop) + reward box (entry↔target) */}
        {eY != null && sY != null && (
          <rect x={PAD_L} y={Math.min(eY, sY)} width={zoneW} height={Math.abs(sY - eY)} fill="rgba(244,63,94,0.10)" />
        )}
        {eY != null && tY != null && (
          <rect x={PAD_L} y={Math.min(eY, tY)} width={zoneW} height={Math.abs(tY - eY)} fill="rgba(34,197,94,0.10)" />
        )}
        {/* OHLC bars: high-low stick, open tick left, close tick right */}
        {bars.map((b, i) => {
          const up = b.c >= b.o;
          const col = up ? '#26a69a' : '#ef5350';
          const x0 = cx(i);
          return (
            <g key={i} stroke={col} strokeWidth="1.15" strokeLinecap="round">
              <line x1={x0} y1={y(b.h)} x2={x0} y2={y(b.l)} />
              <line x1={x0 - tick} y1={y(b.o)} x2={x0} y2={y(b.o)} />
              <line x1={x0} y1={y(b.c)} x2={x0 + tick} y2={y(b.c)} />
            </g>
          );
        })}
        {/* setup label (LPSY / LPS) near the swing / stop */}
        {label && sY != null && (
          <text x={PAD_L + 3} y={sY - 5} fill="#f43f5e" fontSize="9" fontWeight="800">{label}</text>
        )}
        {tY != null && <AnnoLine yy={tY} color="#22c55e" textColor="#04140b" price={tp} />}
        {eY != null && <AnnoLine yy={eY} color="#38bdf8" textColor="#04141f" price={entryPrice} />}
        {sY != null && <AnnoLine yy={sY} color="#f43f5e" textColor="#1a0209" price={stopLoss} />}
      </svg>
    </div>
  );
}
