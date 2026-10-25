import { describe, expect, it } from 'vitest';
import { primaryTabId } from './primaryNav';

describe('primary tabs', () => {
  it('maps the four top destinations and leaves the rest unselected', () => {
    expect(primaryTabId('/', '')).toBe('home');
    expect(primaryTabId('/journal', '')).toBe('journal');
    expect(primaryTabId('/journal', '?tab=analytics')).toBe('journal');
    expect(primaryTabId('/journal', '?tab=exchange')).toBe('exchange');
    expect(primaryTabId('/terminal', '')).toBe('journal');
    expect(primaryTabId('/news', '')).toBe('news');
    expect(primaryTabId('/market', '')).toBeNull();
    expect(primaryTabId('/portfolio', '?tab=wallets')).toBeNull();
    expect(primaryTabId('/profile', '')).toBeNull();
  });
});
