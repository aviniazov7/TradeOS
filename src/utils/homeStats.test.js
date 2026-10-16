import { describe, it, expect } from 'vitest';
import { scoreReady, winLossRatio, streakDaysLabel, profitFactorText, winRateText, MIN_SCORE_TRADES } from './homeStats';

describe('homeStats', () => {
  it('holds the score back until enough trades are closed', () => {
    expect(scoreReady(1)).toBe(false);
    expect(scoreReady(MIN_SCORE_TRADES - 1)).toBe(false);
    expect(scoreReady(MIN_SCORE_TRADES)).toBe(true);
  });

  it('has no win/loss ratio without a loss', () => {
    expect(winLossRatio(200, 0)).toBeNull();
    expect(winLossRatio(200, -100)).toBe(2);
    expect(winLossRatio(0, -50)).toBe(0);
  });

  it('words the day streak in Hebrew', () => {
    expect(streakDaysLabel(0)).toBe('אין רצף ימים');
    expect(streakDaysLabel(1)).toBe('יום אחד ברצף');
    expect(streakDaysLabel(2)).toBe('יומיים ברצף');
    expect(streakDaysLabel(7)).toBe('7 ימים ברצף');
  });

  it('shows a dash for profit factor and win rate when nothing has been decided', () => {
    expect(profitFactorText(0, 0, 0)).toBe('—');
    expect(winRateText(0, 0, 0)).toBe('—');
    expect(profitFactorText(1.5, 3, 2)).toBe('1.50');
    expect(profitFactorText(Infinity, 2, 0)).toBe('∞');
    expect(winRateText(66.666, 2, 1)).toBe('66.7%');
  });
});
