import { describe, expect, it } from 'vitest';
import { reminderHookReview } from './reminderHookReview';

describe('reminderHookReview', () => {
  it('does not throw when facts is missing, and reads no headlines', () => {
    expect(() => reminderHookReview(null)).not.toThrow();
    expect(() => reminderHookReview({ source: 'ai' })).not.toThrow();
    expect(() => reminderHookReview({ source: 'template', facts: undefined, stats: undefined })).not.toThrow();
    expect(reminderHookReview({ source: 'ai' })).toEqual({ line: '', headline: '' });
    expect(reminderHookReview({ facts: null })).toEqual({ line: '', headline: '' });
  });

  it('does not throw when facts exists but headlines and movers are missing', () => {
    expect(() => reminderHookReview({ facts: {} })).not.toThrow();
    expect(() => reminderHookReview({ facts: { headlines: undefined, gainers: null, losers: null, btc: null } })).not.toThrow();
    expect(reminderHookReview({ facts: {} })).toEqual({ line: '', headline: '' });
    expect(reminderHookReview({ facts: { headlines: [] } }).headline).toBe('');
  });

  it('reads an older market payload when the fields are actually there', () => {
    const review = reminderHookReview({
      facts: {
        btc: { coin: 'BTC', change: 1.2 },
        eth: null,
        gainers: [{ coin: 'SOL', change: 3 }],
        losers: undefined,
        headlines: ['הפד מסמן הורדת ריבית'],
      },
    });
    expect(review.line).toContain('BTC');
    expect(review.line).toContain('SOL');
    expect(review.headline).toBe('הפד מסמן הורדת ריבית');
  });

  it('prefers the recipient stats and still tolerates a stats-only payload', () => {
    const review = reminderHookReview({
      stats: { weekTrades: 3, openTrades: 2, journalDays: null, daysSinceLogin: null },
    });
    expect(review.line).toBe('השבוע 3 עסקאות · 2 עסקאות פתוחות');
    expect(review.headline).toBe('');
  });
});
