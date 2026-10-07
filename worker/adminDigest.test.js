import { describe, it, expect } from 'vitest';
import { computeDigest, digestPush, buildDigestEmail } from './adminDigest';
import { emailShell, txt } from './emailTheme';

const NOW = Date.parse('2026-10-06T09:00:00Z');
const D = 86400000;
const iso = (daysAgo) => new Date(NOW - daysAgo * D).toISOString();

const users = [
  { role: 'admin', displayName: 'אדמין', createdAt: iso(300), lastActive: iso(0) },
  { displayName: 'מיכל', createdAt: iso(1), lastActive: iso(0), onboardingCompleted: false },
  { displayName: 'רון', createdAt: iso(3), lastActive: iso(2), onboardingCompleted: true },
  { displayName: 'דנה', createdAt: iso(10), lastActive: iso(20), onboardingCompleted: true },
  { displayName: 'אבי', createdAt: iso(90), lastActive: iso(9), plan: 'premium', planExpires: new Date(NOW + 3 * D).toISOString(), planGrantedAt: iso(2) },
  { displayName: 'שירה', createdAt: iso(60), lastActive: iso(1), plan: 'premium', planExpires: null },
];

describe('computeDigest', () => {
  const d = computeDigest(users, NOW);
  it('counts customers only (admins excluded)', () => {
    expect(d.total).toBe(5);
  });
  it('splits this week from last week', () => {
    expect(d.newWeek).toBe(2);
    expect(d.newPrevWeek).toBe(1);
    expect(d.joined.map((j) => j.name)).toEqual(['מיכל', 'רון']);
  });
  it('finds activity, premium, upgrades and what needs doing', () => {
    expect(d.activeWeek).toBe(3);
    expect(d.premium).toBe(2);
    expect(d.upgrades).toBe(1);
    expect(d.expiring).toEqual([{ name: 'אבי', days: 3 }]);
    expect(d.churn).toEqual(['אבי']);
    expect(d.inactive).toEqual(['דנה']);
    expect(d.notOnboarded).toBe(1);
  });
  it('builds a one-line push', () => {
    expect(digestPush(d)).toBe('2 חדשים · 3 פעילים · 2 Premium · 1 בסיכון');
  });
});

describe('buildDigestEmail', () => {
  it('renders a black report with every section', () => {
    const r = buildDigestEmail(users, { now: NOW, test: true });
    expect(r.subject).toMatch(/^\[בדיקה\] TradeOS · הדוח השבועי · /);
    expect(r.html).toContain('background-image:linear-gradient(#000000,#000000)');
    for (const s of ['חדשים השבוע', 'פעילים השבוע', 'לקוחות Premium', 'בסיכון נטישה', 'דורש טיפול', 'הצטרפו השבוע', 'המנוי של אבי מסתיים בעוד 3 ימים', '+1 משבוע שעבר']) {
      expect(r.html).toContain(s);
    }
  });
  it('says so when the week was quiet', () => {
    const r = buildDigestEmail([{ displayName: 'x', createdAt: iso(100), lastActive: null, onboardingCompleted: true }], { now: NOW });
    expect(r.html).toContain('שבוע שקט');
    expect(r.html).toContain('אין שום דבר דחוף השבוע.');
  });
  it('escapes names', () => {
    const r = buildDigestEmail([{ displayName: '<b>x</b>', createdAt: iso(1), lastActive: iso(0) }], { now: NOW });
    expect(r.html).not.toContain('<b>x</b>');
    expect(r.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('emailShell', () => {
  it('keeps the title text-only and wraps text for Gmail', () => {
    const html = emailShell({ headline: 'שודרגת 👑 ל-Premium', body: '' });
    expect(html).toContain(txt('שודרגת ל-Premium'));
    expect(html).toContain('u + .body .gm-d');
  });
});
