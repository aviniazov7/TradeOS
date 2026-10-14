import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowRight, BarChart3, Brain, ListChecks, ClipboardCheck, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import { headerIconBtn } from '../shared/headerStyles';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useTrades } from '../../hooks/useTrades';
import { useMentalStats } from '../../hooks/useMentalStats';
import MentalStatsSkeleton from './MentalStatsSkeleton';
import { formatCurrency } from '../../utils/formatters';

export default function MentalStats() {
  const navigate = useNavigate();
  const { trades, loading: tradesLoading } = useTrades();
  const { morningEntries, eveningEntries, loading: journalsLoading } = useMentalityJournals();
  const stats = useMentalStats(trades, morningEntries, eveningEntries);

  const loading = tradesLoading || journalsLoading;

  if (loading) return <MentalStatsSkeleton />;

  const noData = stats.totalCrossDays === 0;

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        icon={BarChart3}
        title="סטטיסטיקות מנטליות"
        subtitle="איך מצב הרוח והמשמעת שלך משפיעים על התוצאות"
        actions={(
          <button onClick={() => navigate('/mentality')} className={headerIconBtn} title="חזרה לאזור המנטלי" aria-label="חזרה לאזור המנטלי">
            <ArrowRight className="w-[18px] h-[18px]" />
          </button>
        )}
      />

      {noData ? (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
          <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">אין מספיק נתונים</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-4">
            כדי לראות סטטיסטיקות מנטליות, צריך למלא יומן בוקר ולבצע עסקאות באותו יום.
            ככל שתצבור יותר ימים עם נתונים, התובנות יהיו מדויקות יותר.
          </p>
          <button
            onClick={() => navigate('/mentality')}
            className="px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
          >
            מלא יומן בוקר
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Cards */}
          <SummaryCards stats={stats} />

          {/* Emotion + Readiness side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section icon={Brain} title="ביצועים לפי רגש בוקר">
              <EmotionTable data={stats.emotionStatsArray} />
            </Section>

            <Section icon={TrendingUp} title="ביצועים לפי רמת מוכנות">
              <ReadinessTable data={stats.readinessStats} avgProfit={stats.avgReadinessProfit} avgLoss={stats.avgReadinessLoss} />
            </Section>
          </div>

          {/* Checklist + Plan side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section icon={ListChecks} title="השפעת צ'קליסט פרה-מרקט">
              <ChecklistTable data={stats.checklistStats} />
            </Section>

            <Section icon={ClipboardCheck} title="עקיבה אחרי תוכנית המסחר">
              <PlanStats data={stats.planStats} />
            </Section>
          </div>
        </div>
      )}
    </m.div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
        <Icon className="w-4 h-4 text-accent-primary" />
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SummaryCards({ stats }) {
  const cards = [
    {
      label: 'ימים עם נתונים',
      value: stats.totalCrossDays,
      sub: 'ימים עם יומן + עסקאות',
    },
    {
      label: 'הרגש הכי מצליח',
      value: stats.bestEmotion ? `${stats.bestEmotion.emoji} ${stats.bestEmotion.label}` : '-',
      sub: stats.bestEmotion ? `${stats.bestEmotion.winRate}% הצלחה` : '',
    },
    {
      label: 'מוכנות ביום רווחי',
      value: stats.avgReadinessProfit,
      sub: 'ממוצע רמת מוכנות',
      color: 'text-profit',
    },
    {
      label: 'מוכנות ביום הפסדי',
      value: stats.avgReadinessLoss,
      sub: 'ממוצע רמת מוכנות',
      color: 'text-loss',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-bg-secondary border border-border-primary rounded-xl p-3 text-center">
          <p className="text-[11px] text-text-muted mb-1">{c.label}</p>
          <p className={`text-lg font-bold ${c.color || 'text-text-primary'}`}>{c.value}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function EmotionTable({ data }) {
  if (!data.length) {
    return <p className="text-sm text-text-muted text-center py-4">אין נתונים עדיין</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-[11px]">
            <th className="text-right pb-2 font-medium">רגש</th>
            <th className="text-center pb-2 font-medium">עסקאות</th>
            <th className="text-center pb-2 font-medium">Win Rate</th>
            <th className="text-center pb-2 font-medium">ממוצע P&L</th>
            <th className="text-center pb-2 font-medium">סה"כ P&L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-primary">
          {[...data]
            .sort((a, b) => b.winRate - a.winRate)
            .map((row) => (
              <tr key={row.key}>
                <td className="py-2 text-right">
                  <span className="text-base ml-1.5">{row.emoji}</span>
                  <span className="text-text-primary">{row.label}</span>
                </td>
                <td className="py-2 text-center text-text-secondary">{row.trades}</td>
                <td className="py-2 text-center">
                  <span className={row.winRate >= 50 ? 'text-profit' : 'text-loss'}>{row.winRate}%</span>
                </td>
                <td className="py-2 text-center">
                  <span className={row.avgPnl >= 0 ? 'text-profit' : 'text-loss'}>
                    {formatCurrency(row.avgPnl)}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={row.totalPnl >= 0 ? 'text-profit' : 'text-loss'}>
                    {formatCurrency(row.totalPnl)}
                  </span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessTable({ data, avgProfit, avgLoss }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-[11px]">
              <th className="text-right pb-2 font-medium">רמת מוכנות</th>
              <th className="text-center pb-2 font-medium">עסקאות</th>
              <th className="text-center pb-2 font-medium">Win Rate</th>
              <th className="text-center pb-2 font-medium">ממוצע P&L</th>
              <th className="text-center pb-2 font-medium">סה"כ P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary">
            {data.map((row) => (
              <tr key={row.key}>
                <td className="py-2 text-right text-text-primary">{row.label}</td>
                <td className="py-2 text-center text-text-secondary">{row.trades}</td>
                <td className="py-2 text-center">
                  <span className={row.winRate >= 50 ? 'text-profit' : 'text-loss'}>{row.winRate}%</span>
                </td>
                <td className="py-2 text-center">
                  <span className={row.avgPnl >= 0 ? 'text-profit' : 'text-loss'}>
                    {formatCurrency(row.avgPnl)}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={row.totalPnl >= 0 ? 'text-profit' : 'text-loss'}>
                    {formatCurrency(row.totalPnl)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 pt-1">
        <div className="flex-1 bg-profit/10 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">מוכנות ממוצעת ביום רווחי</p>
          <p className="text-base font-bold text-profit">{avgProfit}</p>
        </div>
        <div className="flex-1 bg-loss/10 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">מוכנות ממוצעת ביום הפסדי</p>
          <p className="text-base font-bold text-loss">{avgLoss}</p>
        </div>
      </div>
    </div>
  );
}

function ChecklistTable({ data }) {
  const [expanded, setExpanded] = useState(false);
  const filtered = data.filter((d) => d.with.trades > 0 || d.without.trades > 0);
  const hasData = filtered.length > 0;
  const INITIAL_COUNT = 2;
  const hasMore = filtered.length > INITIAL_COUNT;
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_COUNT);

  if (!hasData) {
    return <p className="text-sm text-text-muted text-center py-4">אין נתונים עדיין</p>;
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {visible.map((item) => (
          <m.div
            key={item.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-bg-tertiary rounded-lg p-3">
              <p className="text-sm font-medium text-text-primary mb-2">{item.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-text-muted mb-0.5">כשמסומן ✅</p>
                  <p className={`text-sm font-bold ${item.with.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                    {item.with.trades > 0 ? `${item.with.winRate}%` : '-'}
                  </p>
                  <p className="text-[10px] text-text-muted">{item.with.trades} עסקאות</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-text-muted mb-0.5">כשלא מסומן ❌</p>
                  <p className={`text-sm font-bold ${item.without.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                    {item.without.trades > 0 ? `${item.without.winRate}%` : '-'}
                  </p>
                  <p className="text-[10px] text-text-muted">{item.without.trades} עסקאות</p>
                </div>
              </div>
            </div>
          </m.div>
        ))}
      </AnimatePresence>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {expanded ? 'הצג פחות' : `הצג עוד (${filtered.length - INITIAL_COUNT})`}
          <m.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            className="inline-flex"
          >
            <ChevronDown size={14} />
          </m.span>
        </button>
      )}
    </div>
  );
}

function PlanStats({ data }) {
  const hasData = data.followed.trades > 0 || data.notFollowed.trades > 0;
  if (!hasData) {
    return (
      <p className="text-sm text-text-muted text-center py-4">
        אין נתונים - מלא את שדה "האם עקבתי אחרי התוכנית" ביומן הערב
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-profit/10 rounded-lg p-4 text-center">
        <p className="text-sm font-medium text-text-primary mb-2">✅ כשעקבתי אחרי התוכנית</p>
        <p className="text-2xl font-bold text-profit mb-1">{data.followed.winRate}%</p>
        <p className="text-xs text-text-muted">הצלחה | {data.followed.trades} עסקאות</p>
        <p className={`text-sm font-semibold mt-1 ${data.followed.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {formatCurrency(data.followed.totalPnl)}
        </p>
      </div>
      <div className="bg-loss/10 rounded-lg p-4 text-center">
        <p className="text-sm font-medium text-text-primary mb-2">❌ כשלא עקבתי</p>
        <p className="text-2xl font-bold text-loss mb-1">{data.notFollowed.winRate}%</p>
        <p className="text-xs text-text-muted">הצלחה | {data.notFollowed.trades} עסקאות</p>
        <p className={`text-sm font-semibold mt-1 ${data.notFollowed.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {formatCurrency(data.notFollowed.totalPnl)}
        </p>
      </div>
    </div>
  );
}
