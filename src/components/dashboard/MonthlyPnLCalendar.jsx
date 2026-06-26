import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

// Local-time 'YYYY-MM-DD' key (avoids UTC offset bugs that would misalign keys).
const k = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.012 },
  },
};

const cellVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.18 } },
};

// Compact currency: keep sign, shorten >=1000 to e.g. +$1.2K.
function formatCompactCurrency(value) {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${(abs / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value, 0);
}

export default function MonthlyPnLCalendar({
  dailyPnl,
  monthDate,
  currency = '$',
}) {
  // currency reserved for future locale symbols; formatters currently emit '$'.
  void currency;

  const month = useMemo(
    () => (monthDate instanceof Date ? monthDate : new Date()),
    [monthDate]
  );

  const { cells, monthTotal, maxAbs } = useMemo(() => {
    const data = dailyPnl || {};
    const year = month.getFullYear();
    const m = month.getMonth();

    const first = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const leading = first.getDay(); // Sunday-first offset

    let total = 0;
    let max = 0;
    const dayCells = [];

    for (let i = 0; i < leading; i++) {
      dayCells.push({ type: 'blank', id: `blank-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, m, day);
      const entry = data[k(date)];
      const pnl = entry ? Number(entry.pnl) || 0 : null;
      const trades = entry ? Number(entry.trades) || 0 : 0;

      if (pnl !== null) {
        total += pnl;
        max = Math.max(max, Math.abs(pnl));
      }

      dayCells.push({
        type: 'day',
        id: k(date),
        day,
        pnl,
        trades,
        hasData: entry != null,
      });
    }

    return { cells: dayCells, monthTotal: total, maxAbs: max };
  }, [dailyPnl, month]);

  const todayKey = k(new Date());
  const totalPositive = monthTotal >= 0;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div
          className={`text-sm font-bold ${
            totalPositive ? 'text-profit' : 'text-loss'
          }`}
          dir="ltr"
        >
          {formatCurrency(monthTotal)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {month.toLocaleDateString('he-IL', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <CalendarDays className="w-4 h-4 text-accent-primary" />
        </div>
      </div>

      {/* Weekday labels (Sunday-first) */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={i}
            className="text-[10px] text-text-muted text-center font-medium"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <motion.div
        className="grid grid-cols-7 gap-1.5"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {cells.map((cell) => {
          if (cell.type === 'blank') {
            return <div key={cell.id} className="min-h-[64px]" />;
          }

          const isToday = cell.id === todayKey;
          const profit = cell.pnl >= 0;

          let style;
          let borderClass = 'border border-border-primary';
          let muted = true;

          if (cell.hasData) {
            muted = false;
            const alpha =
              maxAbs > 0
                ? Math.min(0.45, Math.max(0.08, Math.abs(cell.pnl) / maxAbs * 0.45))
                : 0.08;
            const rgb = profit ? '34,197,94' : '239,68,68';
            style = { backgroundColor: `rgba(${rgb}, ${alpha})` };
            borderClass = profit ? 'border border-profit/20' : 'border border-loss/20';
          }

          return (
            <motion.div
              key={cell.id}
              variants={cellVariants}
              style={style}
              className={`min-h-[64px] rounded-lg p-1.5 flex flex-col justify-between overflow-hidden ${borderClass} ${
                muted ? 'bg-bg-tertiary/40' : ''
              } ${isToday ? 'ring-1 ring-accent-primary/50' : ''}`}
            >
              <div className="text-[11px] text-text-muted text-right leading-none">
                {cell.day}
              </div>

              {cell.hasData && (
                <div className="text-right">
                  <div
                    className={`text-[11px] font-bold leading-tight ${
                      profit ? 'text-profit' : 'text-loss'
                    }`}
                    dir="ltr"
                  >
                    {formatCompactCurrency(cell.pnl)}
                  </div>
                  <div className="text-[9px] text-text-muted leading-tight">
                    {cell.trades} עסקאות
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
