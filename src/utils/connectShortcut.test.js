import { describe, expect, it } from 'vitest';
import { shouldShowMobileConnectShortcut } from './connectShortcut';
import { gettingStartedModel } from './gettingStarted';

describe('shouldShowMobileConnectShortcut', () => {
  it('shows only when the account has zero connections', () => {
    expect(shouldShowMobileConnectShortcut(null)).toBe(false);
    expect(shouldShowMobileConnectShortcut(undefined)).toBe(false);
    expect(shouldShowMobileConnectShortcut(0)).toBe(true);
    expect(shouldShowMobileConnectShortcut(1)).toBe(false);
  });
});

describe('gettingStartedModel', () => {
  it('leads with the exchange and counts a linked wallet as the opening balance', () => {
    const steps = gettingStartedModel({ tradeCount: 0, exchangeConnected: false, hasOpeningBalance: false, morningCount: 0 });
    expect(steps.map((s) => s.key)).toEqual(['exchange', 'trade', 'balance', 'mind']);
    expect(steps.every((s) => s.done === false)).toBe(true);
    const linked = gettingStartedModel({ exchangeConnected: true });
    expect(linked.find((s) => s.key === 'exchange').done).toBe(true);
    expect(linked.find((s) => s.key === 'balance').done).toBe(true);
    expect(linked.find((s) => s.key === 'trade').done).toBe(false);
  });
});