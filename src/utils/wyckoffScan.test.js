import { expect, it } from 'vitest';
import { wyckoffEngineState } from './wyckoff';

it('defaults to paused when nothing is tagged and no choice is saved', () => {
  expect(wyckoffEngineState(null, 0)).toEqual({ running: false, scan: false });
  expect(wyckoffEngineState(undefined, 0)).toEqual({ running: false, scan: false });
});

it('keeps a tagged watchlist running when no choice is saved', () => {
  expect(wyckoffEngineState(null, 2)).toEqual({ running: true, scan: true });
});

it('stays paused when the owner turned it off, even with tagged coins', () => {
  expect(wyckoffEngineState(false, 4)).toEqual({ running: false, scan: false });
});

it('stays on but does not scan when the owner turned it on with an empty list', () => {
  expect(wyckoffEngineState(true, 0)).toEqual({ running: true, scan: false });
});

it('scans only when the engine is on and at least one coin is tagged', () => {
  expect(wyckoffEngineState(true, 1)).toEqual({ running: true, scan: true });
});
