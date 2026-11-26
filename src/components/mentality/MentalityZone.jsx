import { useEffect, useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { Brain, Sunrise, Moon, Flame, Activity } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import StatTile from '../shared/StatTile';
import JournalTodayCard from './JournalTodayCard';
import BreathingExercise from './BreathingExercise';
import { MoodWeekTile, MentalStatsTile, JourneyTile } from './ZoneTiles';
import { tileItem } from './zoneStyle';
import { useMentalityJournals } from '../../hooks/useMentalityJournals';
import { useMorningRoutine } from '../../hooks/useMorningRoutine';
import {
  buildWeek, weekSummary, journalStreak, headlineMentalStat, journalWindowState,
} from '../../utils/mentalityDashboard';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// A clock that ticks once a minute, so the window states and the "now" marker
// stay current while the page is open.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function journalTile(kind, entry, now, loading) {
  const isMorning = kind === 'morning';
  const base = { icon: isMorning ? Sunrise : Moon, label: isMorning ? 'יומן בוקר' : 'יומן ערב', mono: false };
  if (loading) return { ...base, value: '–', tone: 'text-text-muted' };
  const st = journalWindowState(kind, entry, now);
  if (st.status === 'done') return { ...base, value: 'הושלם', tone: 'text-profit', sub: st.doneAt ? `ב-${st.doneAt}` : 'היום' };
  if (st.status === 'open') return { ...base, value: 'ממתין', tone: 'text-text-primary', sub: 'החלון פתוח עכשיו' };
  if (st.status === 'upcoming') return { ...base, value: 'ממתין', tone: 'text-text-secondary', sub: `נפתח ב-${st.window.label.slice(0, 5)}` };
  return { ...base, value: 'לא מולא', tone: 'text-text-secondary', sub: 'החלון נסגר' };
}

export default function MentalityZone() {
  const now = useMinuteClock();
  const { morningEntries, eveningEntries, todayMorning, todayEvening, loading } = useMentalityJournals();
  const routine = useMorningRoutine();

  const week = useMemo(() => buildWeek(morningEntries, eveningEntries, now), [morningEntries, eveningEntries, now]);
  const summary = useMemo(() => weekSummary(week), [week]);
  const streak = useMemo(() => journalStreak(morningEntries, eveningEntries, now), [morningEntries, eveningEntries, now]);
  const headline = useMemo(() => headlineMentalStat(morningEntries, eveningEntries, now), [morningEntries, eveningEntries, now]);

  const morningTile = journalTile('morning', todayMorning, now, loading);
  const eveningTile = journalTile('evening', todayEvening, now, loading);

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <PageHeader
        icon={Brain}
        title="האזור המנטלי"
        subtitle="מוכנות, משמעת ומצב רוח: הצד המנטלי של המסחר שלך"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="מוכנות היום במבט אחד">
          <StatTile inset {...morningTile} />
          <StatTile inset {...eveningTile} />
          <StatTile
            inset
            icon={Flame}
            label="רצף תיעוד"
            value={loading ? '–' : streak}
            sub={streak === 1 ? 'יום' : 'ימים ברצף'}
            tone={streak > 0 ? 'text-text-primary' : 'text-text-muted'}
          />
          <StatTile
            inset
            icon={Activity}
            label="ממוצע השבוע"
            value={loading || summary.avg == null ? '–' : summary.avg.toFixed(1)}
            sub={loading ? undefined : `מתוך 10 · ${summary.logged}/7 ימים`}
            tone={summary.avg == null ? 'text-text-muted' : summary.avg >= 7 ? 'text-profit' : summary.avg < 4 ? 'text-loss' : 'text-text-primary'}
          />
        </div>
      </PageHeader>

      <m.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
        <section aria-label="היומנים של היום" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <m.div variants={tileItem} className="min-w-0">
            <JournalTodayCard
              kind="morning"
              entry={todayMorning}
              now={now}
              loading={loading}
              routineItems={routine.ready ? routine.items : undefined}
            />
          </m.div>
          <m.div variants={tileItem} className="min-w-0">
            <JournalTodayCard kind="evening" entry={todayEvening} now={now} loading={loading} />
          </m.div>
        </section>

        <section aria-label="כלים ותובנות" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <m.div variants={tileItem} className="min-w-0">
            <MoodWeekTile week={week} summary={summary} loading={loading} />
          </m.div>
          <m.div variants={tileItem} className="min-w-0">
            <MentalStatsTile stat={headline} loading={loading} />
          </m.div>
          <m.div variants={tileItem} className="min-w-0">
            <JourneyTile />
          </m.div>
          <m.div variants={tileItem} className="min-w-0">
            <BreathingExercise />
          </m.div>
        </section>
      </m.div>
    </m.div>
  );
}
