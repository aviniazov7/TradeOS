import { describe, it, expect } from 'vitest';
import { matchSyncRow, matchByExternalId, matchOpenPosition, findStaleOpenTrades, tradeDateMs } from './tradeMatching';

// The reconciliation these cover is the one that used to leave a phantom OPEN
// row in the journal forever and import its close as a duplicate trade.

const ts = (iso) => ({ toDate: () => new Date(iso) });

const openBtc = {
  id: 'open1',
  status: 'open',
  source: 'bybit',
  pair: 'BTCUSDT',
  direction: 'long',
  entryPrice: 60000,
  entryDate: ts('2026-08-01T10:00:00Z'),
  externalId: 'BTCUSDT_0_1754042400000',
};

describe('tradeDateMs', () => {
  it('reads Firestore Timestamps, Dates, ISO strings and epoch ms', () => {
    const ms = Date.UTC(2026, 7, 1, 10);
    expect(tradeDateMs(ts('2026-08-01T10:00:00Z'))).toBe(ms);
    expect(tradeDateMs(new Date(ms))).toBe(ms);
    expect(tradeDateMs('2026-08-01T10:00:00.000Z')).toBe(ms);
    expect(tradeDateMs(ms)).toBe(ms);
    expect(tradeDateMs({ seconds: ms / 1000 })).toBe(ms);
    expect(tradeDateMs({ _seconds: ms / 1000 })).toBe(ms);
  });
  it('returns null (never 0) for missing or junk values — 0 would read as the epoch', () => {
    expect(tradeDateMs(null)).toBe(null);
    expect(tradeDateMs(undefined)).toBe(null);
    expect(tradeDateMs('not a date')).toBe(null);
  });
});

describe('matchByExternalId', () => {
  it('matches on any id overlap (multi-TP row carries every close id)', () => {
    const trades = [{ id: 'a', externalId: 'close-1' }];
    expect(matchByExternalId(trades, { externalIds: ['close-1', 'close-2'] })?.id).toBe('a');
  });
  it('no ids on the row means no match', () => {
    expect(matchByExternalId([{ id: 'a', externalId: 'x' }], {})).toBe(null);
  });
});

describe('matchOpenPosition — closed row reconciling to its open trade', () => {
  const closeRow = {
    source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60000, exitPrice: 62000,
    exitDate: '2026-08-02T10:00:00Z',
    externalId: 'closing-order-99',
  };

  it('reconciles the close to the open position it belongs to', () => {
    expect(matchOpenPosition([openBtc], closeRow)?.id).toBe('open1');
  });

  it('never crosses exchange, pair or direction', () => {
    expect(matchOpenPosition([{ ...openBtc, source: 'mexc' }], closeRow)).toBe(null);
    expect(matchOpenPosition([{ ...openBtc, pair: 'ETHUSDT' }], closeRow)).toBe(null);
    expect(matchOpenPosition([{ ...openBtc, direction: 'short' }], closeRow)).toBe(null);
  });

  it('never touches a trade that is already closed', () => {
    expect(matchOpenPosition([{ ...openBtc, status: 'closed' }], closeRow)).toBe(null);
  });

  it('never touches a manually entered trade (no source)', () => {
    expect(matchOpenPosition([{ ...openBtc, source: undefined }], closeRow)).toBe(null);
  });

  it('rejects a position opened AFTER this close — it is a different position', () => {
    const laterOpen = { ...openBtc, entryDate: ts('2026-08-03T10:00:00Z') };
    expect(matchOpenPosition([laterOpen], closeRow)).toBe(null);
  });

  it('rejects an entry price outside the 1% tolerance', () => {
    expect(matchOpenPosition([{ ...openBtc, entryPrice: 55000 }], closeRow)).toBe(null);
    expect(matchOpenPosition([{ ...openBtc, entryPrice: 60300 }], closeRow)?.id).toBe('open1');
  });

  it('picks the nearest entry price when several positions qualify', () => {
    const near = { ...openBtc, id: 'near', entryPrice: 60050 };
    const far = { ...openBtc, id: 'far', entryPrice: 60500 };
    expect(matchOpenPosition([far, near], closeRow)?.id).toBe('near');
  });
});

describe('matchOpenPosition — re-synced open row must not duplicate', () => {
  // The open-position id embeds updatedTime, so a re-sync of the SAME live
  // position arrives with a brand-new id and used to import as a second row.
  const resyncRow = {
    source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 59000, // scaled in, average moved
    externalId: 'BTCUSDT_0_1754900000000',
  };

  it('matches the live position on identity alone, ignoring the moved average', () => {
    expect(matchOpenPosition([openBtc], resyncRow, { requireEntryPrice: false })?.id).toBe('open1');
  });

  it('with the price guard on, the moved average would wrongly look like a new position', () => {
    expect(matchOpenPosition([openBtc], resyncRow, { requireEntryPrice: true })).toBe(null);
  });
});

