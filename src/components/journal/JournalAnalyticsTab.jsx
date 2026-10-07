import { useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, Target, Zap, BarChart3, DollarSign, BrainCircuit, Sparkles, ChevronLeft,
} from 'lucide-react';
import { isClosedTrade } from '../../utils/calculations';
import { filterTradesByPeriod, computeJournalAnalytics } from '../../utils/journalAnalytics';
import StatCard from '../dashboard/StatCard';
import StrategyPerformanceTable from '../dashboard/StrategyPerformanceTable';
import MonthlyPerformanceTable from '../dashboard/MonthlyPerformanceTable';
import TradeHeatmap from '../dashboard/TradeHeatmap';
import EmptyState from '../shared/EmptyState';
import JournalRCard from './JournalRCard';
import { formatCurrency, formatPercent, formatDuration, LRM } from '../../utils/formatters';
import { TAG_LABELS } from '../../utils/constants';
import { staggerContainer } from '../../utils/animations';

// recharts is ~414 kB — the chart cards load on demand inside this (already
// lazy) tab.
const JournalCharts = lazy(() => import('./JournalCharts'));
const SessionAnalysisChart = lazy(() => import('../analytics/SessionAnalysisChart'));
const DayOfWeekChart = lazy(() => import('../analytics/DayOfWeekChart'));

