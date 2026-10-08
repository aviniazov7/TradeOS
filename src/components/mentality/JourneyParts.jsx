import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ChevronDown, CheckCircle2, Circle, History, ShieldCheck, Activity, ClipboardCheck, Brain, TrendingUp,
  Target, ThumbsUp, AlertTriangle, BookOpen,
} from 'lucide-react';
import { STAGES, formatGateValue, formatGateTarget } from '../../utils/traderStage';
import { panel, scoreTone } from './journeyStyle';

// Building blocks of the development map page (PsychologicalJourney.jsx):
// the dimension radar, the next-milestones checklist, the
// dimension cards and the collapsible stages reference. The animated journey
// path at the top of the page lives in JourneyPath.jsx.

const DIMENSION_ICONS = {
  experience: History,
  risk: ShieldCheck,
  consistency: Activity,
  plan: ClipboardCheck,
  psychology: Brain,
  edge: TrendingUp,
};

function Bar({ value, color, className = 'h-1.5' }) {
  const reduce = useReducedMotion();
  const w = `${Math.min(100, Math.max(0, value || 0))}%`;
  return (
    <div className={`${className} rounded-full bg-bg-tertiary overflow-hidden`} aria-hidden>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: w }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

export function PanelTitle({ icon: Icon, children, aside }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="flex items-center gap-2 text-sm md:text-[15px] font-bold text-text-primary min-w-0">
        {Icon && <Icon className="w-4 h-4 text-accent-primary shrink-0" aria-hidden />}
        <span className="truncate">{children}</span>
      </h2>
      {aside && <div className="shrink-0 text-xs text-text-muted">{aside}</div>}
    </div>
  );
}

