import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

const SESSIONS = [
  { key: 'sydney',    label: 'Sydney',    flag: '🇦🇺', open: 22, close: 7,    color: '#14b8a6', bg: 'rgba(20,184,166,' },
  { key: 'tokyo',     label: 'Tokyo',     flag: '🇯🇵', open: 0,  close: 9,    color: '#eab308', bg: 'rgba(234,179,8,' },
  { key: 'frankfurt', label: 'Frankfurt', flag: '🇩🇪', open: 7,  close: 15.5, color: '#f59e0b', bg: 'rgba(245,158,11,' },
  { key: 'london',    label: 'London',    flag: '🇬🇧', open: 8,  close: 17,   color: '#3b82f6', bg: 'rgba(59,130,246,' },
  { key: 'newyork',   label: 'New York',  flag: '🇺🇸', open: 13, close: 22,   color: '#a855f7', bg: 'rgba(168,85,247,' },
];

function getUtcNow() {
  const d = new Date();
  return { hour: d.getUTCHours() + d.getUTCMinutes() / 60, day: d.getUTCDay() };
}

function isWeekendClosed(day, hour) {
  if (day === 6) return true;
  if (day === 0 && hour < 22) return true;
  if (day === 5 && hour >= 22) return true;
  return false;
}

function isSessionOpen(s, hour, day) {
  if (isWeekendClosed(day, hour)) return false;
  if (s.open < s.close) return hour >= s.open && hour < s.close;
  return hour >= s.open || hour < s.close;
}

function getSessionDuration(s) {
  return s.open < s.close ? s.close - s.open : (24 - s.open) + s.close;
}

function getProgress(s, hour, day) {
  if (!isSessionOpen(s, hour, day)) return 0;
  const elapsed = s.open < s.close
    ? hour - s.open
    : (hour >= s.open ? hour - s.open : (24 - s.open) + hour);
  return Math.min(elapsed / getSessionDuration(s), 1);
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
}

function getTimeLeft(s, hour) {
  let diff = s.close - hour;
  if (diff <= 0) diff += 24;
  return formatDuration(diff);
}

function getNextOpenInfo(sessions, hour, day) {
  if (!isWeekendClosed(day, hour)) {
    let best = null;
    let bestDiff = Infinity;
    for (const s of sessions) {
      if (isSessionOpen(s, hour, day)) continue;
      let diff = s.open - hour;
      if (diff <= 0) diff += 24;
      if (diff < bestDiff) { bestDiff = diff; best = s; }
    }
    if (best) return { session: best, time: formatDuration(bestDiff) };
    return null;
  }
  const sydney = sessions.find((s) => s.key === 'sydney');
  let hoursUntil;
  if (day === 6) hoursUntil = (24 - hour) + 22;
  else if (day === 0) hoursUntil = 22 - hour;
  else hoursUntil = (24 - hour) + 24 + 22;
  return { session: sydney, time: formatDuration(hoursUntil) };
}

function formatHour(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function MarketSessionsCard() {
  const [utc, setUtc] = useState(getUtcNow);

  useEffect(() => {
    const id = setInterval(() => setUtc(getUtcNow()), 30000);
    return () => clearInterval(id);
  }, []);

  const { hour: now, day } = utc;
  const weekend = isWeekendClosed(day, now);

  const sorted = useMemo(() => {
    return [...SESSIONS].sort((a, b) => {
      const aOpen = isSessionOpen(a, now, day);
      const bOpen = isSessionOpen(b, now, day);
      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;
      return 0;
    });
  }, [now, day]);

  const openCount = sorted.filter((s) => isSessionOpen(s, now, day)).length;
  const nextOpen = useMemo(() => getNextOpenInfo(SESSIONS, now, day), [now, day]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 mb-4"
    >
      {/* Header row */}
      <div className="flex flex-col items-center gap-1 mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-primary" />
          <h3 className="text-sm font-semibold text-text-primary">שעות מסחר</h3>
          {weekend && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-loss/15 text-loss border border-loss/20">
              סופ״ש
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="font-mono">יום {DAY_NAMES[day]} • UTC {formatHour(now)}</span>
          {nextOpen && openCount < SESSIONS.length && (
            <>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <span>הבא:</span>
                <span>{nextOpen.session.flag}</span>
                <span className="font-semibold text-text-primary">{nextOpen.session.label}</span>
                <span className="font-mono font-semibold" style={{ color: nextOpen.session.color }}>{nextOpen.time}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sessions — side by side */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {sorted.map((s) => {
          const open = isSessionOpen(s, now, day);
          const progress = getProgress(s, now, day);

          return (
            <div
              key={s.key}
              className={`rounded-lg px-3 py-2.5 transition-all duration-300 ${open ? '' : 'opacity-40'}`}
              style={open
                ? { background: `${s.bg}0.1)`, border: `1px solid ${s.bg}0.25)` }
                : { background: 'var(--color-bg-tertiary)', border: '1px solid transparent' }
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base leading-none">{s.flag}</span>
                <span className={`text-xs font-bold ${open ? 'text-text-primary' : 'text-text-muted'}`}>
                  {s.label}
                </span>
                {open && (
                  <span className="relative flex h-2 w-2 mr-auto">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: s.color }} />
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: s.color }} />
                  </span>
                )}
              </div>

              {open && (
                <div className="mb-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: s.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              )}

              <span className="text-[11px] font-mono" style={open ? { color: s.color } : undefined}>
                {open
                  ? `נסגר ${getTimeLeft(s, now)}`
                  : weekend
                    ? <span className="text-text-muted">סגור</span>
                    : <span className="text-text-muted">בעוד {formatDuration((() => { let d = s.open - now; if (d <= 0) d += 24; return d; })())}</span>
                }
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
