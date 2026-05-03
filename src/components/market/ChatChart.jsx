import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { computeMA, computeFibonacci, computeSupportResistance } from '../../utils/technicals';

function formatPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(6)}`;
}

export default function ChatChart({ prices, coinSymbol }) {
  const { chartData, ma7, ma14, fib, support, resistance, chartColor } = useMemo(() => {
    if (!prices?.length) return {};

    const rawPrices = prices.map(([, p]) => p);
    const data = prices.map(([ts, price]) => ({
      date: `${new Date(ts).getDate()}/${new Date(ts).getMonth() + 1}`,
      price,
    }));

    return {
      chartData: data,
      ma7: computeMA(rawPrices, 7),
      ma14: computeMA(rawPrices, 14),
      fib: computeFibonacci(rawPrices),
      ...computeSupportResistance(rawPrices),
      chartColor: rawPrices[rawPrices.length - 1] >= rawPrices[0] ? '#22c55e' : '#ef4444',
    };
  }, [prices]);

  if (!chartData?.length) return null;

  return (
    <div className="mb-3 rounded-xl bg-bg-tertiary/50 border border-border-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-[10px] font-bold text-text-primary font-mono">{coinSymbol}/USDT</span>
        <span className="text-[9px] text-text-muted">30 ימים</span>
      </div>

      {/* Chart */}
      <div className="h-44 px-1 pt-2" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`chatGrad-${coinSymbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#666' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#666' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1 ? `$${v.toLocaleString()}` : `$${v.toFixed(4)}`} width={55} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, fontSize: 11, padding: '6px 10px' }}
              labelStyle={{ color: '#999' }}
              formatter={(v) => [formatPrice(v), 'מחיר']}
            />

            {/* Support & Resistance */}
            {support && <ReferenceLine y={support} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'S', position: 'left', fill: '#22c55e', fontSize: 9, fontWeight: 700 }} />}
            {resistance && <ReferenceLine y={resistance} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'R', position: 'left', fill: '#ef4444', fontSize: 9, fontWeight: 700 }} />}

            {/* Fibonacci Levels */}
            {fib && Object.entries(fib.levels).map(([level, price]) => (
              <ReferenceLine key={level} y={price} stroke="#a78bfa" strokeDasharray="3 4" strokeWidth={0.8} strokeOpacity={0.6} label={{ value: level, position: 'right', fill: '#a78bfa', fontSize: 8 }} />
            ))}

            {/* Moving Averages */}
            {ma7 && <ReferenceLine y={ma7} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />}
            {ma14 && <ReferenceLine y={ma14} stroke="#06b6d4" strokeDasharray="4 4" strokeWidth={1} />}

            <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill={`url(#chatGrad-${coinSymbol})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-border-primary">
        <span className="flex items-center gap-1 text-[8px] text-text-muted"><span className="w-2 h-0.5 bg-amber-500 rounded inline-block" /> MA7</span>
        <span className="flex items-center gap-1 text-[8px] text-text-muted"><span className="w-2 h-0.5 bg-cyan-500 rounded inline-block" /> MA14</span>
        <span className="flex items-center gap-1 text-[8px] text-text-muted"><span className="w-2 h-0.5 bg-green-500 rounded inline-block" /> תמיכה</span>
        <span className="flex items-center gap-1 text-[8px] text-text-muted"><span className="w-2 h-0.5 bg-red-500 rounded inline-block" /> התנגדות</span>
        <span className="flex items-center gap-1 text-[8px] text-text-muted"><span className="w-2 h-0.5 bg-purple-400 rounded inline-block" /> פיב׳</span>
      </div>
    </div>
  );
}
