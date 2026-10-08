import { Link } from 'react-router-dom';
import { Sunrise, Moon, Check, ArrowLeft, Clock } from 'lucide-react';
import Card from '../shared/Card';
import Skeleton from '../shared/Skeleton';
import { Medallion, TileGlow } from './ZoneTiles';
import { ZONE_COLORS, tileInteractive, tint } from './zoneStyle';
import { MENTALITY_EMOTIONS, PRE_MARKET_CHECKLIST } from '../../utils/constants';
import { journalWindowState, formatDuration, hhmm } from '../../utils/mentalityDashboard';

// One of today's two journals as a primary card: where we are relative to its
// recommended window (open / opens at / closed / done at), the window drawn on a
// 24-hour track with a "now" marker, a snapshot of what was written once it's
// done, and the call to action. The whole card is one link to the journal.

const META = {
  morning: {
    title: 'יומן בוקר',
    desc: 'הכנה מנטלית לפני המסחר',
    icon: Sunrise,
    to: '/mentality/morning',
  },
  evening: {
    title: 'יומן ערב',
    desc: 'סיכום יום המסחר ולקחים',
    icon: Moon,
    to: '/mentality/evening',
  },
};

const EMOTION_LABEL = Object.fromEntries(MENTALITY_EMOTIONS.map((e) => [e.key, e.label]));

function facts(kind, entry) {
  if (!entry) return [];
  const out = [];
  if (kind === 'morning') {
    if (entry.emotion && EMOTION_LABEL[entry.emotion]) out.push(EMOTION_LABEL[entry.emotion]);
    if (entry.readinessLevel) out.push(`מוכנות ${entry.readinessLevel}/10`);
    if (Array.isArray(entry.preMarketChecklist)) out.push(`צ׳קליסט ${entry.preMarketChecklist.length}/${PRE_MARKET_CHECKLIST.length}`);
  } else {
    if (entry.emotionAfter && EMOTION_LABEL[entry.emotionAfter]) out.push(EMOTION_LABEL[entry.emotionAfter]);
    if (entry.dayRating) out.push(`דירוג יום ${entry.dayRating}/10`);
    if (entry.followedPlan === true) out.push('עקבתי אחרי התוכנית');
    if (entry.followedPlan === false) out.push('סטיתי מהתוכנית');
  }
  return out;
}

function noteLine(kind, entry) {
  const text = kind === 'morning' ? entry?.mainGoal : entry?.lessonsLearned;
  if (!text || !String(text).trim()) return null;
  return { label: kind === 'morning' ? 'המטרה להיום' : 'הלקח', text: String(text).trim() };
}

