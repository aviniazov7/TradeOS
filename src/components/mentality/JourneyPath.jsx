import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Route } from 'lucide-react';
import { STAGES } from '../../utils/traderStage';
import {
  layoutJourney, stagePoint, drawEaseInverse, PEAK_POINT_INDEX, stageStatus as statusOf, DRAW_SECONDS as DRAW_S,
} from '../../utils/journeyPath';
import { JourneySvg } from './JourneyPathSvg';
import { PanelTitle } from './JourneyParts';
import { panel } from './journeyStyle';

// "המסלול שלך" — the hero of the development map: the classic trader-journey
// curve (beginner's luck, losses, learning, steady climb) with the six
// development stages on it, the user's stage marked "אתה כאן", and a caption
// that describes the stage under the pointer (or the last one tapped).
//
// Geometry lives in utils/journeyPath.js, the drawing in JourneyPathSvg.jsx.
// The curve is mirrored (the journey starts on the right, RTL). Labels are
// HTML laid over the SVG, positioned by percentage, so they keep the page's
// RTL text and readable font sizes at every width (SVG text would ignore the
// dir attribute and scale with the viewBox).

const ACCENT = 'var(--color-accent-primary)';
const n = STAGES.length;

// Two layouts: a wide ~4:1 strip from sm up, a taller one for phones that
// leaves room for labels above and below the line.
const BOXES = {
  wide: { width: 1000, height: 250, padX: 60, padTop: 40, padBottom: 44 },
  narrow: { width: 340, height: 272, padX: 22, padTop: 52, padBottom: 56 },
};

// On phones the "עקבי" label would run into the top stage beside it, so it
// grows toward the open side instead (screen right, away from the end).
const NARROW_ANCHOR = { 4: 'left' };

// Which side of the line each stage label sits on (alternating where the
// stages are close, always on the open side of the curve).
const LABEL_SIDE = ['below', 'below', 'above', 'below', 'above', 'above'];

const pct = (v, total) => `${(v / total) * 100}%`;

// Horizontal anchoring of an overlay at screen-x `x`: centred, unless that
// would run past the edge, in which case it hugs the side the dot is on.
function anchorStyle(x, width, force) {
  const f = x / width;
  const edge = 0.12;
  if (force === 'right' || (!force && f > 1 - edge)) return { right: `calc(${pct(width - x, width)} - 10px)`, textAlign: 'right' };
  if (force === 'left' || (!force && f < edge)) return { left: `calc(${pct(x, width)} - 10px)`, textAlign: 'left' };
  return { left: pct(x, width), transform: 'translateX(-50%)', textAlign: 'center' };
}

