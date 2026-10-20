import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, authActionCodeSettings } from './appOrigin';
import { APP_URL } from '../../worker/emailTheme.js';

describe('app origin', () => {
  it('is the new Hosting site, shared with the worker and auth continue URL', () => {
    expect(APP_ORIGIN).toBe('https://tradeos-app.web.app');
    expect(APP_URL).toBe(APP_ORIGIN);
    expect(authActionCodeSettings).toEqual({
      url: 'https://tradeos-app.web.app/',
      handleCodeInApp: false,
    });
  });
});
