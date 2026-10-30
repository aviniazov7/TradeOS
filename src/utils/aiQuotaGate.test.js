import { describe, expect, it } from 'vitest';
import {
  chartQuotaBlock, dailyAiQuotaMessage, imageAiQuotaMessage,
  isDailyAiQuotaExhausted, isImageAiQuotaExhausted,
} from './aiQuotaGate';

describe('daily AI quota gate', () => {
  it('treats a full premium counter as exhausted', () => {
    const usage = { used: 200, limit: 200, premium: true, loading: false };
    expect(isDailyAiQuotaExhausted(usage)).toBe(true);
    expect(dailyAiQuotaMessage(usage)).toBe('הגעת לתקרה היומית של Premium (200). נסה מחר.');
  });

  it('treats a full free counter as exhausted', () => {
    const usage = { used: 20, limit: 20, premium: false, loading: false };
    expect(isDailyAiQuotaExhausted(usage)).toBe(true);
    expect(dailyAiQuotaMessage(usage)).toContain('הגעת למכסה היומית (20 בקשות)');
  });

  it('does not block while usage is still loading or under the cap', () => {
    expect(isDailyAiQuotaExhausted({ used: 200, limit: 200, premium: true, loading: true })).toBe(false);
    expect(isDailyAiQuotaExhausted({ used: 199, limit: 200, premium: true, loading: false })).toBe(false);
    expect(isDailyAiQuotaExhausted(null)).toBe(false);
    expect(isDailyAiQuotaExhausted({ used: 20, limit: 20, unlimited: true, loading: false })).toBe(false);
  });
});

describe('chart quota gate', () => {
  it('prefers the shared question cap over the image cap', () => {
    const usage = { used: 200, limit: 200, premium: true, loading: false, imageUsed: 10, imageLimit: 10 };
    expect(chartQuotaBlock(usage)).toBe(dailyAiQuotaMessage(usage));
  });

  it('blocks a premium user who still has questions but no image analyses left', () => {
    const usage = { used: 3, limit: 200, premium: true, loading: false, imageUsed: 10, imageLimit: 10 };
    expect(isImageAiQuotaExhausted(usage)).toBe(true);
    expect(chartQuotaBlock(usage)).toBe(imageAiQuotaMessage(usage));
    expect(chartQuotaBlock(usage)).toContain('ניתוחי התמונות היומית');
  });

  it('does not apply the image cap to free users', () => {
    expect(isImageAiQuotaExhausted({ premium: false, loading: false, imageUsed: 10, imageLimit: 10 })).toBe(false);
  });
});
