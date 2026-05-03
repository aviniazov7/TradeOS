import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, Flame, Snowflake } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { useTrades } from '../../hooks/useTrades';
import { useJournalContext } from '../../contexts/JournalContext';
import { useStats } from '../../hooks/useStats';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { calculateMaxDrawdown } from '../../utils/calculations';
import { pageVariants, pageTransition } from '../../utils/animations';

const tooltipStyle = { background: '#141414', border: '1px solid #1a1a1a', borderRadius: '8px', fontSize: '12px', color: '#f0f0f0' };
const COLORS = ['#22c55e', '#ef4444', '#eab308'];

export default function AdvancedStats() {
  const { activeJournalId } = useJournalContext();
  const { trades, loading } = useTrades(activeJournalId);
  const stats = useStats(trades);

  const analytics = useMemo(() => {
    const closed = trades.filter((t) => t.exitPrice > 0);
    if (!closed.length) return null;

    const wins = closed.filter((t) => t.result === 'win');
    const losses = closed.filter((t) => t.result === 'loss');
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0) / losses.length) : 0;
    const largestWin = wins.length ? Math.max(...wins.map((t) => t.netPnl ?? t.pnl ?? 0)) : 0;
    const largestLoss = losses.length ? Math.min(...losses.map((t) => t.netPnl ?? t.pnl ?? 0)) : 0;

    // Equity curve for drawdown
    const sorted = [...closed].sort((a, b) => {
      const da = a.exitDate?.toDate ? a.exitDate.toDate() : new Date(a.exitDate);
      const db = b.exitDate?.toDate ? b.exitDate.toDate() : new Date(b.exitDate);
      return da - db;
    });
    let equity = 0;
    const equityCurve = sorted.map((t) => { equity += t.netPnl ?? t.pnl ?? 0; return equity; });
    const maxDrawdown = calculateMaxDrawdown(equityCurve);

    // Win/Loss/BE pie
    const be = closed.filter((t) => t.result === 'breakeven').length;
    const pieData = [
      { name: 'רווח', value: wins.length },
      { name: 'הפסד', value: losses.length },
      { name: 'אפס', value: be },
    ].filter((d) => d.value > 0);

    // Daily PnL
    const dailyMap = {};
    sorted.forEach((t) => {
      const d = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
      const key = format(d, 'MM/dd');
      if (!dailyMap[key]) dailyMap[key] = 0;
      dailyMap[key] += t.netPnl ?? t.pnl ?? 0;
    });
    const dailyPnL = Object.entries(dailyMap).map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));

    // By pair
    const pairMap = {};
    closed.forEach((t) => {
      if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, losses: 0, pnl: 0 };
      if (t.result === 'win') pairMap[t.pair].wins++;
      else pairMap[t.pair].losses++;
      pairMap[t.pair].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const byPair = Object.entries(pairMap).map(([pair, d]) => ({ pair, ...d, winRate: ((d.wins / (d.wins + d.losses)) * 100) })).sort((a, b) => b.pnl - a.pnl);

    // By timeframe
    const tfMap = {};
    closed.forEach((t) => {
      const tf = t.timeframe || 'N/A';
      if (!tfMap[tf]) tfMap[tf] = { wins: 0, total: 0, pnl: 0 };
      tfMap[tf].total++;
      if (t.result === 'win') tfMap[tf].wins++;
      tfMap[tf].pnl += t.netPnl ?? t.pnl ?? 0;
    });
    const byTimeframe = Object.entries(tfMap).map(([tf, d]) => ({ timeframe: tf, ...d, winRate: ((d.wins / d.total) * 100) })).sort((a, b) => b.pnl - a.pnl);

    // Streaks
    let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
    sorted.forEach((t) => {
      if (t.result === 'win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
      else if (t.result === 'loss') { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
      else { curWin = 0; curLoss = 0; }
    });

    // By direction
    const longTrades = closed.filter((t) => t.direction === 'long');
    const shortTrades = closed.filter((t) => t.direction === 'short');
    const longWinRate = longTrades.length ? (longTrades.filter((t) => t.result === 'win').length / longTrades.length) * 100 : 0;
    const shortWinRate = shortTrades.length ? (shortTrades.filter((t) => t.result === 'win').length / shortTrades.length) * 100 : 0;
    const longPnl = longTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);
    const shortPnl = shortTrades.reduce((s, t) => s + (t.netPnl ?? t.pnl ?? 0), 0);

    return { avgWin, avgLoss, largestWin, largestLoss, maxDrawdown, pieData, dailyPnL, byPair, byTimeframe, maxWin, maxLoss, longWinRate, shortWinRate, longPnl, shortPnl, longCount: longTrades.length, shortCount: shortTrades.length };
  }, [trades]);

  if (loading) return <LoadingSpinner />;
  if (!analytics) return (
    <div><h1 className="text-2xl font-bold text-text-primary mb-6">דוח ביצועים</h1>
      <EmptyState icon={BarChart3} title="אין נתונים לניתוח" description="התחל לסחור כדי לראות דוח ביצועים ותובנות מתקדמות" /></div>
  );

  const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';
  const pnlColor = (v) => v >= 0 ? 'text-profit' : 'text-loss';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <h1 className="text-2xl font-bold text-text-primary mb-6">דוח ביצועים</h1>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-1">ממוצע רווח</span>
          <span className="text-lg font-bold text-profit">{formatCurrency(analytics.avgWin)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-1">ממוצע הפסד</span>
          <span className="text-lg font-bold text-loss">{formatCurrency(-analytics.avgLoss)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-1">רווח הכי גדול</span>
          <span className="text-lg font-bold text-profit">{formatCurrency(analytics.largestWin)}</span>
        </div>
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-1">הפסד הכי גדול</span>
          <span className="text-lg font-bold text-loss">{formatCurrency(analytics.largestLoss)}</span>
        </div>
      </div>

      {/* Drawdown + Streaks + Direction */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-1">Max Drawdown</span>
          <span className="text-lg font-bold text-loss">{analytics.maxDrawdown.toFixed(2)}%</span>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1 mb-1"><Flame className="w-3.5 h-3.5 text-profit" /><span className="text-xs text-text-muted">רצף רווחים</span></div>
              <span className="text-lg font-bold text-profit">{analytics.maxWin}</span>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1"><Snowflake className="w-3.5 h-3.5 text-loss" /><span className="text-xs text-text-muted">רצף הפסדים</span></div>
              <span className="text-lg font-bold text-loss">{analytics.maxLoss}</span>
            </div>
          </div>
        </div>
        <div className={cardClass}>
          <span className="text-xs text-text-muted block mb-2">Long vs Short</span>
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-long font-medium block">Long ({analytics.longCount})</span>
              <span className="text-text-muted">{analytics.longWinRate.toFixed(1)}% · </span>
              <span className={pnlColor(analytics.longPnl)}>{formatCurrency(analytics.longPnl)}</span>
            </div>
            <div>
              <span className="text-short font-medium block">Short ({analytics.shortCount})</span>
              <span className="text-text-muted">{analytics.shortWinRate.toFixed(1)}% · </span>
              <span className={pnlColor(analytics.shortPnl)}>{formatCurrency(analytics.shortPnl)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Daily PnL */}
        <div className={`${cardClass} p-6`}>
          <h3 className="text-sm font-semibold text-text-primary mb-4">רווח/הפסד יומי</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.dailyPnL}>
              <XAxis dataKey="date" tick={{ fill: '#606070', fontSize: 10 }} axisLine={false} tickLine={false} reversed />
              <YAxis tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a0a0b8', fontSize: '11px' }} itemStyle={{ color: '#f0f0f0' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(val) => [formatCurrency(val), 'רווח/הפסד']} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} animationDuration={800}>
                {analytics.dailyPnL.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Win/Loss pie */}
        <div className={`${cardClass} p-6`}>
          <h3 className="text-sm font-semibold text-text-primary mb-4">התפלגות תוצאות</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={analytics.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {analytics.pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a0a0b8', fontSize: '11px' }} itemStyle={{ color: '#f0f0f0' }} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs mt-2">
            {analytics.pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                <span className="text-text-muted">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By pair table */}
      <div className={`${cardClass} mb-6`}>
        <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי זוג</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted border-b border-border-primary">
              <th className="text-right pb-2 font-medium">זוג</th>
              <th className="text-right pb-2 font-medium">עסקאות</th>
              <th className="text-right pb-2 font-medium">אחוז הצלחה</th>
              <th className="text-right pb-2 font-medium">רווח/הפסד</th>
            </tr></thead>
            <tbody>
              {analytics.byPair.map((p) => (
                <tr key={p.pair} className="border-b border-border-primary/50">
                  <td className="py-2 text-text-primary font-medium">{p.pair}</td>
                  <td className="py-2 text-text-secondary">{p.wins + p.losses}</td>
                  <td className="py-2 text-text-secondary">{p.winRate.toFixed(1)}%</td>
                  <td className={`py-2 font-medium ${pnlColor(p.pnl)}`}>{formatCurrency(p.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By timeframe */}
      {analytics.byTimeframe.length > 0 && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי טווח זמן</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                <th className="text-right pb-2 font-medium">טווח זמן</th>
                <th className="text-right pb-2 font-medium">עסקאות</th>
                <th className="text-right pb-2 font-medium">אחוז הצלחה</th>
                <th className="text-right pb-2 font-medium">רווח/הפסד</th>
              </tr></thead>
              <tbody>
                {analytics.byTimeframe.map((tf) => (
                  <tr key={tf.timeframe} className="border-b border-border-primary/50">
                    <td className="py-2 text-text-primary font-medium">{tf.timeframe}</td>
                    <td className="py-2 text-text-secondary">{tf.total}</td>
                    <td className="py-2 text-text-secondary">{tf.winRate.toFixed(1)}%</td>
                    <td className={`py-2 font-medium ${pnlColor(tf.pnl)}`}>{formatCurrency(tf.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
