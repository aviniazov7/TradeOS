import { describe, it, expect } from 'vitest';
import {
  messageToHtml, ctaUrlFor, buildCampaignEmails, chunk, CAMPAIGN_MAX, APP_URL, AD_PREFIX, footerHtml, campaignPlainText,
} from './adminEmail';

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
    });
    expect(out.map((e) => e.to)).toEqual(['dana@example.com', 'avi@example.com']);
    expect(out[0].html).toContain('היי דנה,');
    expect(out[1].html).toContain('היי,');
    expect(out[0].html).toContain(`${APP_URL}/journal`);
    expect(out[0].text).toContain('היי דנה,');
    expect(out[0].text).toContain('בוא לבדוק');
  });

  it('renders a dark RTL email with a TradeOS header, a button, and a plain-text twin', () => {
    const [m] = buildCampaignEmails({ ...base, recipients: [{ email: 'a@x.com', name: 'דנה', unsubscribeUrl: un(1) }] });
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain('lang="he"');
    expect(m.html).toContain('#070b12');
    expect(m.html).toContain('#2563eb');
    expect(m.html).toContain('TradeOS');
    expect(m.html).toContain('role="presentation"');
    expect(m.html).toContain('מערכת ההפעלה למסחר');
    expect(m.html).toContain('>כניסה<');
    expect(m.html).toContain('u + .body .gm-d');
    expect(m.text).toContain(`${APP_URL}/journal`);
    expect(m.text).not.toContain('<p');
  });

  it('marks the subject as an advertisement ("פרסומת")', () => {
    const [m] = buildCampaignEmails({ ...base, recipients: [{ email: 'a@x.com', unsubscribeUrl: un(1) }] });
    expect(m.subject).toBe(`${AD_PREFIX}מתגעגעים`);
    expect(m.subject.startsWith('פרסומת')).toBe(true);
    const long = buildCampaignEmails({ ...base, subject: 'x'.repeat(300), recipients: [{ email: 'a@x.com', unsubscribeUrl: un(1) }] });
    expect(long[0].subject.length).toBeLessThanOrEqual(150);
    expect(long[0].subject.startsWith(AD_PREFIX)).toBe(true);
  });

  it('puts a visible opt-out link in the body and one-click headers on the message', () => {
    const [m] = buildCampaignEmails({ ...base, recipients: [{ email: 'a@x.com', unsubscribeUrl: un(7) }] });
    expect(m.html).toContain('להסרה מרשימת התפוצה');
    expect(m.html).toContain(un(7).replace(/&/g, '&amp;'));
    expect(m.text).toContain(`להסרה מרשימת התפוצה: ${un(7)}`);
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
    });
    expect(out.map((e) => e.to)).toEqual(['ok@x.com']);
  });

  it('caps a campaign', () => {
    const many = Array.from({ length: CAMPAIGN_MAX + 50 }, (_, i) => ({ email: `u${i}@x.com`, unsubscribeUrl: un(i) }));
    expect(buildCampaignEmails({ ...base, recipients: many })).toHaveLength(CAMPAIGN_MAX);
  });
});

describe('footerHtml', () => {
  it('escapes the link', () => {
    expect(footerHtml('https://w.example/u?a=1&b="x"')).toContain('a=1&amp;b=&quot;x&quot;');
    expect(footerHtml('https://w.example/u')).toContain('להסרה מרשימת התפוצה');
  });
});

describe('campaignPlainText', () => {
  it('includes the greeting, message, button url and unsubscribe url', () => {
    const text = campaignPlainText({
      headline: 'היי 👋', name: 'דנה', message: 'חזרו ליומן', ctaText: 'פתיחה', ctaUrl: 'https://tradeoslive.web.app/journal', unsubscribeUrl: 'https://w.example/u',
    });
    expect(text).toContain('היי דנה,');
    expect(text).toContain('חזרו ליומן');
    expect(text).toContain('פתיחה: https://tradeoslive.web.app/journal');
    expect(text).toContain('להסרה מרשימת התפוצה: https://w.example/u');
    expect(text).not.toContain('👋');
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