const tooltipStyle = { background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' };
// Keyed by slice name, not position: pieData drops empty slices, so an index
// lookup painted losses green whenever there were no wins. Values match the
// dark-theme --color-profit/loss/breakeven tokens (SVG fill attrs can't read
// CSS variables).
const PIE_COLORS = { 'רווח': '#22c55e', 'הפסד': '#ef4444', 'אפס': '#f59e0b' };
const cardClass = 'bg-bg-secondary border border-border-primary rounded-xl p-4';
const pnlColor = (v) => v >= 0 ? 'text-profit' : 'text-loss';

// The journal's "ניתוחים" tab. Lazy-loaded by TradeJournal so neither this
// code nor the analytics computation runs while the user is on the trades tab.
export default function JournalAnalyticsTab({
  trades, period, onPeriodChange, stats,
  activeJournal, balanceIsLive, displayedCurrentBalance,
  onOpenAI, onFilterJump, onAddFirstTrade,
}) {
  const periodTrades = useMemo(() => filterTradesByPeriod(trades, period), [trades, period]);
  const analytics = useMemo(() => computeJournalAnalytics(periodTrades), [periodTrades]);

  const streakText = stats.currentStreak.count > 0
    ? `${stats.currentStreak.count} ${stats.currentStreak.type === 'win' ? 'רווחים' : 'הפסדים'}`
    : '0';
  const streakColor = stats.currentStreak.type === 'win' ? 'text-profit' : stats.currentStreak.type === 'loss' ? 'text-loss' : 'text-text-primary';

  return (
    <>
      {/* Empty gate: `analytics` is null when the PERIOD-FILTERED set has no
          closed trades. Two very different situations share that condition:
          a brand-new account (show onboarding copy + first-trade CTA) and a
          veteran whose selected period is simply empty (say so truthfully and
          offer to widen the period — telling them to "close their first
          trade" would be false). */}
      {analytics === null && (
        trades.some(isClosedTrade) ? (
          <EmptyState
            icon={BarChart3}
            title="אין עסקאות סגורות בתקופה שנבחרה"
            description="טווח הזמן שבחרת לא כולל עסקאות סגורות — נסה תקופה רחבה יותר."
            actionLabel="הצג את כל התקופות"
            onAction={() => onPeriodChange('all')}
          />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="אין עדיין נתונים לניתוח"
            description="הניתוחים נבנים מהעסקאות הסגורות שלך — ברגע שתסגור את העסקה הראשונה, הגרפים והמדדים יתעוררו כאן."
            actionLabel="הוסף עסקה ראשונה"
            onAction={onAddFirstTrade}
          />
        )
      )}

      {analytics !== null && (
        <>
          {/* AI analysis launcher — 21st.dev-style gradient card with a shimmer
              sweep. Opens the beautiful animated AI modal. */}
          <motion.button
            type="button"
            onClick={onOpenAI}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group relative w-full overflow-hidden rounded-2xl mb-3 md:mb-4 cursor-pointer text-right"
            style={{ border: '1px solid var(--glass-border)' }}
          >
            {/* animated gradient wash */}
            <div
              className="absolute inset-0 opacity-90"
              style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.16) 0%, rgba(59,130,246,0.08) 45%, rgba(56,189,248,0.16) 100%)' }}
            />
            {/* shimmer sweep */}
            <motion.div
              aria-hidden
              className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-12"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
              animate={{ x: ['0%', '400%'] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
            />
            <div className="relative flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4">
              {/* icon medallion with soft glow */}
              <span className="relative flex-shrink-0 grid place-items-center w-11 h-11 rounded-xl"
                style={{ background: 'rgba(37,99,235,0.14)', border: '1px solid rgba(56,189,248,0.30)' }}>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 22px 2px rgba(56,189,248,0.30)' }}
                  animate={{ opacity: [0.35, 0.8, 0.35] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <BrainCircuit className="relative w-5 h-5" style={{ stroke: 'url(#ai-grad)' }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm md:text-base font-bold text-gradient">ניתוח AI של המסחר שלך</span>
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ stroke: 'url(#ai-grad)' }} />
                </div>
                <p className="text-xs text-text-muted mt-0.5 truncate">
                  תובנות חכמות, דפוסים חוזרים והמלצות — לחצו לפתיחה
                </p>
              </div>
              <ChevronLeft className="w-5 h-5 flex-shrink-0 text-accent-primary transition-transform group-hover:-translate-x-1" />
            </div>
          </motion.button>

          {/* Row 1: Main Stats */}
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-3 md:mb-4" variants={staggerContainer} initial="initial" animate="animate">
            <StatCard label={balanceIsLive ? `יתרה נוכחית · ${activeJournal.exchange}` : 'יתרה נוכחית'}
              value={formatCurrency(displayedCurrentBalance).replace('+', '')}
              subtitle={balanceIsLive ? 'מסונכרן עם הבורסה' : (activeJournal?.initialBalance > 0 ? `${formatPercent(stats.balanceChangePercent)} מההתחלה` : `${stats.totalTrades} עסקאות`)}
              subtitleColor={balanceIsLive ? 'text-accent-primary' : (stats.balanceChangePercent >= 0 ? 'text-profit' : 'text-loss')} icon={Wallet} color="text-accent-primary"
              gradient={stats.totalPnL >= 0 ? 'profit' : 'loss'} />
            <StatCard label="רווח נקי" value={formatCurrency(stats.totalPnL)} subtitle={`${stats.totalTrades} עסקאות`}
              icon={DollarSign} color={stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'} />
            <StatCard label="אחוז הצלחה" value={`${stats.winRate.toFixed(1)}%`} subtitle={`${stats.winCount}W ${stats.lossCount}L`}
              icon={Target} color="text-accent-primary" />
            <StatCard label="תוחלת" value={formatCurrency(stats.expectancy)} subtitle={`ממוצע ${stats.avgRR.toFixed(2)}R`}
              icon={Zap} color={stats.expectancy >= 0 ? 'text-profit' : 'text-loss'} />
          </motion.div>

          {/* Combined Metrics Grid */}
          <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 md:mb-6 p-3">
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-px">
              {[
                { label: 'רצף נוכחי', value: streakText, color: streakColor },
                { label: 'מקדם רווח', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1.5 ? 'text-profit' : 'text-loss' },
                { label: 'תשואה/תנודתיות', value: stats.sharpeRatio.toFixed(2) },
                { label: 'תשואה/נפילה', value: stats.calmarRatio.toFixed(2) },
                { label: 'תשואה/הפסדים', value: stats.sortinoRatio === Infinity ? '∞' : stats.sortinoRatio.toFixed(2) },
                { label: 'התאוששות', value: stats.recoveryFactor.toFixed(2), color: stats.recoveryFactor >= 1 ? 'text-profit' : 'text-loss' },
                { label: 'ירידה מקס׳', value: `${LRM}-${stats.maxDrawdown.toFixed(1)}%`, color: 'text-loss' },
                { label: 'סיכון/סיכוי', value: `1:${stats.avgRR.toFixed(2)}` },
                { label: 'ימי מסחר', value: stats.tradingDays },
                { label: 'עסקאות/יום', value: stats.tradesPerDay.toFixed(1) },
                { label: 'משך ממוצע', value: formatDuration(stats.avgDurationHours) },
                { label: 'עמלות', value: formatCurrency(-stats.totalFees), color: 'text-loss' },
                ...(analytics ? [
                  { label: 'ממוצע רווח', value: formatCurrency(analytics.avgWin), color: 'text-profit' },
                  { label: 'ממוצע הפסד', value: formatCurrency(-analytics.avgLoss), color: 'text-loss' },
                  { label: 'רווח מקס׳', value: formatCurrency(analytics.largestWin), color: 'text-profit' },
                  { label: 'הפסד מקס׳', value: formatCurrency(analytics.largestLoss), color: 'text-loss' },
                  { label: 'רצף רווחים', value: analytics.maxWin, color: 'text-profit' },
                  { label: 'רצף הפסדים', value: analytics.maxLoss, color: 'text-loss' },
                  { label: `לונג (${analytics.longCount})`, value: `${analytics.longWinRate.toFixed(0)}%`, color: 'text-long' },
                  { label: `שורט (${analytics.shortCount})`, value: `${analytics.shortWinRate.toFixed(0)}%`, color: 'text-short' },
                ] : []),
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center py-3 px-2">
                  <span className="text-[10px] text-text-muted whitespace-nowrap mb-1">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color || 'text-text-primary'} whitespace-nowrap`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <JournalRCard trades={periodTrades} />

          {analytics && (
            <>

              <Suspense fallback={<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{[1, 2, 3, 4].map((i) => <div key={i} className={`${cardClass} p-5 h-48 animate-pulse`} />)}</div>}>
                <JournalCharts
                  analytics={analytics} stats={stats} periodTrades={periodTrades}
                  cardClass={cardClass} tooltipStyle={tooltipStyle} pieColors={PIE_COLORS}
                  formatCurrency={formatCurrency} onFilterJump={onFilterJump}
                />
              </Suspense>
            </>
          )}

          {/* Long vs Short visual card */}
          {analytics && (analytics.longCount > 0 || analytics.shortCount > 0) && (
            <div className={`${cardClass} mb-4 p-5`}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Long vs Short</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Long */}
                <div onClick={() => onFilterJump({ direction: 'long' })}
                  className="cursor-pointer rounded-lg p-2 hover:bg-accent-primary/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-profit">Long ↗</span>
                    <span className="text-xs text-text-muted">{analytics.longCount} עסקאות · {analytics.longWins}W</span>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-profit rounded-full transition-all duration-700" style={{ width: `${analytics.longWinRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-profit">{analytics.longWinRate.toFixed(1)}% הצלחה</span>
                    <span className={analytics.longPnl >= 0 ? 'text-profit' : 'text-loss'}>{LRM}{analytics.longPnl >= 0 ? '+' : ''}{analytics.longPnl.toFixed(2)}$</span>
                  </div>
                </div>
                {/* Short */}
                <div onClick={() => onFilterJump({ direction: 'short' })}
                  className="cursor-pointer rounded-lg p-2 hover:bg-accent-primary/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-loss">Short ↗</span>
                    <span className="text-xs text-text-muted">{analytics.shortCount} עסקאות · {analytics.shortWins}W</span>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-loss rounded-full transition-all duration-700" style={{ width: `${analytics.shortWinRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-loss">{analytics.shortWinRate.toFixed(1)}% הצלחה</span>
                    <span className={analytics.shortPnl >= 0 ? 'text-profit' : 'text-loss'}>{LRM}{analytics.shortPnl >= 0 ? '+' : ''}{analytics.shortPnl.toFixed(2)}$</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <TradeHeatmap trades={periodTrades} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Suspense fallback={<div className={`${cardClass} p-5 h-56 animate-pulse`} />}>
              <SessionAnalysisChart data={stats.sessionPerformance} />
            </Suspense>
            <Suspense fallback={<div className={`${cardClass} p-5 h-56 animate-pulse`} />}>
              <DayOfWeekChart data={stats.dayOfWeekPerformance} />
            </Suspense>
            {analytics?.byTag?.length > 0 && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי תגית</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">תגית</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byTag.map((t) => (
                        <tr key={t.tag} onClick={() => onFilterJump({ tag: t.tag })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{TAG_LABELS[t.tag] || t.tag} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{t.count}</td>
                          <td className="py-2 text-text-secondary">{t.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(t.pnl)}`}>{formatCurrency(t.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <StrategyPerformanceTable
              data={analytics?.byStrategy}
              onStrategyClick={(name) => onFilterJump({ strategy: name })}
            />
            <MonthlyPerformanceTable data={stats.monthlyPerformance} />
            {analytics && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי זוג</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">זוג</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byPair.map((p) => (
                        <tr key={p.pair} onClick={() => onFilterJump({ search: p.pair })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{p.pair} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{p.wins + p.losses}</td>
                          <td className="py-2 text-text-secondary">{p.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(p.pnl)}`}>{formatCurrency(p.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה לסינון עסקאות לפי זוג</p>
              </div>
            )}
            {analytics?.byTimeframe?.length > 0 && (
              <div className={`${cardClass} p-5`}>
                <h3 className="text-sm font-semibold text-text-primary mb-3">ביצועים לפי טווח זמן</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead><tr className="text-xs text-text-muted border-b border-border-primary">
                      <th className="text-right pb-2 font-medium">טווח זמן</th>
                      <th className="text-right pb-2 font-medium">עסקאות</th>
                      <th className="text-right pb-2 font-medium">% הצלחה</th>
                      <th className="text-right pb-2 font-medium">רווח/הפסד</th>
                    </tr></thead>
                    <tbody>
                      {analytics.byTimeframe.map((tf) => (
                        <tr key={tf.timeframe} onClick={() => onFilterJump({ timeframe: tf.timeframe })}
                          className="border-b border-border-primary/50 cursor-pointer hover:bg-accent-primary/5 transition-colors">
                          <td className="py-2 text-text-primary font-medium">{tf.timeframe} <span className="text-text-muted text-[10px] opacity-50">↗</span></td>
                          <td className="py-2 text-text-secondary">{tf.total}</td>
                          <td className="py-2 text-text-secondary">{tf.winRate.toFixed(1)}%</td>
                          <td className={`py-2 font-medium ${pnlColor(tf.pnl)}`}>{formatCurrency(tf.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-text-muted mt-2 text-center">לחץ על שורה לסינון עסקאות לפי טווח זמן</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