describe('matchSyncRow — ids first, identity second', () => {
  it('prefers the id match even when an open position also looks similar', () => {
    const byId = { id: 'byId', status: 'closed', externalId: 'closing-order-99' };
    const row = {
      source: 'bybit', pair: 'BTCUSDT', direction: 'long', entryPrice: 60000,
      exitDate: '2026-08-02T10:00:00Z', externalId: 'closing-order-99',
    };
    expect(matchSyncRow([openBtc, byId], row)?.id).toBe('byId');
  });

  it('falls back to the open position when no id overlaps', () => {
    const row = {
      source: 'bybit', pair: 'BTCUSDT', direction: 'long', entryPrice: 60000,
      exitDate: '2026-08-02T10:00:00Z', externalId: 'brand-new-close',
    };
    expect(matchSyncRow([openBtc], row)?.id).toBe('open1');
  });

  it('returns null for a genuinely new trade', () => {
    const row = {
      source: 'bybit', pair: 'SOLUSDT', direction: 'long', entryPrice: 150,
      exitDate: '2026-08-02T10:00:00Z', externalId: 'brand-new-close',
    };
    expect(matchSyncRow([openBtc], row)).toBe(null);
  });

  it('an open row uses the no-price-guard path', () => {
    const row = { source: 'bybit', pair: 'BTCUSDT', direction: 'long', entryPrice: 59000, externalId: 'new-snapshot' };
    expect(matchSyncRow([openBtc], row, { isOpenRow: true })?.id).toBe('open1');
    expect(matchSyncRow([openBtc], row, { isOpenRow: false })).toBe(null);
  });
});

describe('matchOpenPosition — a live position is not closed by an older close', () => {
  // Syncing a long history while holding a live position: an old close on the
  // same pair, at a similar price, must not reconcile into the open row.
  const heldSinceJune = {
    id: 'held', status: 'open', source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60000, quantity: 1,
    entryDate: ts('2026-06-01T10:00:00Z'),
    // A sync saw it live here.
    exchangeOpenAt: ts('2026-08-20T10:00:00Z'),
  };
  const julyClose = {
    source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60200, exitPrice: 61000, quantity: 1,
    exitDate: '2026-07-15T10:00:00Z',
    externalId: 'july-close',
  };

  it('rejects a close that predates the last time the position was seen open', () => {
    expect(matchOpenPosition([heldSinceJune], julyClose)).toBe(null);
  });

  it('still reconciles a close that happened after that', () => {
    const laterClose = { ...julyClose, exitDate: '2026-08-21T10:00:00Z', externalId: 'aug-close' };
    expect(matchOpenPosition([heldSinceJune], laterClose)?.id).toBe('held');
  });

  it('IGNORES updatedAt — a user annotating a live trade must not block its close', () => {
    // updatedAt is bumped by every journal edit. Folding it into the guard
    // meant adding a note to an open position permanently prevented its close
    // from ever reconciling, reinstating the duplicate-trade bug.
    const edited = {
      ...heldSinceJune,
      exchangeOpenAt: ts('2026-08-20T10:00:00Z'),
      updatedAt: ts('2026-08-25T20:00:00Z'), // user edited AFTER the close
    };
    const closeBeforeTheEdit = { ...julyClose, exitDate: '2026-08-21T09:00:00Z', externalId: 'c1' };
    expect(matchOpenPosition([edited], closeBeforeTheEdit)?.id).toBe('held');
  });

  it('legacy documents with no exchangeOpenAt fall back to entryDate/createdAt', () => {
    const legacy = { ...heldSinceJune, exchangeOpenAt: undefined };
    expect(matchOpenPosition([legacy], julyClose)?.id).toBe('held');
    const openedAfterTheClose = { ...legacy, entryDate: ts('2026-07-20T10:00:00Z') };
    expect(matchOpenPosition([openedAfterTheClose], julyClose)).toBe(null);
  });
});

describe('matchOpenPosition — a PARTIAL close must not close a live position', () => {
  const open2btc = {
    id: 'p1', status: 'open', source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60000, quantity: 2,
    entryDate: ts('2026-08-01T10:00:00Z'),
    exchangeOpenAt: ts('2026-08-01T10:00:00Z'),
  };
  // Bybit emits one closed-pnl row per closing order, carrying the POSITION's
  // average entry but only the CLOSED slice's quantity — indistinguishable
  // from a full close on price alone.
  const tp1 = {
    source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60000, exitPrice: 62000, quantity: 1,
    exitDate: '2026-08-02T10:00:00Z', externalId: 'tp1',
  };

  it('rejects a close covering only part of the position', () => {
    expect(matchOpenPosition([open2btc], tp1)).toBe(null);
  });

  it('accepts the close that covers the whole position', () => {
    expect(matchOpenPosition([open2btc], { ...tp1, quantity: 2 })?.id).toBe('p1');
  });

  it('tolerates rounding just under the full size, and a scaled-up close', () => {
    expect(matchOpenPosition([open2btc], { ...tp1, quantity: 1.995 })?.id).toBe('p1');
    expect(matchOpenPosition([open2btc], { ...tp1, quantity: 3 })?.id).toBe('p1');
  });

  it('an OPEN row still matches the remainder regardless of size', () => {
    const remainder = { source: 'bybit', pair: 'BTCUSDT', direction: 'long', entryPrice: 60000, quantity: 1, externalId: 'snap2' };
    expect(matchSyncRow([open2btc], remainder, { isOpenRow: true })?.id).toBe('p1');
  });
});

