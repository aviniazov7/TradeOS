import { describe, expect, it } from 'vitest';
import { aiFetchFailureMessage } from './groqApi';

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
