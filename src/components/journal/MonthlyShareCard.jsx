import { forwardRef, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, format,
} from 'date-fns';
import { formatCurrency } from '../../utils/formatters';

const HEBREW_MONTHS = {
  0: 'ינואר', 1: 'פברואר', 2: 'מרץ', 3: 'אפריל',
  4: 'מאי', 5: 'יוני', 6: 'יולי', 7: 'אוגוסט',
  8: 'ספטמבר', 9: 'אוקטובר', 10: 'נובמבר', 11: 'דצמבר',
};

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const MonthlyShareCard = forwardRef(function MonthlyShareCard({ trades, currentMonth, journalName, options = {} }, ref) {
  const { showPnl = true, showPercent = false, showTrades = true } = options;

  const { dailyData, monthStats, calendarDays } = useMemo(() => {
    const closed = trades.filter((t) => t.exitPrice > 0);
    const map = {};

    closed.forEach((t) => {
      const d = t.exitDate?.toDate ? t.exitDate.toDate() : new Date(t.exitDate);
      const key = format(d, 'yyyy-MM-dd');
      if (!map[key]) map[key] = { pnl: 0, trades: [], wins: 0, losses: 0 };
      map[key].pnl += t.netPnl ?? t.pnl ?? 0;
      map[key].trades.push(t);
      if (t.result === 'win') map[key].wins++;
      else if (t.result === 'loss') map[key].losses++;
    });

    const mStart = startOfMonth(currentMonth);
    const mEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: mStart, end: mEnd });
    const startDayOfWeek = getDay(mStart);

    let totalPnl = 0, winDays = 0, lossDays = 0, totalTrades = 0;

    days.forEach((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const data = map[key];
      if (data) {
        totalPnl += data.pnl;
        totalTrades += data.trades.length;
        if (data.pnl > 0) winDays++;
        else if (data.pnl < 0) lossDays++;
      }
    });

    return {
      dailyData: map,
      monthStats: { totalPnl, winDays, lossDays, totalTrades },
      calendarDays: [...Array(startDayOfWeek).fill(null), ...days],
    };
  }, [trades, currentMonth]);

  const isProfit = monthStats.totalPnl >= 0;
  const accentColor = isProfit ? '#22c55e' : '#ef4444';
  const accentGlow = isProfit ? 'rgba(34, 197, 94,' : 'rgba(239, 68, 68,';

  const getCellBg = (pnl) => {
    if (pnl === undefined || pnl === null) return { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)' };
    if (pnl > 0) return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.25)' };
    if (pnl < 0) return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.25)' };
    return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' };
  };

  const pnlColor = (v) => (v >= 0 ? '#22c55e' : '#ef4444');

  const monthLabel = `${HEBREW_MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: 480,
        padding: 24,
        background: '#09090f',
        borderRadius: 16,
        border: `1px solid ${accentGlow}0.3)`,
        fontFamily: "'Heebo', 'Inter', sans-serif",
        color: '#f0f0f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top glow */}
      <div style={{
        position: 'absolute',
        top: -80,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 300,
        height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentGlow}0.12) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Bottom corner glow */}
      <div style={{
        position: 'absolute',
        bottom: -60,
        left: -40,
        width: 200,
        height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentGlow}0.06) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Decorative candlestick chart */}
      <svg
        style={{
          position: 'absolute',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 100,
          height: 140,
          opacity: 0.08,
          pointerEvents: 'none',
        }}
        viewBox="0 0 100 140"
      >
        {isProfit ? (
          <>
            <line x1="10" y1="120" x2="10" y2="80" stroke={accentColor} strokeWidth="2" />
            <rect x="4" y="90" width="12" height="22" rx="2" fill={accentColor} />
            <line x1="30" y1="100" x2="30" y2="55" stroke={accentColor} strokeWidth="2" />
            <rect x="24" y="65" width="12" height="26" rx="2" fill={accentColor} />
            <line x1="50" y1="80" x2="50" y2="50" stroke="#ef4444" strokeWidth="2" />
            <rect x="44" y="55" width="12" height="18" rx="2" fill="#ef4444" />
            <line x1="70" y1="65" x2="70" y2="20" stroke={accentColor} strokeWidth="2" />
            <rect x="64" y="28" width="12" height="30" rx="2" fill={accentColor} />
            <line x1="90" y1="40" x2="90" y2="5" stroke={accentColor} strokeWidth="2" />
            <rect x="84" y="10" width="12" height="24" rx="2" fill={accentColor} />
          </>
        ) : (
          <>
            <line x1="10" y1="35" x2="10" y2="5" stroke="#ef4444" strokeWidth="2" />
            <rect x="4" y="10" width="12" height="20" rx="2" fill="#ef4444" />
            <line x1="30" y1="60" x2="30" y2="20" stroke="#ef4444" strokeWidth="2" />
            <rect x="24" y="28" width="12" height="24" rx="2" fill="#ef4444" />
            <line x1="50" y1="65" x2="50" y2="40" stroke="#22c55e" strokeWidth="2" />
            <rect x="44" y="44" width="12" height="16" rx="2" fill="#22c55e" />
            <line x1="70" y1="105" x2="70" y2="48" stroke="#ef4444" strokeWidth="2" />
            <rect x="64" y="56" width="12" height="38" rx="2" fill="#ef4444" />
            <line x1="90" y1="130" x2="90" y2="78" stroke="#ef4444" strokeWidth="2" />
            <rect x="84" y="86" width="12" height="34" rx="2" fill="#ef4444" />
          </>
        )}
      </svg>

      {/* Header: Journal name + Month */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, position: 'relative' }}>
        <img src="/favicon.png" alt="" style={{ width: 18, height: 18, borderRadius: 4 }} />
        <span style={{ fontSize: 18, fontWeight: 700 }}>{journalName || 'היומן שלי'}</span>
        <span style={{ fontSize: 13, color: '#707080', fontWeight: 500 }}>•</span>
        <span style={{ fontSize: 14, color: '#a0a0b0', fontWeight: 500 }}>{monthLabel}</span>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 16,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
      }}>
        {/* Total PnL */}
        {showPnl && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#707080', marginBottom: 2 }}>רווח חודשי</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: pnlColor(monthStats.totalPnl) }}>
                {formatCurrency(monthStats.totalPnl)}
              </div>
            </div>
            <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.08)' }} />
          </>
        )}

        {/* Percent */}
        {showPercent && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#707080', marginBottom: 2 }}>אחוז שינוי</div>
              <div style={{ fontSize: showPnl ? 14 : 20, fontWeight: 700, color: pnlColor(monthStats.totalPnl) }}>
                {monthStats.totalPnl >= 0 ? '+' : ''}{((monthStats.totalPnl / (Math.abs(monthStats.totalPnl) + 1000)) * 100).toFixed(1)}%
              </div>
            </div>
            <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.08)' }} />
          </>
        )}

        {/* Win/Loss Days */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#707080', marginBottom: 2 }}>ימי רווח</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{monthStats.winDays}</div>
        </div>
        <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#707080', marginBottom: 2 }}>ימי הפסד</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{monthStats.lossDays}</div>
        </div>
        {showTrades && (
          <>
            <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#707080', marginBottom: 2 }}>עסקאות</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#a0a0b0' }}>{monthStats.totalTrades}</div>
            </div>
          </>
        )}
      </div>

      {/* Calendar Grid */}
      <div style={{ position: 'relative' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
          {HEBREW_DAYS.map((day) => (
            <div key={day} style={{ textAlign: 'center', fontSize: 10, color: '#606070', padding: '2px 0', fontWeight: 600 }}>
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {calendarDays.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} style={{ height: 44 }} />;

            const key = format(day, 'yyyy-MM-dd');
            const data = dailyData[key];
            const pnl = data?.pnl;
            const { bg, border } = getCellBg(pnl);

            return (
              <div
                key={key}
                style={{
                  height: 44,
                  borderRadius: 6,
                  background: bg,
                  border: `1px solid ${border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: data ? '#f0f0f0' : '#404050' }}>
                  {day.getDate()}
                </span>
                {data && showPnl && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: pnlColor(pnl) }}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}$
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(34, 197, 94, 0.3)' }} />
          <span style={{ fontSize: 9, color: '#606070' }}>רווח</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239, 68, 68, 0.3)' }} />
          <span style={{ fontSize: 9, color: '#606070' }}>הפסד</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 9, color: '#606070' }}>ללא עסקאות</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 14,
        paddingTop: 12,
        borderTop: `1px solid ${accentGlow}0.1)`,
        position: 'relative',
      }}>
        <img src="/favicon.png" alt="" style={{ width: 14, height: 14, borderRadius: 3 }} />
        <span style={{ fontSize: 11, color: '#505060' }}>Tracked with TradeOS</span>
      </div>
    </div>
  );
});

export default MonthlyShareCard;