describe('matchSyncRow — batch claims stop two rows collapsing onto one document', () => {
  const openDoc = {
    id: 'D', status: 'open', source: 'bybit', pair: 'BTCUSDT', direction: 'long',
    entryPrice: 60000, quantity: 1,
    entryDate: ts('2026-08-01T10:00:00Z'),
    exchangeOpenAt: ts('2026-08-01T10:00:00Z'),
  };

  it('a claimed document is invisible to the next row of the batch', () => {
    const close = {
      source: 'bybit', pair: 'BTCUSDT', direction: 'long',
      entryPrice: 60000, exitPrice: 62000, quantity: 1,
      exitDate: '2026-08-03T10:00:00Z', externalId: 'close-a',
    };
    const claimed = new Set();
    expect(matchSyncRow([openDoc], close, { exclude: claimed })?.id).toBe('D');
    claimed.add('D');
    // The open row of a DIFFERENT position on the same pair must now create
    // its own document instead of overwriting the one just closed.
    const newPosition = { source: 'bybit', pair: 'BTCUSDT', direction: 'long', entryPrice: 61500, quantity: 1, externalId: 'snap-new' };
    expect(matchSyncRow([openDoc], newPosition, { isOpenRow: true, exclude: claimed })).toBe(null);
  });
});

describe('matchByExternalId — scoping', () => {
  it('does not match across exchanges (position ids are bare numbers)', () => {
    const mexcTrade = { id: 'm1', source: 'mexc', externalId: '123456' };
    const okxRow = { source: 'okx', externalId: '123456' };
    expect(matchByExternalId([mexcTrade], okxRow)).toBe(null);
    expect(matchByExternalId([mexcTrade], { source: 'mexc', externalId: '123456' })?.id).toBe('m1');
  });

  it('an incoming OPEN row never resurrects a closed trade', () => {
    const closedDoc = { id: 'c1', status: 'closed', source: 'okx', externalId: 'pos-9' };
    const openRow = { source: 'okx', pair: 'BTCUSDT', direction: 'long', externalId: 'pos-9' };
    expect(matchByExternalId([closedDoc], openRow, { requireOpen: true })).toBe(null);
    expect(matchSyncRow([closedDoc], openRow, { isOpenRow: true })).toBe(null);
    // A closed row may still legitimately update it (a later close of the same position).
    expect(matchByExternalId([closedDoc], { source: 'okx', externalId: 'pos-9' })?.id).toBe('c1');
  });
});

describe('findStaleOpenTrades — the residue of the pre-fix duplicate bug', () => {
  const open = (id, pair, direction, source = 'bybit') =>
    ({ id, status: 'open', source, pair, direction });

  it('flags an open trade the exchange no longer reports', () => {
    const trades = [open('a', 'BTCUSDT', 'long'), open('b', 'ETHUSDT', 'short')];
    const live = [{ pair: 'BTCUSDT', direction: 'long' }];
    expect(findStaleOpenTrades(trades, live, 'bybit').map((t) => t.id)).toEqual(['b']);
  });

  it('never touches closed trades, other exchanges, or manual entries', () => {
    const trades = [
      { id: 'closed', status: 'closed', source: 'bybit', pair: 'ETHUSDT', direction: 'short' },
      open('other', 'ETHUSDT', 'short', 'mexc'),
      { id: 'manual', status: 'open', pair: 'ETHUSDT', direction: 'short' },
    ];
    expect(findStaleOpenTrades(trades, [], 'bybit')).toEqual([]);
  });

  it('matches pair case-insensitively and respects direction', () => {
    const trades = [open('a', 'btcusdt', 'long')];
    expect(findStaleOpenTrades(trades, [{ pair: 'BTCUSDT', direction: 'long' }], 'bybit')).toEqual([]);
    expect(findStaleOpenTrades(trades, [{ pair: 'BTCUSDT', direction: 'short' }], 'bybit').map((t) => t.id)).toEqual(['a']);
  });

  it('a non-array openRows (a failed call) flags nothing', () => {
    const trades = [open('a', 'BTCUSDT', 'long')];
    expect(findStaleOpenTrades(trades, null, 'bybit')).toEqual([]);
    expect(findStaleOpenTrades(trades, undefined, 'bybit')).toEqual([]);
  });
});