// ── Radar ─────────────────────────────────────────────────────────────────
// Hand-drawn SVG: six axes, rings at 25/50/75/100, the score polygon and a
// two-line label (name + score) outside each axis. A missing score sits at
// the centre and its label reads "—".
export function DimensionRadar({ dimensions }) {
  const reduce = useReducedMotion();
  const W = 360;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2;
  const R = 96;
  const n = dimensions.length;
  const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  const ring = (f) => dimensions.map((_, i) => pt(i, R * f).join(',')).join(' ');
  const shape = dimensions.map((d, i) => pt(i, (R * (d.score || 0)) / 100).join(',')).join(' ');
  return (
    // direction ltr: inside an RTL page, text-anchor "start" would mean the
    // RIGHT edge and push the right-hand labels into the chart. (The HTML dir
    // attribute is not honoured on SVG — it has to be the CSS property.)
    <svg viewBox={`0 0 ${W} ${H}`} direction="ltr" style={{ direction: 'ltr' }} className="w-full max-w-[420px] mx-auto h-auto" role="img" aria-label={dimensions.map((d) => `${d.label} ${d.score ?? 'לא נמדד'}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="var(--color-border-primary)" strokeWidth={f === 1 ? 1.25 : 1} />
      ))}
      {dimensions.map((d, i) => {
        const [x, y] = pt(i, R);
        return <line key={d.id} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border-primary)" strokeWidth="1" />;
      })}
      <motion.polygon
        points={shape}
        fill="color-mix(in srgb, var(--color-accent-primary) 22%, transparent)"
        stroke="var(--color-accent-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        initial={reduce ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      {dimensions.map((d, i) => {
        const [x, y] = pt(i, (R * (d.score || 0)) / 100);
        return <circle key={d.id} cx={x} cy={y} r="3" fill="var(--color-bg-primary)" stroke={scoreTone(d.score).color} strokeWidth="2" />;
      })}
      {dimensions.map((d, i) => {
        const [x, y] = pt(i, R + 16);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
        const sin = Math.sin(angle(i));
        const dy = sin < -0.5 ? -14 : sin > 0.5 ? 6 : -4;
        return (
          <g key={d.id}>
            <text x={x} y={y + dy} textAnchor={anchor} fontSize="12" fontWeight="600" fill="var(--color-text-secondary)" fontFamily="Heebo, sans-serif">
              {d.label}
            </text>
            <text x={x} y={y + dy + 15} textAnchor={anchor} fontSize="13" fontWeight="700" fill={scoreTone(d.score).color} className="num-mono">
              {d.score ?? '—'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Next milestones ───────────────────────────────────────────────────────
export function Milestones({ assessment }) {
  const { nextMilestones, nextStage } = assessment;
  const done = nextMilestones.filter((g) => g.done).length;
  return (
    <section className={panel} aria-label="היעדים הבאים">
      <PanelTitle
        icon={Target}
        aside={nextStage && <span><span className="num-mono" dir="ltr">{done}/{nextMilestones.length}</span> הושגו</span>}
      >
        היעדים הבאים
      </PanelTitle>
      {nextStage ? (
        <>
          <p className="text-xs text-text-muted -mt-2 mb-3">מה נדרש כדי לעלות לשלב <span className="font-semibold text-text-secondary">{nextStage.name}</span></p>
          <ul className="space-y-3.5">
            {nextMilestones.map((g) => (
              <li key={g.id} className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-start gap-2 min-w-0 text-sm text-text-primary">
                    {g.done
                      ? <CheckCircle2 className="w-4 h-4 text-profit shrink-0 mt-0.5" aria-label="הושג" />
                      : <Circle className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-label="טרם הושג" />}
                    <span className={g.done ? 'text-text-secondary' : ''}>{g.label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-text-muted whitespace-nowrap">
                    <span className={`num-mono font-semibold ${g.done ? 'text-profit' : 'text-text-primary'}`}>{formatGateValue(g)}</span>
                    <span className="mx-1">/</span>
                    <span className="num-mono">{formatGateTarget(g)}</span>
                  </span>
                </div>
                <Bar value={g.progress} color={g.done ? 'var(--color-profit)' : 'var(--color-accent-primary)'} className="h-1.5 mt-1.5 ms-6" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-secondary leading-relaxed">
          עברת את כל שערי הכניסה של הסולם. מכאן המדד הוא שימור: אותו תהליך, אותו סיכון, ובדיקה חודשית שאף מדד לא נשחק.
        </p>
      )}
    </section>
  );
}

// ── Strengths / blockers ──────────────────────────────────────────────────
export function SnapshotLists({ strengths, blockers, className = 'mt-4' }) {
  if (!strengths.length && !blockers.length) return null;
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      <div className="rounded-xl bg-bg-tertiary border border-border-primary p-3 min-w-0">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-profit mb-2"><ThumbsUp className="w-3.5 h-3.5" aria-hidden />חוזקות</h3>
        {strengths.length ? (
          <ul className="space-y-1.5">
            {strengths.slice(0, 3).map((s) => <li key={s} className="text-xs text-text-secondary leading-relaxed">{s}</li>)}
          </ul>
        ) : <p className="text-xs text-text-muted">עדיין אין מדד שעבר 70.</p>}
      </div>
      <div className="rounded-xl bg-bg-tertiary border border-border-primary p-3 min-w-0">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-loss mb-2"><AlertTriangle className="w-3.5 h-3.5" aria-hidden />מה מעכב</h3>
        {blockers.length ? (
          <ul className="space-y-1.5">
            {blockers.slice(0, 3).map((s) => <li key={s} className="text-xs text-text-secondary leading-relaxed">{s}</li>)}
          </ul>
        ) : <p className="text-xs text-text-muted">אין חסמים פתוחים.</p>}
      </div>
    </div>
  );
}

// ── Dimension card ────────────────────────────────────────────────────────
export function DimensionCard({ d }) {
  const Icon = DIMENSION_ICONS[d.id] || Activity;
  const tone = scoreTone(d.score);
  return (
    <article className={`${panel} w-full flex flex-col gap-3`} aria-label={`${d.label}: ${d.score ?? 'אין מספיק נתונים'}`}>
      <header className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0 border"
          style={{ background: `color-mix(in srgb, ${tone.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${tone.color} 28%, transparent)`, color: tone.color }}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text-primary truncate">{d.label}</h3>
          <p className={`text-[11px] ${tone.text}`}>{tone.label}</p>
        </div>
        <span className={`num-mono text-2xl font-bold leading-none ${tone.text}`} dir="ltr">
          {d.score ?? '—'}
          {d.score != null && <span className="text-xs text-text-muted font-medium">/100</span>}
        </span>
      </header>
      <Bar value={d.score} color={tone.color} />
      <ul className="space-y-1.5">
        {d.evidence.map((e) => (
          <li key={e} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-text-muted shrink-0" aria-hidden />
            <span className="min-w-0">{e}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto rounded-xl bg-bg-tertiary border border-border-primary p-3 text-xs leading-relaxed text-text-secondary">
        <span className="font-bold text-text-primary">הצעד הבא: </span>{d.tip}
      </div>
    </article>
  );
}

// ── Stages reference (collapsible) ────────────────────────────────────────
export function StagesReference({ currentIndex }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${panel} !p-0 overflow-hidden`} aria-label="על השלבים">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 md:px-5 text-right cursor-pointer hover:bg-bg-tertiary transition-colors"
      >
        <span className="flex items-center gap-2 text-sm md:text-[15px] font-bold text-text-primary">
          <BookOpen className="w-4 h-4 text-accent-primary" aria-hidden />
          על השלבים
        </span>
        <span className="flex items-center gap-2 text-xs text-text-muted">
          <span className="hidden sm:inline">איך נקבע השלב ומה נדרש בכל אחד</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 md:px-5 md:pb-5 border-t border-border-primary pt-4">
              <p className="text-xs text-text-muted leading-relaxed mb-4">
                השלב נקבע לפי שערי כניסה מצטברים, לא לפי ממוצע: אתה נמצא בשלב הגבוה ביותר שכל הדרישות שלו, ושל כל השלבים שלפניו, מתקיימות בנתונים שלך.
                המדדים מחושבים מהעסקאות הסגורות בכל היומנים, מתוכנית המסחר הפעילה ומיומני הבוקר והערב.
              </p>
              <ol className="grid gap-2.5 md:grid-cols-2">
                {STAGES.map((s, i) => {
                  const isCur = i + 1 === currentIndex;
                  return (
                    <li
                      key={s.id}
                      className={`rounded-xl border p-3 min-w-0 ${isCur ? 'border-accent-primary/50 bg-accent-primary/8' : 'border-border-primary bg-bg-tertiary'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold num-mono shrink-0 ${isCur ? 'bg-accent-primary text-white' : 'bg-bg-secondary border border-border-primary text-text-secondary'}`}>{i + 1}</span>
                        <h3 className="text-sm font-bold text-text-primary">{s.name}</h3>
                        {isCur && <span className="text-[10px] font-bold text-accent-hover">· השלב שלך</span>}
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed mt-2">{s.description}</p>
                      <p className="text-[11px] text-text-muted mt-2">
                        <span className="font-semibold text-text-secondary">{i === 0 ? 'כניסה: ' : 'דרישות כניסה: '}</span>
                        {s.requirements.join(' · ')}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
