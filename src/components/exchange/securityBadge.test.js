import { describe, expect, it } from 'vitest';
import { securityBadge } from './securityBadge';

describe('securityBadge', () => {
  it('is empty when nothing is connected', () => {
    expect(securityBadge([])).toMatchObject({ value: '—', secure: false });
  });

  it('claims read-only only after every key was verified', () => {
    const badge = securityBadge([
      { authType: undefined, readOnlyVerified: true },
      { authType: 'address', readOnlyVerified: false },
    ]);
    expect(badge).toMatchObject({ value: 'מוגן', sub: 'מפתח לקריאה בלבד', secure: true });
  });

  it('treats a file import (Vantage MT5) as having no key to verify', () => {
    const only = securityBadge([{ authType: 'file', readOnlyVerified: true }]);
    expect(only).toMatchObject({ value: 'מוגן', sub: 'ייבוא מקובץ, בלי מפתח', secure: true });
    const mixed = securityBadge([
      { authType: 'file' },
      { authType: undefined, readOnlyVerified: true },
    ]);
    expect(mixed).toMatchObject({ value: 'מוגן', sub: 'מפתח לקריאה בלבד', secure: true });
  });

  it('does not claim read-only for a legacy or unverified key', () => {
    const legacy = securityBadge([{ authType: undefined, readOnlyVerified: undefined }]);
    const mexc = securityBadge([{ authType: undefined, readOnlyVerified: false }]);
    expect(legacy.secure).toBe(false);
    expect(legacy.value).toBe('חלקי');
    expect(mexc.sub).toBe('קריאה בלבד לא אומתה');
  });
});
