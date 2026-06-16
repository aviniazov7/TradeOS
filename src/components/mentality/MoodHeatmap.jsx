import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Flame } from 'lucide-react';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { MENTALITY_EMOTIONS } from '../../utils/constants';

const DAY_NAMES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// Map emotion key -> emoji
const EMOTION_MAP = MENTALITY_EMOTIONS.reduce((acc, e) => {
  acc[e.key] = e;
  return acc;
}, {});

// Positive vs negative emotions for color scheme
const POSITIVE_EMOTIONS = ['inspired', 'grateful', 'excited', 'calm', 'happy'];

function getDayColor(morning, evening) {
  const hasM = !!morning?.emotion;
  const hasE = !!evening?.emotionAfter; // evening journals store the mood as `emotionAfter`
  if (!hasM && !hasE) return 'bg-bg-tertiary/40 border-border-primary/30';

  const emotions = [morning?.emotion, evening?.emotionAfter].filter(Boolean);
  const positiveCount = emotions.filter((e) => POSITIVE_EMOTIONS.includes(e)).length;
  const ratio = positiveCount / emotions.length;

  if (hasM && hasE) {
    if (ratio === 1) return 'bg-profit/25 border-profit/50';
    if (ratio >= 0.5) return 'bg-accent-primary/15 border-accent-primary/40';
    return 'bg-loss/20 border-loss/50';
  }
  if (ratio === 1) return 'bg-profit/15 border-profit/30';
  return 'bg-loss/15 border-loss/30';
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

export default function MoodHeatmap() {
  const { morningEntries, eveningEntries } = useMentalityJournals();

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toDateStr(d);
      const morning = morningEntries.find((e) => e.date === dateStr) || null;
      const evening = eveningEntries.find((e) => e.date === dateStr) || null;
      result.push({
        date: d,
        dateStr,
        dayName: DAY_NAMES[d.getDay()],
        dayNum: d.getDate(),
        isToday: i === 0,
        morning,
        evening,
      });
    }
    return result;
  }, [morningEntries, eveningEntries]);

  // Current streak
  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toDateStr(d);
      const hasM = morningEntries.some((e) => e.date === dateStr);
      const hasE = eveningEntries.some((e) => e.date === dateStr);
      if (hasM || hasE) count++;
      else if (i > 0) break;
      else break;
    }
    return count;
  }, [morningEntries, eveningEntries]);

  const filledDays = days.filter((d) => d.morning || d.evening).length;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      className="relative bg-bg-secondary border border-border-primary rounded-xl p-6 transition-all hover:border-accent-primary/30 hover:bg-bg-secondary/80"
    >
      {streak > 0 && (
        <span className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-accent-primary/15 text-accent-primary">
          <Flame className="w-3 h-3" />
          רצף {streak}
        </span>
      )}

      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-accent-primary/15">
          <Activity className="w-7 h-7 text-accent-primary" />
        </div>

        <div>
          <h3 className="text-base font-semibold text-text-primary mb-1">מצב הרוח השבוע</h3>
          <p className="text-xs text-text-secondary leading-relaxed">מעקב רגשי של 7 הימים האחרונים</p>
        </div>

        {/* 7-day mini grid */}
        <div className="grid grid-cols-7 gap-1 w-full mt-1">
          {days.map((day) => {
            const mEmoji = day.morning?.emotion ? EMOTION_MAP[day.morning.emotion]?.emoji : null;
            const eEmoji = day.evening?.emotionAfter ? EMOTION_MAP[day.evening.emotionAfter]?.emoji : null;
            const colorClass = getDayColor(day.morning, day.evening);
            const hasAny = mEmoji || eEmoji;
            const tooltipParts = [];
            if (day.morning?.emotion) tooltipParts.push(`בוקר: ${EMOTION_MAP[day.morning.emotion]?.label}`);
            if (day.evening?.emotionAfter) tooltipParts.push(`ערב: ${EMOTION_MAP[day.evening.emotionAfter]?.label}`);
            const tooltip = tooltipParts.length > 0 ? tooltipParts.join(' | ') : 'לא תועד';

            return (
              <div
                key={day.dateStr}
                title={tooltip}
                className={`rounded-md border ${colorClass} h-11 flex flex-col items-center justify-center gap-0.5 ${day.isToday ? 'ring-1 ring-accent-primary/70' : ''}`}
              >
                <div className="text-[8px] font-semibold text-text-muted leading-none">{day.dayName}</div>
                {hasAny ? (
                  <div className="flex items-center justify-center leading-none text-[13px]">
                    {mEmoji && <span>{mEmoji}</span>}
                    {eEmoji && <span>{eEmoji}</span>}
                  </div>
                ) : (
                  <span className="text-text-muted/40 text-[10px] leading-none">·</span>
                )}
              </div>
            );
          })}
        </div>

        <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary">
          {filledDays}/7 ימים תועדו
        </span>
      </div>
    </motion.div>
  );
}
