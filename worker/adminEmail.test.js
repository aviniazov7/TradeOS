import { describe, it, expect } from 'vitest';
import { messageToHtml, ctaUrlFor, buildCampaignEmails, chunk, CAMPAIGN_MAX, APP_URL } from './adminEmail';

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

  it('personalises, de-duplicates and drops invalid addresses', () => {
    const out = buildCampaignEmails({
      ...base,
      recipients: [
        { email: 'Dana@Example.com', name: 'דנה' },
        { email: 'dana@example.com', name: 'כפול' },
        { email: 'not-an-email', name: 'x' },
        { email: 'avi@example.com' },
      ],
    }, shell);
    expect(out.map((e) => e.to)).toEqual(['dana@example.com', 'avi@example.com']);
    expect(JSON.parse(out[0].html).intro).toBe('היי דנה,');
    expect(JSON.parse(out[1].html).intro).toBe('היי,');
    expect(JSON.parse(out[0].html).ctaUrl).toBe(`${APP_URL}/journal`);
    expect(out[0].subject).toBe('מתגעגעים');
  });

  it('caps a campaign', () => {
    const many = Array.from({ length: CAMPAIGN_MAX + 50 }, (_, i) => ({ email: `u${i}@x.com` }));
    expect(buildCampaignEmails({ ...base, recipients: many }, shell)).toHaveLength(CAMPAIGN_MAX);
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
