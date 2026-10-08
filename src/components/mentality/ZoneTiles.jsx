import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, BarChart3, Route, ArrowLeft } from 'lucide-react';
import Card from '../shared/Card';
import FitText from '../shared/FitText';
import { JOURNEY_STAGES } from '../../utils/constants';
import { ZONE_COLORS, tint, tileInteractive } from './zoneStyle';

// Building blocks of the mental-zone landing page: the per-tile accent, the
// icon medallion, the tile shell and the three data tiles (mood week, mental
// stats, journey). The breathing tile lives with its modal in
// BreathingExercise.jsx; the two daily journals in JournalTodayCard.jsx.

export function Medallion({ icon, color, size = 'md' }) {
  const Icon = icon;
  const box = size === 'lg' ? 'w-11 h-11 md:w-12 md:h-12' : 'w-10 h-10';
  return (
    <span
      aria-hidden
      className={`${box} rounded-xl grid place-items-center shrink-0 border`}
      style={{ background: tint(color, 14), borderColor: tint(color, 28), color }}
    >
      <Icon className={size === 'lg' ? 'w-5 h-5 md:w-[22px] md:h-[22px]' : 'w-[18px] h-[18px]'} />
    </span>
  );
}

// Soft accent glow in the tile's top corner — the same device as the page
// header, tinted per tile so the four tiles don't look identical.
export function TileGlow({ color, strength = 16 }) {
  return (
    <span aria-hidden className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
      <span className="absolute inset-0" style={{ background: `radial-gradient(90% 70% at 100% 0%, ${tint(color, strength)} 0%, transparent 65%)` }} />
    </span>
  );
}

// Tile frame: medallion + title + caption on top, body, optional footer.
// `as`/rest are forwarded to Card so a tile can be a Link or a button.
export function ZoneTile({ icon, color, title, caption, footer, children, interactive = false, className = '', ...rest }) {
  return (
    <Card
      className={`relative w-full h-full rounded-2xl p-4 md:p-5 flex flex-col gap-4 text-right ${interactive ? tileInteractive : ''} ${className}`}
      {...rest}
    >
      <TileGlow color={color} />
      <div className="relative flex items-center gap-3 min-w-0">
        <Medallion icon={icon} color={color} />
        <div className="min-w-0">
          <h3 className="text-sm md:text-[15px] font-bold text-text-primary leading-tight truncate">{title}</h3>
          {caption && <p className="text-xs text-text-muted mt-0.5 truncate">{caption}</p>}
        </div>
      </div>
      <div className="relative flex-1 min-w-0">{children}</div>
      {footer && <div className="relative">{footer}</div>}
    </Card>
  );
}

export function TileLinkFooter({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
      {label}
      <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
    </span>
  );
}

// ── Mood week ────────────────────────────────────────────────────────────
const TONE_COLOR = {
  positive: 'var(--color-profit)',
  negative: 'var(--color-loss)',
  neutral: ZONE_COLORS.mood,
};

function dayLabel(day) {
  if (!day.logged) return `${day.isToday ? 'היום' : `יום ${day.letter}׳`}: לא תועד`;
  const parts = [day.isToday ? 'היום' : `יום ${day.letter}׳`];
  if (day.morning?.readinessLevel) parts.push(`מוכנות ${day.morning.readinessLevel}`);
  if (day.evening?.dayRating) parts.push(`דירוג יום ${day.evening.dayRating}`);
  if (day.score != null) parts.push(`ציון ${day.score} מתוך 10`);
  return parts.join(' · ');
}

export function MoodWeekTile({ week, summary, loading }) {
  const color = ZONE_COLORS.mood;
  return (
    <ZoneTile
      as="section"
      aria-label="מצב הרוח השבוע"
      icon={Activity}
      color={color}
      title="מצב הרוח השבוע"
      caption="מוכנות ודירוג יום, 7 ימים"
      footer={(
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span><span className="num-mono text-text-secondary font-semibold" dir="ltr">{loading ? '–' : `${summary.logged}/7`}</span> ימים תועדו</span>
          <span className="flex items-center gap-2" aria-hidden>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR.positive }} />חיובי</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_COLOR.negative }} />שלילי</span>
          </span>
        </div>
      )}
    >
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="num-mono text-2xl md:text-[28px] font-bold text-text-primary leading-none" dir="ltr">
          {loading || summary.avg == null ? '–' : summary.avg.toFixed(1)}
        </span>
        <span className="text-xs text-text-muted">ממוצע מתוך 10</span>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="7 הימים האחרונים">
        {week.map((day) => {
          const h = day.score != null ? Math.max(12, day.score * 10) : day.logged ? 12 : 0;
          const fill = TONE_COLOR[day.tone] || color;
          return (
            <li key={day.key} aria-label={dayLabel(day)} title={dayLabel(day)} className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`relative w-full h-14 rounded-md overflow-hidden ${day.logged ? 'bg-bg-tertiary' : 'border border-dashed border-border-primary'}`}
              >
                {h > 0 && (
                  <motion.div
                    className="absolute bottom-0 inset-x-0 rounded-md"
                    style={{ background: `linear-gradient(to top, ${tint(fill, 85)}, ${tint(fill, 45)})` }}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                )}
                {day.score != null && (
                  <span className="absolute top-1 inset-x-0 text-center num-mono text-[10px] font-semibold text-text-primary/90 leading-none" aria-hidden>
                    {Math.round(day.score)}
                  </span>
                )}
              </div>
              <span
                aria-hidden
                className={`text-[11px] leading-none ${day.isToday ? 'font-bold text-text-primary' : 'text-text-muted'}`}
              >
                {day.letter}
              </span>
            </li>
          );
        })}
      </ol>
    </ZoneTile>
  );
}

