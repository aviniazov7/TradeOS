import { LRM } from '../../utils/formatters';
export default function SignalTrack({ signal, currentPrice }) {
  const { entryPrice, stopLoss, tps = [], direction } = signal;

  if (!entryPrice || !stopLoss) return null;

  const isLong = direction === 'long';
  const allPrices = [stopLoss, entryPrice, ...tps];
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const rawRange = rawMax - rawMin;
  if (rawRange === 0) return null;

  // Add 8% padding on each side so edge dots aren't clipped
  const pad = rawRange * 0.08;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min;

  const pct = (price) => Math.max(1, Math.min(99, ((price - min) / range) * 100));

  const slPct = pct(stopLoss);
  const entryPct = pct(entryPrice);
  const currentPct = currentPrice != null ? Math.max(0, Math.min(100, ((currentPrice - min) / range) * 100)) : null;
  const tpPcts = tps.map(pct);

  // Color zones: for long — red from SL to entry, green from entry to last TP
  // For short — green from last TP to entry, red from entry to SL
  const sortedTpPcts = [...tpPcts].sort((a, b) => isLong ? a - b : b - a);
  const lastTpPct = sortedTpPcts[sortedTpPcts.length - 1];

  const redStart = isLong ? slPct : entryPct;
  const redEnd = isLong ? entryPct : slPct;
  const greenStart = isLong ? entryPct : (tpPcts.length ? Math.min(...tpPcts) : entryPct);
  const greenEnd = isLong ? (tpPcts.length ? Math.max(...tpPcts) : entryPct) : entryPct;

  // PnL % toward current price
  let pnlPct = null;
  if (currentPrice != null) {
    if (isLong) pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    else pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  return (
    <div dir="ltr" className="mt-2 px-1">
      {/* Track */}
      <div className="relative h-1.5 rounded-full bg-bg-tertiary">
        {/* Red zone */}
        <div
          className="absolute top-0 bottom-0 bg-loss/50 rounded-full"
          style={{ left: `${redStart}%`, width: `${Math.max(0, redEnd - redStart)}%` }}
        />
        {/* Green zone */}
        <div
          className="absolute top-0 bottom-0 bg-profit/50 rounded-full"
          style={{ left: `${greenStart}%`, width: `${Math.max(0, greenEnd - greenStart)}%` }}
        />
        {/* SL dot */}
        <Dot pct={slPct} color="bg-loss" size="w-2.5 h-2.5" />
        {/* Entry dot */}
        <Dot pct={entryPct} color="bg-accent-primary" size="w-2.5 h-2.5" ring />
        {/* TP dots */}
        {tpPcts.map((tp, i) => (
          <Dot key={i} pct={tp} color="bg-profit" size="w-2 h-2" />
        ))}
        {/* Current price dot */}
        {currentPct != null && (
          <div
            className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-accent-primary border-2 border-bg-primary z-10 transition-[left] duration-700"
            style={{ left: `${currentPct}%`, transform: 'translate(-50%,-50%)' }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="relative mt-1.5 h-4">
        <Label pct={slPct} text="SL" className="text-loss" />
        <Label pct={entryPct} text="כניסה" className="text-accent-primary" />
        {tpPcts.map((tp, i) => (
          <Label key={i} pct={tp} text={`TP${i + 1}`} className="text-profit" />
        ))}
      </div>

      {/* PnL indicator */}
      {pnlPct != null && (
        <div className={`text-right text-[11px] font-semibold mt-0.5 ${pnlPct >= 0 ? 'text-profit' : 'text-loss'}`}>
          {LRM}{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function Dot({ pct, color, size, ring }) {
  return (
    <div
      className={`absolute top-1/2 ${size} rounded-full ${color} border border-bg-primary ${ring ? 'ring-1 ring-accent-primary/50' : ''}`}
      style={{ left: `${pct}%`, transform: 'translate(-50%,-50%)' }}
    />
  );
}

function Label({ pct, text, className }) {
  return (
    <span
      className={`absolute text-[10px] font-medium ${className} whitespace-nowrap`}
      style={{ left: `${pct}%`, transform: 'translateX(-50%)', top: 0 }}
    >
      {text}
    </span>
  );
}
