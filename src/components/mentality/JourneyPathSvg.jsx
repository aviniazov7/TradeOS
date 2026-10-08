import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { STAGES } from '../../utils/traderStage';
import {
  layoutJourney, stagePoint, travelPoint, pathBetween, drawEase, drawEaseInverse, stageStatus as statusOf,
  DRAW_SECONDS as DRAW_S,
} from '../../utils/journeyPath';

// The drawing of the animated trader-journey path, shared by the development
// map hero (JourneyPath.jsx) and the mental-zone tile. Kept in its own module
// so the zone chunk does not pull in the rest of the development map.
//
// On mount the line draws itself (one "pen" mask reveals the whole curve),
// the stage dots pop in as the pen reaches them and the user's stage pulses.
// The travelled part is solid in `color`, the rest muted and dashed. With
// reduced motion everything renders in its final state.

const n = STAGES.length;

const safeId = (id) => `jp${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

// ── The drawing ───────────────────────────────────────────────────────────
// Shared by the page hero and the zone tile. `cur` is the 0-based stage (null
// = no assessment yet: the whole line is muted), `progress` 0–100 toward the
// next stage. `selected` highlights a dot. Returns the SVG only.
export function JourneySvg({ box, cur, progress, color, selected, reduce, dot, strokeW, pulse = true }) {
  const maskId = safeId(useId());
  const L = useMemo(() => layoutJourney({ ...box, mirror: true }), [box]);
  const full = useMemo(() => pathBetween(L, 0, L.length), [L]);
  const travel = cur == null ? { fraction: 0 } : travelPoint(L, cur, progress);
  const split = travel.fraction * L.length;
  const done = split > 0 ? pathBetween(L, 0, split) : null;
  const rest = split < L.length ? pathBetween(L, split, L.length) : null;
  const delayOf = (fraction) => (reduce ? 0 : drawEaseInverse(fraction) * DRAW_S);
  const curPt = cur == null ? null : stagePoint(L, cur);
  const showHead = cur != null && cur < n - 1 && progress > 0;

  return (
    <svg
      viewBox={`0 0 ${box.width} ${box.height}`}
      className="absolute inset-0 w-full h-full overflow-visible"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* The pen: one stroke drawn along the whole curve reveals both the
            travelled and the remaining part, so they draw as one line. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={box.width} height={box.height}>
          <motion.path
            d={full}
            fill="none"
            stroke="white"
            strokeWidth={strokeW * 8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DRAW_S, ease: drawEase }}
          />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {rest && (
          <path
            d={rest}
            fill="none"
            stroke="var(--color-text-muted)"
            strokeOpacity="0.6"
            strokeWidth={strokeW * 0.75}
            strokeDasharray={`${strokeW * 1.5} ${strokeW * 2.2}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {done && (
          <>
            <path d={done} fill="none" stroke={color} strokeOpacity="0.14" strokeWidth={strokeW * 3.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d={done} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </g>

      {/* The "you are here" pulse, once the pen has passed the stage. */}
      {curPt && pulse && !reduce && (
        // The wrapper fades in when the pen arrives; the ring inside pulses
        // from the start (keyframes would show their first value during a delay).
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delayOf(curPt.fraction) + 0.2, duration: 0.3 }}>
          <motion.circle
            cx={curPt.x}
            cy={curPt.y}
            fill={color}
            initial={{ r: dot * 1.4, opacity: 0.35 }}
            animate={{ r: [dot * 1.4, dot * 3.4], opacity: [0.35, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        </motion.g>
      )}
      {curPt && pulse && reduce && <circle cx={curPt.x} cy={curPt.y} r={dot * 2.4} fill={color} opacity="0.14" />}

      {/* The head of the travelled part, between this stage and the next. */}
      {showHead && (
        <motion.circle
          cx={travel.x}
          cy={travel.y}
          r={dot * 0.55}
          fill={color}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delayOf(travel.fraction), duration: 0.2 }}
        />
      )}

      {STAGES.map((s, i) => {
        const p = stagePoint(L, i);
        const st = statusOf(i, cur);
        const isSel = selected === i;
        const r = st === 'current' ? dot * 1.25 : dot;
        return (
          <motion.g
            key={s.id}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: delayOf(p.fraction), type: 'spring', stiffness: 420, damping: 18 }}
          >
            {isSel && st !== 'current' && <circle cx={p.x} cy={p.y} r={r + dot * 0.9} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth={dot * 0.3} />}
            {st === 'past' && (
              <>
                <circle cx={p.x} cy={p.y} r={r} fill={color} />
                <circle cx={p.x} cy={p.y} r={r * 0.36} fill="white" />
              </>
            )}
            {st === 'current' && (
              <>
                <circle cx={p.x} cy={p.y} r={r} fill="var(--color-bg-primary)" stroke={color} strokeWidth={dot * 0.42} />
                <circle cx={p.x} cy={p.y} r={r * 0.45} fill={color} />
              </>
            )}
            {st === 'future' && (
              <circle cx={p.x} cy={p.y} r={r * 0.85} fill="var(--color-bg-primary)" stroke="var(--color-text-muted)" strokeWidth={dot * 0.28} />
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}

// ── Zone tile miniature ───────────────────────────────────────────────────
const MINI_BOX = { width: 240, height: 64, padX: 8, padTop: 8, padBottom: 8 };

// The same path, small and label-free, with the marker at the user's stage
// (from the local snapshot). `cur` null = no snapshot yet: a muted teaser.
export function JourneyMiniPath({ cur, progress, color }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative w-full" style={{ aspectRatio: `${MINI_BOX.width} / ${MINI_BOX.height}` }}>
      <JourneySvg box={MINI_BOX} cur={cur} progress={progress} color={color} reduce={reduce} dot={3.2} strokeW={2} />
    </div>
  );
}
