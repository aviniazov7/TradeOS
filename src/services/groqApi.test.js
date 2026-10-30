import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => 'token' } }),
}));

import { aiFetchFailureMessage, fetchProjectDescription } from './groqApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('aiFetchFailureMessage', () => {
  it('treats an iOS Load failed abort as a timeout, not a dead connection', () => {
    const loadFailed = Object.assign(new TypeError('Load failed'), { name: 'TypeError' });
    expect(aiFetchFailureMessage(loadFailed, true)).toBe('השרת לא הגיב בזמן. נסה שוב.');
    expect(aiFetchFailureMessage(Object.assign(new Error('x'), { name: 'AbortError' }), false)).toBe('השרת לא הגיב בזמן. נסה שוב.');
  });

  it('keeps a real network rejection as a connection error', () => {
    const failed = Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });
    expect(aiFetchFailureMessage(failed, false)).toBe('בעיית תקשורת עם השרת. בדוק את החיבור ונסה שוב.');
  });
});

describe('fetchProjectDescription quota', () => {
  it('does not retry when the TradeAI quota is spent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: 'הגעת למכסה היומית (20 בקשות).',
      quotaExceeded: true,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchProjectDescription('Bitcoin', 'BTC', 2)).rejects.toMatchObject({ quotaExceeded: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