// 24h track, right-to-left like the page: 00:00 on the right edge.
function DayTrack({ win, now, color, status }) {
  const startPct = (win.start / 24) * 100;
  const widthPct = ((win.end - win.start) / 24) * 100;
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  const segColor = status === 'done' ? 'var(--color-profit)' : color;
  return (
    <div aria-hidden className="pt-1">
      <div className="relative h-2 rounded-full bg-bg-tertiary border border-border-primary">
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            right: `${startPct}%`,
            width: `${widthPct}%`,
            background: status === 'open' ? segColor : tint(segColor, 45),
            boxShadow: status === 'open' ? `0 0 12px ${tint(segColor, 55)}` : 'none',
          }}
        />
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-text-primary" style={{ right: `calc(${nowPct}% - 1px)` }} />
      </div>
      <div className="relative h-4 mt-1.5 num-mono text-[10px] text-text-muted">
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className="absolute top-0"
            style={{ right: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(100%)' : 'translateX(50%)' }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function JournalTodayCard({ kind, entry, now, loading }) {
  const meta = META[kind];
  const color = ZONE_COLORS[kind];
  const state = journalWindowState(kind, entry, now);
  const { status, window: win } = state;

  const chip = {
    done: { text: state.doneAt ? `הושלם · ${state.doneAt}` : 'הושלם', cls: 'bg-profit/12 text-profit border-profit/25', icon: Check },
    open: { text: 'פתוח עכשיו', cls: '', live: true },
    upcoming: { text: `נפתח ב-${hhmm(win.start)}`, cls: 'bg-bg-tertiary text-text-secondary border-border-primary', icon: Clock },
    closed: { text: 'החלון נסגר', cls: 'bg-bg-tertiary text-text-muted border-border-primary', icon: Clock },
  }[status];

  const headline = {
    done: { main: 'מולא היום', sub: state.inWindow == null ? 'נשמר היום' : state.inWindow ? 'בתוך החלון המומלץ' : 'מחוץ לחלון המומלץ' },
    open: { main: `נסגר בעוד ${formatDuration(state.minutesLeft)}`, sub: 'זה הזמן המומלץ למלא' },
    upcoming: { main: `נפתח בעוד ${formatDuration(state.minutesLeft)}`, sub: 'אפשר למלא גם עכשיו' },
    closed: { main: 'לא מולא היום', sub: 'החלון המומלץ עבר, אפשר עדיין למלא' },
  }[status];

  const cta = loading ? { text: 'פתיחה', primary: false } : {
    done: { text: 'צפייה ועריכה', primary: false },
    open: { text: 'מלא עכשיו', primary: true },
    upcoming: { text: 'מילוי מוקדם', primary: false },
    closed: { text: 'מלא עכשיו', primary: false },
  }[status];

  const entryFacts = facts(kind, entry);
  const note = noteLine(kind, entry);
  const ChipIcon = chip.icon;

  return (
    <Card
      as={Link}
      to={meta.to}
      aria-label={loading ? meta.title : `${meta.title} · ${headline.main}. ${cta.text}`}
      className={`relative h-full rounded-2xl p-4 md:p-5 flex flex-col gap-4 text-right ${tileInteractive}`}
    >
      <TileGlow color={status === 'done' ? 'var(--color-profit)' : color} strength={status === 'open' ? 22 : 14} />

      <div className="relative flex items-start gap-3">
        <Medallion icon={meta.icon} color={color} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base md:text-lg font-bold text-text-primary leading-tight">{meta.title}</h2>
          <p className="text-xs md:text-sm text-text-muted mt-0.5 leading-snug">{meta.desc}</p>
        </div>
        {!loading && (
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chip.cls}`}
            style={chip.live ? { background: tint(color, 14), borderColor: tint(color, 35), color: 'var(--color-text-primary)' } : undefined}
          >
            {chip.live && (
              <span className="relative flex w-2 h-2" aria-hidden>
                <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: color }} />
                <span className="relative w-2 h-2 rounded-full" style={{ background: color }} />
              </span>
            )}
            {ChipIcon && <ChipIcon className="w-3 h-3" aria-hidden />}
            <span>{chip.text}</span>
          </span>
        )}
      </div>

      <div className="relative flex-1 min-w-0">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="w-40 h-6" />
            <Skeleton className="w-56" />
          </div>
        ) : (
          <>
            <p className="text-lg md:text-xl font-bold text-text-primary leading-snug">{headline.main}</p>
            <p className="text-xs md:text-sm text-text-secondary mt-0.5">{headline.sub}</p>
            {entryFacts.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mt-3" aria-label="תקציר">
                {entryFacts.map((f) => (
                  <li key={f} className="rounded-lg bg-bg-tertiary border border-border-primary px-2 py-1 text-[11px] font-medium text-text-secondary">
                    {f}
                  </li>
                ))}
              </ul>
            )}
            {note && (
              <p className="mt-2 text-xs text-text-muted truncate">
                <span className="text-text-secondary font-semibold">{note.label}: </span>{note.text}
              </p>
            )}
          </>
        )}
      </div>

      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] text-text-muted">
          <span>חלון מומלץ</span>
          <span className="num-mono" dir="ltr">{win.label}</span>
        </div>
        <DayTrack win={win} now={now} color={color} status={loading ? 'upcoming' : status} />
      </div>

      <div className="relative flex items-center justify-end">
        <span
          className={`inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold transition-colors ${
            cta.primary
              ? 'bg-accent-primary text-white'
              : 'border border-border-primary bg-bg-tertiary text-text-secondary group-hover:text-text-primary group-hover:border-border-hover'
          }`}
        >
          {cta.text}
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
