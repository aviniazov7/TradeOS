// Geometry of the animated "trader journey" path on the development map.
//
// The curve keeps the shape of the classic trader journey — a rise of
// beginner's luck, a dip into losses, a wobbly learning phase and then a
// steady climb — and the six stages of traderStage.js sit on meaningful
// points of it. Everything here is pure (no DOM, no React) so the mapping
// stage -> point is testable.
//
// Coordinates are normalised in "progress space": x runs 0 (start) -> 1
// (end), y runs 0 (top) -> 1 (bottom). The page is RTL, so the component
// mirrors x when it draws (the journey starts on the right).

export const JOURNEY_POINTS = [
  { x: 0.0, y: 0.6 }, //   0  stage 1 · בונה בסיס (the start)
  { x: 0.07, y: 0.44 }, // 1  rising
  { x: 0.16, y: 0.16 }, // 2  the peak of beginner's luck
  { x: 0.29, y: 0.96 }, // 3  stage 2 · צובר ניסיון (the valley of losses)
  { x: 0.35, y: 0.74 }, // 4  learning — recover
  { x: 0.41, y: 0.84 }, // 5  dip
  { x: 0.48, y: 0.64 }, // 6  stage 3 · מגבש שיטה (a method takes shape)
  { x: 0.55, y: 0.76 }, // 7  dip
  { x: 0.62, y: 0.86 }, // 8  stage 4 · מנהל סיכון (the base of the climb)
  { x: 0.7, y: 0.6 }, //   9  climb
  { x: 0.75, y: 0.66 }, // 10 small pullback
  { x: 0.84, y: 0.34 }, // 11 stage 5 · עקבי
  { x: 0.9, y: 0.4 }, //   12 small pullback
  { x: 1.0, y: 0.0 }, //   13 stage 6 · מקצוען (the top, above the beginner's luck)
];

// Index into JOURNEY_POINTS of each stage, in STAGES order.
export const STAGE_POINT_INDEX = [0, 3, 6, 8, 11, 13];

// The classic-journey landmark that is not a stage of its own.
export const PEAK_POINT_INDEX = 2;

// Seconds the line takes to draw itself on mount.
export const DRAW_SECONDS = 1.6;

// Status of stage i (0-based) relative to the user's stage `cur` (null = no
// assessment yet, every stage still ahead).
export const stageStatus = (i, cur) => (cur == null ? 'future' : i < cur ? 'past' : i === cur ? 'current' : 'future');

// The line draws itself with this easing (easeOutCubic). Kept here, with its
// inverse, so each stage dot can pop in exactly when the pen reaches it.
export const drawEase = (t) => 1 - (1 - t) ** 3;
export const drawEaseInverse = (v) => 1 - (1 - Math.min(1, Math.max(0, v))) ** (1 / 3);

/**
 * Lay the normalised curve out in a viewBox.
 * @param {{ width: number, height: number, padX?: number, padTop?: number, padBottom?: number, mirror?: boolean }} box
 * @returns {{ points: {x:number,y:number}[], cum: number[], length: number }}
 *   points in viewBox units, cumulative arc length at each point, total length.
 */
export function layoutJourney({ width, height, padX = 0, padTop = 0, padBottom = 0, mirror = false }) {
  const w = width - padX * 2;
  const h = height - padTop - padBottom;
  const points = JOURNEY_POINTS.map((p) => {
    const x = padX + p.x * w;
    return { x: mirror ? width - x : x, y: padTop + p.y * h };
  });
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, cum, length: cum[cum.length - 1] };
}

/** Point at a given arc-length distance along the laid-out curve. */
export function pointAtLength(layout, dist) {
  const { points, cum, length } = layout;
  const d = Math.min(length, Math.max(0, dist));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (d - cum[i - 1]) / seg : 0;
  const a = points[i - 1];
  const b = points[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Where a stage sits on the curve.
 * @param {object} layout from layoutJourney
 * @param {number} stageIdx 0-based stage index (clamped to the six stages)
 * @returns {{ x: number, y: number, fraction: number }} the point and its
 *   share (0..1) of the total path length.
 */
export function stagePoint(layout, stageIdx) {
  const i = Math.min(STAGE_POINT_INDEX.length - 1, Math.max(0, Math.round(stageIdx)));
  const pi = STAGE_POINT_INDEX[i];
  return { ...layout.points[pi], fraction: layout.length ? layout.cum[pi] / layout.length : 0 };
}

/**
 * How far the user has travelled: from the start to their stage, plus
 * `progress`% of the way to the next one (by arc length). At the top stage
 * the progress is ignored.
 * @returns {{ x: number, y: number, fraction: number }}
 */
export function travelPoint(layout, stageIdx, progress = 0) {
  const here = stagePoint(layout, stageIdx);
  const last = STAGE_POINT_INDEX.length - 1;
  const i = Math.min(last, Math.max(0, Math.round(stageIdx)));
  const p = Math.min(100, Math.max(0, Number(progress) || 0)) / 100;
  if (i >= last || p === 0) return here;
  const from = layout.cum[STAGE_POINT_INDEX[i]];
  const to = layout.cum[STAGE_POINT_INDEX[i + 1]];
  const dist = from + (to - from) * p;
  return { ...pointAtLength(layout, dist), fraction: dist / layout.length };
}

/** SVG path data for the points between two arc-length distances. */
export function pathBetween(layout, fromDist, toDist) {
  const { points, cum } = layout;
  const a = Math.max(0, Math.min(fromDist, toDist));
  const b = Math.min(layout.length, Math.max(fromDist, toDist));
  const pts = [pointAtLength(layout, a)];
  for (let i = 0; i < points.length; i++) if (cum[i] > a && cum[i] < b) pts.push(points[i]);
  pts.push(pointAtLength(layout, b));
  return pts.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join(' ');
}

const round = (n) => Math.round(n * 100) / 100;