// ── Mental stats ─────────────────────────────────────────────────────────
export function MentalStatsTile({ stat, loading }) {
  const color = ZONE_COLORS.stats;
  let value = '–';
  let label = 'רגש, מוכנות ותוצאות';
  let sub = 'מלא יומנים כדי לגלות מה משפיע על המסחר שלך';
  let pct = null;
  if (!loading && stat?.kind === 'plan') {
    value = `${stat.value}%`;
    label = 'עקבת אחרי התוכנית';
    sub = `${stat.yes} מתוך ${stat.total} ימים · ${stat.days} יום אחרונים`;
    pct = stat.value;
  } else if (!loading && stat?.kind === 'readiness') {
    value = stat.value.toFixed(1);
    label = 'מוכנות בוקר ממוצעת';
    sub = `${stat.total} בקרים · ${stat.days} יום אחרונים`;
    pct = stat.value * 10;
  }
  return (
    <ZoneTile
      as={Link}
      to="/mentality/stats"
      aria-label={`סטטיסטיקות מנטליות${pct != null ? ` · ${label} ${value}` : ''}`}
      interactive
      icon={BarChart3}
      color={color}
      title="סטטיסטיקות מנטליות"
      caption="הקשר בין הראש לתוצאות"
      footer={<TileLinkFooter label="לניתוח המלא" />}
    >
      <div className="min-w-0">
        <FitText className="num-mono text-2xl md:text-[28px] font-bold text-text-primary leading-none" dir="ltr" style={{ textAlign: 'right' }}>
          {value}
        </FitText>
        <p className="text-sm font-semibold text-text-secondary mt-2">{label}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{sub}</p>
        {pct != null && (
          <div className="mt-3 h-1.5 rounded-full bg-bg-tertiary overflow-hidden" aria-hidden>
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        )}
      </div>
    </ZoneTile>
  );
}

// ── Journey ──────────────────────────────────────────────────────────────
// A miniature of the journey chart: early luck, the drawdown valley, then the
// long climb. Dots mark the stages.
const CURVE = [[6, 38], [26, 24], [44, 14], [66, 44], [88, 52], [112, 44], [136, 34], [160, 24], [194, 8]];
const STAGE_POINTS = [0, 2, 3, 5, 6, 7, 8];
const CURVE_D = CURVE.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');

export function JourneyTile() {
  const color = ZONE_COLORS.journey;
  const reduce = useReducedMotion();
  const stages = JOURNEY_STAGES.length;
  return (
    <ZoneTile
      as={Link}
      to="/mentality/journey"
      aria-label={`המסע הפסיכולוגי של הסוחר · ${stages} שלבים`}
      interactive
      icon={Route}
      color={color}
      title="המסע הפסיכולוגי"
      caption="המסלול שרוב הסוחרים עוברים"
      footer={<TileLinkFooter label="לגלות איפה אני" />}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="num-mono text-2xl md:text-[28px] font-bold text-text-primary leading-none">{stages}</span>
        <span className="text-xs text-text-muted">שלבים, מהתחלה ועד שליטה עצמית</span>
      </div>
      <svg viewBox="0 0 200 60" className="w-full h-16 mt-3 overflow-visible" dir="ltr" aria-hidden>
        <line x1="0" y1="56" x2="200" y2="56" stroke="var(--color-border-primary)" strokeWidth="1" />
        <motion.path
          d={CURVE_D}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.2 }}
        />
        {STAGE_POINTS.map((idx, i) => (
          <circle
            key={idx}
            cx={CURVE[idx][0]}
            cy={CURVE[idx][1]}
            r={i === STAGE_POINTS.length - 1 ? 3.5 : 2.5}
            fill={i === STAGE_POINTS.length - 1 ? color : 'var(--color-bg-primary)'}
            stroke={color}
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </ZoneTile>
  );
}
