import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, BarChart3, Route, ArrowLeft } from 'lucide-react';
import Card from '../shared/Card';
import FitText from '../shared/FitText';
import { useAuth } from '../../contexts/AuthContext';
import { STAGES } from '../../utils/traderStage';
import { readStageSnapshot } from './journeyStorage';
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

// ── Journey (development map) ────────────────────────────────────────────
// Shows the user's real stage from the snapshot the development map page
// leaves behind (journeyStorage) — the zone itself never subscribes to the
// trades collection. Before the first visit it is a teaser.
export function JourneyTile() {
  const color = ZONE_COLORS.journey;
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const snap = useMemo(() => readStageSnapshot(user?.uid), [user?.uid]);
  const n = STAGES.length;
  const cur = snap ? Math.min(n, Math.max(1, snap.index)) : 0;
  const progress = snap?.nextName ? Math.min(100, Math.max(0, snap.progress || 0)) : 100;
  return (
    <ZoneTile
      as={Link}
      to="/mentality/journey"
      aria-label={snap
        ? `מפת ההתפתחות · שלב ${cur} מתוך ${n}: ${snap.name}${snap.nextName ? ` · ${progress}% לשלב הבא` : ''}`
        : `מפת ההתפתחות · ${n} שלבים · גלה איפה אתה`}
      interactive
      icon={Route}
      color={color}
      title="מפת ההתפתחות"
      caption="איפה אתה עומד כסוחר"
      footer={<TileLinkFooter label={snap ? 'לפירוט המלא' : 'לגלות איפה אני'} />}
    >
      <div className="min-w-0">
        <FitText className="text-2xl md:text-[28px] font-bold text-text-primary leading-none" style={{ textAlign: 'right' }}>
          {snap ? snap.name : 'גלה איפה אתה'}
        </FitText>
        <p className="text-xs text-text-muted mt-2">
          {snap
            ? <>שלב <span className="num-mono font-semibold text-text-secondary">{cur}</span> מתוך <span className="num-mono">{n}</span>{snap.insufficient ? ' · נתונים חלקיים' : ''}</>
            : `${n} שלבים, מ${STAGES[0].name} ועד ${STAGES[n - 1].name}`}
        </p>
      </div>
      {/* The ladder in miniature: one segment per stage, right to left. */}
      <ol className="grid gap-1 mt-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
        {STAGES.map((s, i) => {
          // Reached stages full, the next one filled by the progress toward it.
          const fill = !snap ? 0 : i < cur ? 100 : i === cur ? progress : 0;
          return (
            <li key={s.id} className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              {fill > 0 && (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: i < cur ? color : tint(color, 45) }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${fill}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 + i * 0.05 }}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-text-muted mt-2">
        {!snap && 'הערכה אישית לפי העסקאות, התוכנית והיומנים שלך'}
        {snap && snap.nextName && <><span className="num-mono font-semibold text-text-secondary" dir="ltr">{progress}%</span> לשלב הבא · {snap.nextName}</>}
        {snap && !snap.nextName && 'השלב העליון בסולם'}
      </p>
    </ZoneTile>
  );
}