// ── Page hero ─────────────────────────────────────────────────────────────
function JourneyCanvas({ box, cur, progress, nextName, selected, onHover, onPick, reduce, compact }) {
  const L = useMemo(() => layoutJourney({ ...box, mirror: true }), [box]);
  const delayOf = (fraction) => (reduce ? 0 : drawEaseInverse(fraction) * DRAW_S);
  const peak = L.points[PEAK_POINT_INDEX];
  const peakFraction = L.cum[PEAK_POINT_INDEX] / L.length;
  const fade = (fraction, dy = 0) => ({
    initial: reduce ? false : { opacity: 0, y: dy },
    animate: { opacity: 1, y: 0 },
    transition: { delay: delayOf(fraction) + 0.08, duration: 0.3, ease: 'easeOut' },
  });

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${box.width} / ${box.height}` }}>
      <JourneySvg
        box={box}
        cur={cur}
        progress={progress}
        color={ACCENT}
        selected={selected}
        reduce={reduce}
        dot={compact ? 7 : 8}
        strokeW={compact ? 2.5 : 3}
      />

      {/* The classic landmark that is not a stage of its own. */}
      <motion.span
        aria-hidden
        className="absolute text-[10px] sm:text-[11px] text-text-muted whitespace-nowrap pointer-events-none"
        style={{ ...anchorStyle(peak.x, box.width), bottom: `calc(${pct(box.height - peak.y, box.height)} + 8px)` }}
        {...fade(peakFraction, 4)}
      >
        מזל המתחילים
      </motion.span>

      {STAGES.map((s, i) => {
        const p = stagePoint(L, i);
        const st = statusOf(i, cur);
        const side = LABEL_SIDE[i];
        const isSel = selected === i;
        const gap = st === 'current' ? 16 : 12;
        const vert = side === 'above'
          ? { bottom: `calc(${pct(box.height - p.y, box.height)} + ${gap}px)` }
          : { top: `calc(${pct(p.y, box.height)} + ${gap}px)` };
        const label = (
          <div
            className={`text-[11px] sm:text-xs leading-tight whitespace-nowrap ${
              st === 'current' ? 'font-bold text-text-primary'
                : isSel ? 'font-semibold text-text-primary'
                  : st === 'past' ? 'text-text-secondary' : 'text-text-muted'
            }`}
          >
            {s.name}
          </div>
        );
        return (
          <div key={s.id} className="absolute pointer-events-none" style={{ ...anchorStyle(p.x, box.width, compact ? NARROW_ANCHOR[i] : undefined), ...vert }}>
            <motion.div {...fade(p.fraction, side === 'above' ? 4 : -4)}>
              {st === 'current' ? (
                <>
                  {side === 'below' && label}
                  <div className={side === 'above' ? 'mb-1' : 'mt-1'}>
                    <span className="inline-block text-[10px] font-bold text-accent-hover bg-accent-primary/12 border border-accent-primary/30 rounded-full px-1.5 py-px whitespace-nowrap">
                      אתה כאן
                      {nextName
                        ? <> · <span className="num-mono" dir="ltr">{progress}%</span>{!compact && ` ל${nextName}`}</>
                        : !compact && ' · השלב העליון'}
                    </span>
                  </div>
                  {side === 'above' && label}
                </>
              ) : label}
            </motion.div>
          </div>
        );
      })}

      {/* Hit targets: hover / focus previews a stage, tap pins it. */}
      {STAGES.map((s, i) => {
        const p = stagePoint(L, i);
        const st = statusOf(i, cur);
        const state = st === 'past' ? 'הושלם' : st === 'current' ? 'השלב שלך' : 'בהמשך הדרך';
        return (
          <button
            key={s.id}
            type="button"
            className="absolute w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-primary"
            style={{ left: pct(p.x, box.width), top: pct(p.y, box.height) }}
            aria-label={`שלב ${i + 1}: ${s.name} · ${state}`}
            aria-pressed={selected === i}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(i)}
            onBlur={() => onHover(null)}
            onClick={() => onPick(i)}
          />
        );
      })}
    </div>
  );
}

const STATUS_TAG = {
  past: { text: 'הושלם', cls: 'text-profit bg-profit/10 border-profit/25' },
  current: { text: 'השלב שלך', cls: 'text-accent-hover bg-accent-primary/12 border-accent-primary/30' },
  future: { text: 'בהמשך הדרך', cls: 'text-text-muted bg-bg-tertiary border-border-primary' },
};

function ProgressBar({ value, reduce }) {
  return (
    <div className="h-2 mt-2 rounded-full bg-bg-secondary overflow-hidden" aria-hidden>
      <motion.div
        className="h-full rounded-full"
        style={{ background: ACCENT }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: reduce ? 0 : DRAW_S * 0.6 }}
      />
    </div>
  );
}

// The hero of the development map: "המסלול שלך". Replaces the old stage
// ladder — the stops on the curve are the same six stages.
export function JourneyMap({ assessment }) {
  const reduce = useReducedMotion();
  const { stage, nextStage, stageProgress } = assessment;
  const cur = stage.index - 1;
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const shown = hover ?? pinned ?? cur;
  const s = STAGES[shown];
  const st = statusOf(shown, cur);
  const tag = STATUS_TAG[st];
  const pick = (i) => setPinned((p) => (p === i || i === cur ? null : i));
  const canvas = { cur, progress: stageProgress, nextName: nextStage?.name, selected: shown === cur ? null : shown, onHover: setHover, onPick: pick, reduce };

  return (
    <section className={panel} aria-label="המסלול שלך">
      <PanelTitle icon={Route} aside={<span className="num-mono" dir="ltr">{stage.index}/{n}</span>}>המסלול שלך</PanelTitle>

      <div className="hidden sm:block" role="group" aria-label="שלבי המסלול">
        <JourneyCanvas box={BOXES.wide} {...canvas} />
      </div>
      <div className="sm:hidden" role="group" aria-label="שלבי המסלול">
        <JourneyCanvas box={BOXES.narrow} compact {...canvas} />
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
        {/* Caption: the stage under the pointer / last tapped, else the user's. */}
        <div className="min-w-0" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shown}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-text-muted">שלב {shown + 1} מתוך {n}</p>
                <span className={`text-[10px] font-bold border rounded-full px-1.5 py-px ${tag.cls}`}>{tag.text}</span>
              </div>
              <h2 className="text-lg md:text-xl font-bold text-text-primary mt-0.5">{s.name}</h2>
              <p className="text-sm text-text-secondary leading-relaxed mt-1.5">{s.description}</p>
              <p className="text-xs text-text-muted mt-2">
                {st === 'current' && <><span className="font-semibold text-text-secondary">המיקוד עכשיו: </span>{s.focus}</>}
                {st === 'future' && <><span className="font-semibold text-text-secondary">דרישות כניסה: </span>{s.requirements.join(' · ')}</>}
                {st === 'past' && <><span className="font-semibold text-text-secondary">עברת את השלב הזה. </span>מה שנבנה בו: {s.focus}</>}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="rounded-xl bg-bg-tertiary border border-border-primary p-3 min-w-0">
          {nextStage ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-text-muted">התקדמות ל<span className="font-semibold text-text-secondary">{nextStage.name}</span></span>
                <span className="num-mono text-xl font-bold text-text-primary" dir="ltr">{stageProgress}%</span>
              </div>
              <ProgressBar value={stageProgress} reduce={reduce} />
            </>
          ) : (
            <p className="text-sm font-semibold text-profit">הגעת לשלב העליון. המשימה עכשיו: לשמר.</p>
          )}
        </div>
      </div>
    </section>
  );
}

