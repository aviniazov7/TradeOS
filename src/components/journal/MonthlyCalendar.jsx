import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  format, addMonths, subMonths, isToday,
} from 'date-fns';
import { ChevronRight, ChevronLeft, DollarSign, Share2 } from 'lucide-react';
import { formatCurrency, safeDate } from '../../utils/formatters';
import { isClosedTrade } from '../../utils/calculations';
import Modal from '../shared/Modal';
import MonthlyShareModal from './MonthlyShareModal';

const HEBREW_MONTHS = {
  0: 'ינואר', 1: 'פברואר', 2: 'מרץ', 3: 'אפריל',
  4: 'מאי', 5: 'יוני', 6: 'יולי', 7: 'אוגוסט',
  8: 'ספטמבר', 9: 'אוקטובר', 10: 'נובמבר', 11: 'דצמבר',
};

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function getCellBg(pnl) {
  if (pnl === undefined || pnl === null) return '';
  if (pnl > 0) return 'bg-profit/15 border-profit/25';
  if (pnl < 0) return 'bg-loss/15 border-loss/25';
  return 'bg-breakeven/10 border-breakeven/20';
}

export default function MonthlyCalendar({ trades, journalName }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { dailyData, monthStats } = useMemo(() => {
    // isClosedTrade (not exitPrice>0): broker CSV imports are closed with a
    // profit but no exit price and used to vanish from the calendar entirely.
    const closed = trades.filter(isClosedTrade);
    const map = {};

    closed.forEach((t) => {
      // safeDate: a single corrupt exitDate used to throw inside format() and
      // crash the whole calendar tab (and null landed in a 1970 bucket).
      // Closed without exitDate (CSV with only a profit column) → entryDate.
      const d = safeDate(t.exitDate) || safeDate(t.entryDate);
      if (!d) return;
      const key = format(d, 'yyyy-MM-dd');
      if (!map[key]) map[key] = { pnl: 0, trades: [], wins: 0, losses: 0 };
      map[key].pnl += t.netPnl ?? t.pnl ?? 0;
      map[key].trades.push(t);
      if (t.result === 'win') map[key].wins++;
      else if (t.result === 'loss') map[key].losses++;
    });

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let totalPnl = 0, winDays = 0, lossDays = 0;
    let bestPnl = -Infinity, worstPnl = Infinity, bestDay = null, worstDay = null;

    monthDays.forEach((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const data = map[key];
      if (data) {
        totalPnl += data.pnl;
        if (data.pnl > 0) winDays++;
        else if (data.pnl < 0) lossDays++;
        if (data.pnl > bestPnl) { bestPnl = data.pnl; bestDay = key; }
        if (data.pnl < worstPnl) { worstPnl = data.pnl; worstDay = key; }
      }
    });

    return {
      dailyData: map,
      monthStats: {
        totalPnl,
        winDays,
        lossDays,
        bestDay: bestPnl > 0 ? { date: bestDay, pnl: bestPnl } : null,
        worstDay: worstPnl < 0 ? { date: worstDay, pnl: worstPnl } : null,
      },
    };
  }, [trades, currentMonth]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDayOfWeek = getDay(monthStart);
    return [...Array(startDayOfWeek).fill(null), ...days];
  }, [currentMonth]);

  const pnlColor = (v) => (v >= 0 ? 'text-profit' : 'text-loss');

  return (
    <div className="space-y-2">
      {/* Monthly Summary */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl px-3 py-2.5 text-xs">
        {/* Row 1: P&L + win/loss days */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <DollarSign className={`w-3.5 h-3.5 ${pnlColor(monthStats.totalPnl)}`} />
            <span className="text-text-muted">רווח:</span>
            <span className={`font-bold ${pnlColor(monthStats.totalPnl)}`}>{formatCurrency(monthStats.totalPnl)}</span>
          </div>
          <div className="w-px h-4 bg-border-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-text-muted">ימי רווח:</span>
            <span className="font-bold text-profit">{monthStats.winDays}</span>
          </div>
          <div className="w-px h-4 bg-border-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-text-muted">ימי הפסד:</span>
            <span className="font-bold text-loss">{monthStats.lossDays}</span>
          </div>
        </div>
        {/* Row 2: Best/worst day */}
        <div className="flex items-center justify-center gap-4 mt-1.5 pt-1.5 border-t border-border-primary/50">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-text-muted">יום טוב:</span>
            <span className="font-bold text-profit">{monthStats.bestDay ? formatCurrency(monthStats.bestDay.pnl) : '-'}</span>
          </div>
          <div className="w-px h-4 bg-border-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-text-muted">יום גרוע:</span>
            <span className="font-bold text-loss">{monthStats.worstDay ? formatCurrency(monthStats.worstDay.pnl) : '-'}</span>
          </div>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 md:p-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            aria-label="חודש קודם"
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-primary">
              {HEBREW_MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
            <button
              onClick={() => setShareOpen(true)}
              className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-colors cursor-pointer"
              title="שיתוף"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            aria-label="חודש הבא"
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Day Names */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {HEBREW_DAYS.map((day) => (
            <div key={day} className="text-center text-xs text-text-muted py-1 font-medium">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-12 md:h-14" />;

            const key = format(day, 'yyyy-MM-dd');
            const data = dailyData[key];
            const pnl = data?.pnl;
            const dayNum = day.getDate();
            const today = isToday(day);

            return (
              <button
                key={key}
                onClick={() => data && setSelectedDay({ date: day, ...data })}
                className={`h-12 md:h-14 rounded-lg border border-border-primary flex flex-col items-center justify-center gap-0.5 transition-all ${
                  data ? 'cursor-pointer hover:brightness-125' : 'cursor-default opacity-40'
                } ${getCellBg(pnl)} ${today ? 'ring-1 ring-accent-primary' : ''}`}
              >
                <span className={`text-xs font-medium ${today ? 'text-accent-primary' : 'text-text-primary'}`}>
                  {dayNum}
                </span>
                {data && (
                  <span className={`text-[10px] font-semibold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    <span className="hidden md:inline">{formatCurrency(pnl)}</span>
                    <span className="md:hidden">{pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}$</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-text-muted">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-profit/30" /> רווח
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-loss/30" /> הפסד
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-bg-tertiary" /> ללא עסקאות
          </div>
        </div>
      </div>

      {/* Monthly Share Modal */}
      <MonthlyShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        trades={trades}
        currentMonth={currentMonth}
        journalName={journalName}
      />

      {/* Day Detail Modal */}
      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `עסקאות ליום ${format(selectedDay.date, 'dd/MM/yyyy')}` : ''}
        maxWidth="max-w-lg"
      >
        {selectedDay && (
          <div className="space-y-2">
            <div className="flex justify-between items-center pb-2 border-b border-border-primary">
              <span className="text-sm text-text-muted">סה&quot;כ: {selectedDay.trades.length} עסקאות</span>
              <span className={`text-sm font-bold ${pnlColor(selectedDay.pnl)}`}>
                {formatCurrency(selectedDay.pnl)}
              </span>
            </div>
            {selectedDay.trades.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border-primary/50">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      t.direction === 'long' ? 'bg-long/15 text-long' : 'bg-short/15 text-short'
                    }`}
                  >
                    {t.direction === 'long' ? 'L' : 'S'}
                  </span>
                  <span className="text-sm text-text-primary font-medium">{t.pair}</span>
                  {t.strategy && <span className="text-xs text-text-muted">{t.strategy}</span>}
                </div>
                <span className={`text-sm font-semibold ${pnlColor(t.netPnl ?? t.pnl ?? 0)}`}>
                  {formatCurrency(t.netPnl ?? t.pnl ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
