import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { DollarSign, TrendingUp, TrendingDown, Wallet, BarChart3, PieChart as PieChartIcon, Layers } from 'lucide-react';
import { formatNumber, formatCurrency, formatPercent, formatPrice } from '../../utils/formatters';

const tooltipStyle = { background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' };
const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';
const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

export default function DCAAnalytics({ plans, prices }) {
  const analytics = useMemo(() => {
    if (!plans.length) return null;

    const hasPrices = prices && Object.keys(prices).length > 0;

    // Totals
    const totalInvested = plans.reduce((s, p) => s + (p.totalInvested || 0), 0);
    const totalCoins = plans.reduce((s, p) => s + (p.totalCoins || 0), 0);
    const totalEntries = plans.reduce((s, p) => s + (p.entries || []).length, 0);

    // Portfolio value
    let portfolioValue = 0;
    if (hasPrices) {
      plans.forEach((p) => {
        const cp = prices[p.coin]?.price;
        if (cp && p.totalCoins) portfolioValue += p.totalCoins * cp;
      });
    }
    const totalPnL = portfolioValue > 0 ? portfolioValue - totalInvested : 0;
    const totalPnLPct = totalInvested > 0 && portfolioValue > 0 ? (totalPnL / totalInvested) * 100 : 0;

    // Weighted avg price
    const weightedAvg = totalCoins > 0 ? totalInvested / totalCoins : 0;

    // Monthly investment data
    const monthMap = {};
    plans.forEach((p) => {
      (p.entries || []).forEach((e) => {
        const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
        const key = format(d, 'yyyy-MM');
        if (!monthMap[key]) monthMap[key] = 0;
        monthMap[key] += e.amount || 0;
      });
    });
    const monthlyData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month: format(new Date(month + '-01'), 'MM/yy'), amount }));

    // Allocation by coin
    const allocationData = plans
      .filter((p) => (p.totalInvested || 0) > 0)
      .map((p) => ({ name: p.coin, value: p.totalInvested || 0 }))
      .sort((a, b) => b.value - a.value);

    // Per-coin performance
    const coinPerf = plans
      .filter((p) => (p.totalInvested || 0) > 0)
      .map((p) => {
        const cp = hasPrices ? prices[p.coin]?.price || 0 : 0;
        const currentValue = cp && p.totalCoins ? p.totalCoins * cp : 0;
        const pnl = currentValue > 0 ? currentValue - (p.totalInvested || 0) : 0;
        const pnlPct = p.totalInvested > 0 && currentValue > 0 ? (pnl / p.totalInvested) * 100 : 0;
        return {
          coin: p.coin,
          invested: p.totalInvested || 0,
          currentValue,
          avgPrice: p.avgPrice || 0,
          currentPrice: cp,
          pnl,
          pnlPct,
          entries: (p.entries || []).length,
        };
      })
      .sort((a, b) => b.pnl - a.pnl);

    // Best / worst coin
    const coinsWithPnl = coinPerf.filter((c) => c.currentValue > 0);
    const bestCoin = coinsWithPnl.length ? coinsWithPnl[0] : null;
    const worstCoin = coinsWithPnl.length ? coinsWithPnl[coinsWithPnl.length - 1] : null;

    // Avg entries per month
    const months = Object.keys(monthMap).length || 1;
    const avgEntriesPerMonth = (totalEntries / months).toFixed(1);

    return {
      totalInvested, portfolioValue, totalPnL, totalPnLPct, weightedAvg,
      monthlyData, allocationData, coinPerf,
      bestCoin, worstCoin, totalEntries, avgEntriesPerMonth,
      hasPrices,
    };
  }, [plans, prices]);

  if (!analytics) return null;

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-accent-primary" />
            <span className="text-[11px] text-text-muted">סה״כ מושקע</span>
          </div>
          <span className="text-lg font-bold text-text-primary">${formatNumber(analytics.totalInvested)}</span>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-accent-primary" />
            <span className="text-[11px] text-text-muted">שווי תיק</span>
          </div>
          <span className="text-lg font-bold text-text-primary">
            {analytics.hasPrices ? `$${formatNumber(analytics.portfolioValue)}` : '—'}
          </span>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            {analytics.totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-profit" /> : <TrendingDown className="w-4 h-4 text-loss" />}
            <span className="text-[11px] text-text-muted">רווח/הפסד</span>
          </div>
          {analytics.hasPrices ? (
            <div>
              <span className={`text-lg font-bold ${pnlColor(analytics.totalPnL)}`}>{formatCurrency(analytics.totalPnL)}</span>
              <span className={`text-xs mr-1 ${pnlColor(analytics.totalPnLPct)}`}>{formatPercent(analytics.totalPnLPct)}</span>
            </div>
          ) : <span className="text-lg font-bold text-text-muted">—</span>}
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-accent-primary" />
            <span className="text-[11px] text-text-muted">רכישות</span>
          </div>
          <span className="text-lg font-bold text-text-primary">{analytics.totalEntries}</span>
          <span className="text-[10px] text-text-muted block">{analytics.avgEntriesPerMonth} ממוצע לחודש</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly Investment Bar Chart */}
        {analytics.monthlyData.length > 0 && (
          <div className={cardClass}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent-primary" />
              <h3 className="text-sm font-semibold text-text-primary">השקעה לפי חודש</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.monthlyData}>
                <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-bg-tertiary)' }} formatter={(v) => [`$${formatNumber(v)}`, 'סכום']} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Allocation Pie Chart */}
        {analytics.allocationData.length > 0 && (
          <div className={cardClass}>
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="w-4 h-4 text-accent-primary" />
              <h3 className="text-sm font-semibold text-text-primary">הקצאת תיק</h3>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={analytics.allocationData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    stroke="none"
                  >
                    {analytics.allocationData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-bg-tertiary)' }} formatter={(v) => [`$${formatNumber(v)}`, 'מושקע']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {analytics.allocationData.map((item, i) => {
                  const pct = analytics.totalInvested > 0 ? (item.value / analytics.totalInvested) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-text-primary font-medium">{item.name}</span>
                      </div>
                      <span className="text-text-muted">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insights + Performance Table */}
      {analytics.coinPerf.length > 0 && (
        <div className={`grid grid-cols-1 ${analytics.hasPrices && (analytics.bestCoin || analytics.worstCoin) ? 'md:grid-cols-4' : ''} gap-4`}>
          {analytics.hasPrices && (analytics.bestCoin || analytics.worstCoin) && (
            <div className="space-y-4">
              {analytics.bestCoin && analytics.bestCoin.pnl > 0 && (
                <div className={`${cardClass} border-profit/20`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-profit" />
                    <span className="text-xs text-text-muted">מטבע הכי רווחי</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-text-primary">{analytics.bestCoin.coin}</span>
                    <div className="text-left">
                      <span className="text-sm font-bold text-profit">{formatCurrency(analytics.bestCoin.pnl)}</span>
                      <span className="text-xs text-profit mr-1">{formatPercent(analytics.bestCoin.pnlPct)}</span>
                    </div>
                  </div>
                </div>
              )}
              {analytics.worstCoin && analytics.worstCoin.pnl < 0 && (
                <div className={`${cardClass} border-loss/20`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-loss" />
                    <span className="text-xs text-text-muted">מטבע הכי מפסיד</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-text-primary">{analytics.worstCoin.coin}</span>
                    <div className="text-left">
                      <span className="text-sm font-bold text-loss">{formatCurrency(analytics.worstCoin.pnl)}</span>
                      <span className="text-xs text-loss mr-1">{formatPercent(analytics.worstCoin.pnlPct)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        <div className={`bg-bg-secondary border border-border-primary rounded-xl overflow-hidden ${analytics.hasPrices && (analytics.bestCoin || analytics.worstCoin) ? 'md:col-span-3' : ''}`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
            <BarChart3 className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">ביצועים לפי מטבע</h2>
          </div>

          {/* Mobile: Cards grid */}
          <div className="md:hidden p-3 space-y-2.5">
            {analytics.coinPerf.map((c) => (
              <div key={c.coin} className="bg-bg-tertiary border border-border-primary/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-text-primary">{c.coin}</span>
                  {c.currentValue > 0 ? (
                    <div className="text-left">
                      <span className={`text-xs font-bold ${pnlColor(c.pnl)}`}>{formatCurrency(c.pnl)}</span>
                      <span className={`text-[10px] mr-1 ${pnlColor(c.pnlPct)}`}>{formatPercent(c.pnlPct)}</span>
                    </div>
                  ) : <span className="text-text-muted text-xs">—</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">מושקע</span>
                    <span className="text-text-primary">${formatNumber(c.invested)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">שווי נוכחי</span>
                    <span className="text-text-primary">{c.currentValue > 0 ? `$${formatNumber(c.currentValue)}` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">מחיר ממוצע</span>
                    <span className="text-text-secondary">${formatPrice(c.avgPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">מחיר נוכחי</span>
                    <span className="text-accent-primary font-medium">{c.currentPrice ? `$${formatPrice(c.currentPrice)}` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">רכישות</span>
                    <span className="text-text-secondary">{c.entries}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-muted border-b border-border-primary">
                  <th className="text-right py-2.5 px-4 font-medium">מטבע</th>
                  <th className="text-right py-2.5 px-3 font-medium">מושקע</th>
                  <th className="text-right py-2.5 px-3 font-medium">שווי נוכחי</th>
                  <th className="text-right py-2.5 px-3 font-medium">מחיר ממוצע</th>
                  <th className="text-right py-2.5 px-3 font-medium">מחיר נוכחי</th>
                  <th className="text-right py-2.5 px-3 font-medium">רווח/הפסד</th>
                  <th className="text-right py-2.5 px-3 font-medium">רכישות</th>
                </tr>
              </thead>
              <tbody>
                {analytics.coinPerf.map((c) => (
                  <tr key={c.coin} className="border-b border-border-primary/50 hover:bg-bg-tertiary/50 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-text-primary">{c.coin}</td>
                    <td className="py-2.5 px-3 text-text-primary text-xs">${formatNumber(c.invested)}</td>
                    <td className="py-2.5 px-3 text-text-primary text-xs">{c.currentValue > 0 ? `$${formatNumber(c.currentValue)}` : '—'}</td>
                    <td className="py-2.5 px-3 text-text-secondary text-xs">${formatPrice(c.avgPrice)}</td>
                    <td className="py-2.5 px-3 text-accent-primary text-xs font-medium">{c.currentPrice ? `$${formatPrice(c.currentPrice)}` : '—'}</td>
                    <td className="py-2.5 px-3">
                      {c.currentValue > 0 ? (
                        <div>
                          <span className={`text-xs font-bold ${pnlColor(c.pnl)}`}>{formatCurrency(c.pnl)}</span>
                          <span className={`text-[10px] mr-1 ${pnlColor(c.pnlPct)}`}>{formatPercent(c.pnlPct)}</span>
                        </div>
                      ) : <span className="text-text-muted text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary text-xs">{c.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
