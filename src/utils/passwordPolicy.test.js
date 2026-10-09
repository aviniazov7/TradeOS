import { describe, it, expect } from 'vitest';
import { passwordProblem, PASSWORD_RULES } from './passwordPolicy';

describe('passwordProblem', () => {
  it('rejects what the Firebase default (min 6) would have accepted', () => {
    expect(passwordProblem('123456')).toMatch(/8 תווים/);
    expect(passwordProblem('abcdefgh')).toMatch(/אות גדולה/);
    expect(passwordProblem('ABCDEFGH')).toMatch(/ספרה/);
  });

  it('accepts 8+ chars with an uppercase letter and a digit', () => {
    expect(passwordProblem('Trade2026')).toBeNull();
  });

  it('exposes the checklist rules in order', () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(['len', 'upper', 'digit']);
  });
});
