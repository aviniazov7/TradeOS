import { describe, it, expect } from 'vitest';
import { messageToHtml, ctaUrlFor, buildCampaignEmails, chunk, CAMPAIGN_MAX, APP_URL, friendlyResendError, AD_PREFIX, footerHtml } from './adminEmail';

// A stand-in for index.js's emailShell that exposes what it was given.
const shell = (o) => JSON.stringify(o);

describe('messageToHtml', () => {
  it('splits paragraphs, keeps line breaks and escapes HTML', () => {
    const html = messageToHtml('שורה ראשונה\nשורה שנייה\n\n<b>פסקה</b> & עוד');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('שורה ראשונה<br>שורה שנייה');
    expect(html).toContain('&lt;b&gt;פסקה&lt;/b&gt; &amp; עוד');
  });
});

describe('ctaUrlFor', () => {
  it('only links inside the app', () => {
    expect(ctaUrlFor('/journal')).toBe(`${APP_URL}/journal`);
    expect(ctaUrlFor('https://evil.com')).toBe(`${APP_URL}/`);
    expect(ctaUrlFor('//evil.com')).toBe(`${APP_URL}/`);
    expect(ctaUrlFor('/x" onclick="')).toBe(`${APP_URL}/`);
    expect(ctaUrlFor('')).toBe(`${APP_URL}/`);
  });
});

describe('buildCampaignEmails', () => {
  const base = { subject: 'מתגעגעים', headline: 'מזמן לא ראינו אותך', message: 'בוא לבדוק', ctaText: 'כניסה', ctaPath: '/journal' };
  const un = (n) => `https://w.example/email/unsubscribe?u=U${n}&t=abc`;

  it('personalises, de-duplicates and drops invalid addresses', () => {
    const out = buildCampaignEmails({
      ...base,
      recipients: [
        { email: 'Dana@Example.com', name: 'דנה', unsubscribeUrl: un(1) },
        { email: 'dana@example.com', name: 'כפול', unsubscribeUrl: un(2) },
        { email: 'not-an-email', name: 'x', unsubscribeUrl: un(3) },
        { email: 'avi@example.com', unsubscribeUrl: un(4) },
      ],
    }, shell);
    expect(out.map((e) => e.to)).toEqual(['dana@example.com', 'avi@example.com']);
    expect(JSON.parse(out[0].html).intro).toBe('היי דנה,');
    expect(JSON.parse(out[1].html).intro).toBe('היי,');
    expect(JSON.parse(out[0].html).ctaUrl).toBe(`${APP_URL}/journal`);
  });

  it('marks the subject as an advertisement ("פרסומת")', () => {
    const [m] = buildCampaignEmails({ ...base, recipients: [{ email: 'a@x.com', unsubscribeUrl: un(1) }] }, shell);
    expect(m.subject).toBe(`${AD_PREFIX}מתגעגעים`);
    expect(m.subject.startsWith('פרסומת')).toBe(true);
    const long = buildCampaignEmails({ ...base, subject: 'x'.repeat(300), recipients: [{ email: 'a@x.com', unsubscribeUrl: un(1) }] }, shell);
    expect(long[0].subject.length).toBeLessThanOrEqual(150);
    expect(long[0].subject.startsWith(AD_PREFIX)).toBe(true);
  });

  it('puts a visible opt-out link in the body and one-click headers on the message', () => {
    const [m] = buildCampaignEmails({ ...base, recipients: [{ email: 'a@x.com', unsubscribeUrl: un(7) }] }, shell);
    expect(JSON.parse(m.html).body).toContain('להסרה מרשימת התפוצה');
    expect(JSON.parse(m.html).body).toContain(un(7).replace(/&/g, '&amp;'));
    expect(m.headers['List-Unsubscribe']).toBe(`<${un(7)}>`);
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('never sends to a recipient without an opt-out link', () => {
    const out = buildCampaignEmails({
      ...base,
      recipients: [
        { email: 'a@x.com' },
        { email: 'b@x.com', unsubscribeUrl: '' },
        { email: 'c@x.com', unsubscribeUrl: 'javascript:alert(1)' },
        { email: 'd@x.com', unsubscribeUrl: 'http://insecure.example/u' },
        { email: 'ok@x.com', unsubscribeUrl: un(9) },
      ],
    }, shell);
    expect(out.map((e) => e.to)).toEqual(['ok@x.com']);
  });

  it('caps a campaign', () => {
    const many = Array.from({ length: CAMPAIGN_MAX + 50 }, (_, i) => ({ email: `u${i}@x.com`, unsubscribeUrl: un(i) }));
    expect(buildCampaignEmails({ ...base, recipients: many }, shell)).toHaveLength(CAMPAIGN_MAX);
  });
});

describe('footerHtml', () => {
  it('escapes the link', () => {
    expect(footerHtml('https://w.example/u?a=1&b="x"')).toContain('a=1&amp;b=&quot;x&quot;');
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('friendlyResendError', () => {
  it('explains test mode in Hebrew', () => {
    expect(friendlyResendError(422, 'Invalid `to` field. Please use our testing email address instead of domains like `example.com`.'))
      .toMatch(/^חיבור המיילים עדיין במצב בדיקה.* · קוד 422$/);
    expect(friendlyResendError(403, 'You can only send testing emails to your own email address')).toMatch(/במצב בדיקה/);
  });
  it('covers the other common failures', () => {
    expect(friendlyResendError(403, 'The x.com domain is not verified')).toMatch(/לא אומת/);
    expect(friendlyResendError(401, 'API key is invalid')).toMatch(/מפתח/);
    expect(friendlyResendError(429, 'Too many requests')).toMatch(/בעוד דקה/);
    expect(friendlyResendError(500, '')).toBe('שליחת המייל נכשלה · קוד 500');
  });
});
