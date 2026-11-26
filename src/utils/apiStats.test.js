import { describe, expect, it } from 'vitest';
import { groupTradeStats } from './apiStats';

const closed = (over) => ({
  status: 'closed',
  result: 'win',
  direction: 'long',
  entryPrice: 100,
  exitPrice: 110,
  stopLoss: 90,
  quantity: 1,
  positionSize: 100,
  netPnl: 10,
  pnl: 10,
  entryDate: '2026-06-15T12:00:00.000Z',
  ...over,
});

describe('groupTradeStats setup', () => {
  it('keeps stored setups and uses the trigger only when setups are empty', () => {
    const groups = groupTradeStats([
      closed({ setups: ['Spring'], trigger: 'LPSY' }),
      closed({ setups: [], trigger: 'breakout', result: 'loss', netPnl: -5 }),
      closed({ result: 'loss', netPnl: -5 }),
    ], 'setup', 'live');
    expect(groups.map((group) => group.key).sort()).toEqual(['Spring', 'breakout', 'ללא סטאפ']);
    expect(groups.find((group) => group.key === 'LPSY')).toBeUndefined();
  });
});
