import { describe, it, expect } from 'vitest';
import {
  JOURNEY_POINTS, STAGE_POINT_INDEX, PEAK_POINT_INDEX, layoutJourney, stagePoint, travelPoint, pointAtLength,
  pathBetween, drawEase, drawEaseInverse,
} from './journeyPath';
import { STAGES } from './traderStage';

const box = { width: 1000, height: 250, padX: 40, padTop: 30, padBottom: 50 };

describe('journeyPath', () => {
  it('has one curve point per stage, in order along the path', () => {
    expect(STAGE_POINT_INDEX).toHaveLength(STAGES.length);
    for (let i = 1; i < STAGE_POINT_INDEX.length; i++) expect(STAGE_POINT_INDEX[i]).toBeGreaterThan(STAGE_POINT_INDEX[i - 1]);
    expect(STAGE_POINT_INDEX[0]).toBe(0);
    expect(STAGE_POINT_INDEX.at(-1)).toBe(JOURNEY_POINTS.length - 1);
  });

  it('keeps the classic shape: beginner-luck peak, a valley of losses, a climb to the top', () => {
    const peak = JOURNEY_POINTS[PEAK_POINT_INDEX];
    const valley = JOURNEY_POINTS[STAGE_POINT_INDEX[1]];
    const top = JOURNEY_POINTS[STAGE_POINT_INDEX[5]];
    // y grows downwards: the peak is near the top, the valley the lowest point.
    expect(peak.y).toBeLessThan(JOURNEY_POINTS[0].y);
    expect(valley.y).toBe(Math.max(...JOURNEY_POINTS.map((p) => p.y)));
    expect(top.y).toBeLessThan(JOURNEY_POINTS[STAGE_POINT_INDEX[3]].y);
    expect(top.y).toBeLessThan(peak.y); // the real top beats beginner's luck
    // x only moves forward.
    for (let i = 1; i < JOURNEY_POINTS.length; i++) expect(JOURNEY_POINTS[i].x).toBeGreaterThan(JOURNEY_POINTS[i - 1].x);
  });

  it('maps a stage index to its point inside the padded box', () => {
    const L = layoutJourney(box);
    const first = stagePoint(L, 0);
    const last = stagePoint(L, 5);
    expect(first).toMatchObject({ x: 40, fraction: 0 });
    expect(first.y).toBeCloseTo(30 + 0.6 * 170);
    expect(last.x).toBeCloseTo(960);
    expect(last.fraction).toBeCloseTo(1);
    const mid = stagePoint(L, 2);
    expect(mid.x).toBeCloseTo(40 + 0.48 * 920);
    expect(mid.fraction).toBeGreaterThan(stagePoint(L, 1).fraction);
    // Out-of-range indices clamp to the first / last stage.
    expect(stagePoint(L, -3)).toEqual(first);
    expect(stagePoint(L, 9)).toEqual(last);
  });

  it('mirrors x for RTL without changing y or the fractions', () => {
    const L = layoutJourney(box);
    const M = layoutJourney({ ...box, mirror: true });
    for (let s = 0; s < STAGES.length; s++) {
      const a = stagePoint(L, s);
      const b = stagePoint(M, s);
      expect(b.x).toBeCloseTo(1000 - a.x);
      expect(b.y).toBeCloseTo(a.y);
      expect(b.fraction).toBeCloseTo(a.fraction);
    }
    expect(stagePoint(M, 0).x).toBeCloseTo(960); // the journey starts on the right
  });

  it('places the travelled point between the stage and the next by progress', () => {
    const L = layoutJourney(box);
    const s1 = stagePoint(L, 1);
    const s2 = stagePoint(L, 2);
    expect(travelPoint(L, 1, 0)).toEqual(s1);
    const half = travelPoint(L, 1, 50);
    expect(half.fraction).toBeCloseTo((s1.fraction + s2.fraction) / 2);
    expect(travelPoint(L, 1, 100).fraction).toBeCloseTo(s2.fraction);
    expect(travelPoint(L, 1, 250).fraction).toBeCloseTo(s2.fraction); // clamped
    // At the top stage progress means nothing.
    expect(travelPoint(L, 5, 60)).toEqual(stagePoint(L, 5));
  });

  it('walks the curve by arc length and builds path data between two distances', () => {
    const L = layoutJourney(box);
    expect(pointAtLength(L, 0)).toEqual(L.points[0]);
    expect(pointAtLength(L, L.length * 2)).toEqual(L.points.at(-1));
    expect(pointAtLength(L, L.cum[4])).toEqual(L.points[4]);
    const d = pathBetween(L, 0, L.cum[3]);
    expect(d.startsWith('M40 ')).toBe(true);
    expect(d.split('L')).toHaveLength(4); // points 0..3
  });

  it('inverts the draw easing so dots pop when the pen reaches them', () => {
    for (const t of [0, 0.2, 0.5, 0.9, 1]) expect(drawEaseInverse(drawEase(t))).toBeCloseTo(t);
  });
});
