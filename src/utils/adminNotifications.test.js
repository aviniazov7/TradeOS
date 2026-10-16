import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  normalizeSettings,
  detectActivity,
  planUser,
  planScan,
  isPremiumActive,
  tradeActivityMs,
} from '../../functions/adminNotifications.mjs';

const NOW = Date.parse('2026-06-15T12:00:00Z');

function user(overrides = {}) {
  return {
    uid: 'u1',
    role: 'user',
    plan: 'free',
    planExpires: null,
    createdAt: NOW - 40 * DAY_MS,
    lastActive: NOW - 10 * DAY_MS,
    lastTradeAt: NOW - 12 * DAY_MS,
    displayName: 'דנה כהן',
    email: 'dana@example.com',
    ...overrides,
  };
}

const typesOf = (result) => result.notifications.map((n) => n.type);

describe('normalizeSettings', () => {
  it('defaults to everything on, churn 7 days, inactive 30 days', () => {
    const s = normalizeSettings(null);
    expect(s.enabled).toBe(true);
    expect(s.types.churn_risk).toBe(true);
    expect(s.types.inactive_user).toBe(true);
    expect(s.thresholds).toEqual({ churnDays: 7, inactiveDays: 30 });
  });

  it('keeps inactive longer than churn when the admin inverts them', () => {
    expect(normalizeSettings({ thresholds: { churnDays: 14, inactiveDays: 14 } }).thresholds)
      .toEqual({ churnDays: 14, inactiveDays: 15 });
  });

  it('preserves a toggle for a type this build does not know yet', () => {
    const s = normalizeSettings({ types: { churn_risk: false, future_type: true } });
    expect(s.types.churn_risk).toBe(false);
    expect(s.types.future_type).toBe(true);
    expect(s.types.signup).toBe(true);
  });
});

describe('detectActivity — churn vs inactive', () => {
  it('flags an engaged user who has been quiet for the churn window', () => {
    const det = detectActivity(user(), null, NOW);
    expect(det.churn).toBe(true);
    expect(det.inactive).toBe(false);
    expect(det.silentActivityDays).toBe(10);
  });

  it('does not flag churn one second before the threshold', () => {
    const almost = NOW - 7 * DAY_MS + 1000;
    const det = detectActivity(user({ lastActive: almost, lastTradeAt: almost }), null, NOW);
    expect(det.churn).toBe(false);
  });

  it('flags churn on the exact threshold day', () => {
    const exact = NOW - 7 * DAY_MS;
    const det = detectActivity(user({ lastActive: exact, lastTradeAt: exact }), null, NOW);
    expect(det.churn).toBe(true);
    expect(det.silentActivityDays).toBe(7);
  });

  it('treats a recent trade as activity even if the last login is old', () => {
    const det = detectActivity(user({
      lastActive: NOW - 20 * DAY_MS,
      lastTradeAt: NOW - 2 * DAY_MS,
    }), null, NOW);
    expect(det.churn).toBe(false);
    expect(det.inactive).toBe(false);
  });

  it('does not call a same-day signup churn — they were never engaged', () => {
    const created = NOW - 10 * DAY_MS;
    const det = detectActivity(user({
      createdAt: created,
      lastActive: created + 60 * 60 * 1000,
      lastTradeAt: null,
    }), null, NOW);
    expect(det.churn).toBe(false);
    expect(det.inactive).toBe(false);
  });

  it('does call a next-day return churn once they go quiet', () => {
    const created = NOW - 10 * DAY_MS;
    const det = detectActivity(user({
      createdAt: created,
      lastActive: created + DAY_MS,
      lastTradeAt: null,
    }), null, NOW);
    expect(det.churn).toBe(true);
  });

  it('uses only the inactive alert once the longer silence is reached', () => {
    const det = detectActivity(user({
      lastActive: NOW - 40 * DAY_MS,
      lastTradeAt: NOW - 40 * DAY_MS,
    }), null, NOW);
    expect(det.churn).toBe(false);
    expect(det.inactive).toBe(true);
    expect(det.silentLoginDays).toBe(40);
  });

  it('flags someone who signed up and never logged in after inactiveDays', () => {
    const det = detectActivity(user({
      lastActive: null,
      lastTradeAt: null,
      createdAt: NOW - 30 * DAY_MS,
    }), null, NOW);
    expect(det.inactive).toBe(true);
    expect(det.churn).toBe(false);
  });

  it('honours a shorter inactive threshold', () => {
    const det = detectActivity(user({
      lastActive: null,
      lastTradeAt: null,
      createdAt: NOW - 14 * DAY_MS,
    }), { thresholds: { inactiveDays: 14, churnDays: 7 } }, NOW);
    expect(det.inactive).toBe(true);
  });

  it('does not flag an admin', () => {
    const det = detectActivity(user({ role: 'admin', plan: 'premium' }), null, NOW);
    expect(det).toMatchObject({ churn: false, inactive: false });
  });
});

describe('planUser — dedupe until the condition changes', () => {
  const quiet = () => user();

  it('creates one churn notification and does not repeat it while they stay quiet', () => {
    const first = planUser(quiet(), {}, null, NOW, 'scan');
    expect(typesOf(first)).toEqual(['churn_risk']);
    expect(first.notifications[0].id).toBe('churn_risk_u1_1');
    expect(first.notifications[0].body).toContain('10 ימים');
    expect(first.state.churnOpen).toBe(true);

    const second = planUser(quiet(), first.state, null, NOW, 'scan');
    expect(second.notifications).toEqual([]);
    expect(second.state.churnOpen).toBe(true);
  });

  it('closes the episode when they come back, then notifies again on the next drop', () => {
    const open = planUser(quiet(), {}, null, NOW, 'scan');
    const back = planUser(user({ lastActive: NOW, lastTradeAt: NOW }), open.state, null, NOW, 'update');
    expect(back.notifications).toEqual([]);
    expect(back.state.churnOpen).toBe(false);
    expect(back.state.churnEpisode).toBe(2);

    const again = planUser(quiet(), back.state, null, NOW, 'scan');
    expect(again.notifications.map((n) => n.id)).toEqual(['churn_risk_u1_2']);
    expect(again.state.churnOpen).toBe(true);
  });

  it('switches an open churn episode to inactive without a second churn alert', () => {
    const open = planUser(quiet(), {}, null, NOW, 'scan');
    const later = planUser(user({
      lastActive: NOW - 40 * DAY_MS,
      lastTradeAt: NOW - 40 * DAY_MS,
    }), open.state, null, NOW, 'scan');
    expect(typesOf(later)).toEqual(['inactive_user']);
    expect(later.state.churnOpen).toBe(false);
    expect(later.state.inactiveOpen).toBe(true);
  });

  it('does not generate churn while the type is off, and does once it is on', () => {
    const off = planUser(quiet(), {}, { types: { churn_risk: false } }, NOW, 'scan');
    expect(typesOf(off)).not.toContain('churn_risk');
    expect(off.state.churnOpen).toBe(false);

    const on = planUser(quiet(), off.state, null, NOW, 'scan');
    expect(typesOf(on)).toEqual(['churn_risk']);
  });

  it('does not generate anything while the global switch is off, and does not consume churn', () => {
    const off = planUser(quiet(), {}, { enabled: false }, NOW, 'scan');
    expect(off.notifications).toEqual([]);
    expect(off.state.churnOpen).toBe(false);
    expect(off.state.signupSeen).toBe(true);
  });

  it('still closes an open episode while notifications are off, so a return is not lost', () => {
    const open = planUser(quiet(), {}, null, NOW, 'scan');
    const back = planUser(
      user({ lastActive: NOW, lastTradeAt: NOW }),
      open.state,
      { enabled: false },
      NOW,
      'update',
    );
    expect(back.notifications).toEqual([]);
    expect(back.state.churnOpen).toBe(false);
    expect(back.state.churnEpisode).toBe(2);
  });
});

describe('planUser — signup and premium', () => {
  it('announces a create, once', () => {
    const newbie = user({ createdAt: NOW, lastActive: NOW, lastTradeAt: null, plan: 'free' });
    const created = planUser(newbie, {}, null, NOW, 'create');
    expect(typesOf(created)).toEqual(['signup']);
    expect(created.state.signupSeen).toBe(true);
    expect(planUser(newbie, created.state, null, NOW, 'create').notifications).toEqual([]);
  });

  it('announces a recent signup on the scan, and skips accounts older than the lookback', () => {
    const recent = user({
      createdAt: NOW - DAY_MS,
      lastActive: NOW - DAY_MS,
      lastTradeAt: null,
    });
    expect(typesOf(planUser(recent, {}, null, NOW, 'scan'))).toEqual(['signup']);

    const old = user({ lastActive: NOW, lastTradeAt: null });
    const scanned = planUser(old, {}, null, NOW, 'scan');
    expect(typesOf(scanned)).not.toContain('signup');
    expect(scanned.state.signupSeen).toBe(true);
  });

  it('records a signup that happened while the type was off and does not surface it later', () => {
    const newbie = user({ createdAt: NOW, lastActive: NOW, lastTradeAt: null });
    const skipped = planUser(newbie, {}, { types: { signup: false } }, NOW, 'create');
    expect(typesOf(skipped)).not.toContain('signup');
    expect(skipped.state.signupSeen).toBe(true);
    expect(typesOf(planUser(newbie, skipped.state, null, NOW, 'scan'))).not.toContain('signup');
  });

  it('baselines an existing subscriber without an upgrade, then notifies the next change', () => {
    const premium = user({ plan: 'premium', planExpires: NOW + 10 * DAY_MS, lastActive: NOW, lastTradeAt: NOW });
    expect(isPremiumActive(premium, NOW)).toBe(true);
    const base = planUser(premium, {}, null, NOW, 'scan');
    expect(base.notifications).toEqual([]);
    expect(base.state.premiumActive).toBe(true);

    const again = planUser(premium, base.state, null, NOW, 'scan');
    expect(again.notifications).toEqual([]);

    const expired = planUser(
      { ...premium, planExpires: NOW - DAY_MS },
      base.state,
      null,
      NOW,
      'scan',
    );
    expect(typesOf(expired)).toEqual(['premium_cancel']);
    expect(expired.notifications[0].id).toBe('premium_cancel_u1_1');
  });

  it('notifies an upgrade and a cancel, once each, including a lifetime grant', () => {
    const free = user({ plan: 'free', lastActive: NOW, lastTradeAt: NOW });
    const base = planUser(free, {}, null, NOW, 'scan');
    const up = planUser({ ...free, plan: 'premium', planExpires: null }, base.state, null, NOW, 'update');
    expect(up.notifications.map((n) => n.id)).toEqual(['premium_upgrade_u1_1']);

    const still = planUser({ ...free, plan: 'premium', planExpires: null }, up.state, null, NOW, 'update');
    expect(still.notifications).toEqual([]);

    const down = planUser(free, up.state, null, NOW, 'update');
    expect(down.notifications.map((n) => n.id)).toEqual(['premium_cancel_u1_2']);
  });

  it('does not backfill an upgrade that happened while the type was off', () => {
    const free = user({ plan: 'free', lastActive: NOW, lastTradeAt: NOW });
    const base = planUser(free, {}, null, NOW, 'scan');
    const hidden = planUser(
      { ...free, plan: 'premium', planExpires: null },
      base.state,
      { types: { premium_upgrade: false } },
      NOW,
      'update',
    );
    expect(hidden.notifications).toEqual([]);
    expect(hidden.state.premiumActive).toBe(true);
    const later = planUser({ ...free, plan: 'premium', planExpires: null }, hidden.state, null, NOW, 'scan');
    expect(later.notifications).toEqual([]);
  });

  it('treats a profile created already-premium as an upgrade', () => {
    const newbie = user({
      createdAt: NOW,
      lastActive: NOW,
      lastTradeAt: null,
      plan: 'premium',
      planExpires: null,
    });
    expect(typesOf(planUser(newbie, {}, null, NOW, 'create'))).toEqual(['signup', 'premium_upgrade']);
  });

  it('scans a mix of users independently', () => {
    const quiet = user({ uid: 'quiet' });
    const fresh = user({ uid: 'fresh', createdAt: NOW, lastActive: NOW, lastTradeAt: null });
    const results = planScan([quiet, fresh], {}, null, NOW);
    expect(results.find((r) => r.uid === 'quiet').notifications.map((n) => n.type)).toEqual(['churn_risk']);
    expect(results.find((r) => r.uid === 'fresh').notifications.map((n) => n.type)).toEqual(['signup']);
  });
});

describe('tradeActivityMs', () => {
  it('uses the latest of the trade dates', () => {
    expect(tradeActivityMs({
      entryDate: NOW - 5 * DAY_MS,
      exitDate: NOW - DAY_MS,
      createdAt: NOW - 5 * DAY_MS,
    })).toBe(NOW - DAY_MS);
  });

  it('reads a Firestore-like timestamp', () => {
    expect(tradeActivityMs({ entryDate: { seconds: Math.floor(NOW / 1000) } })).toBe(Math.floor(NOW / 1000) * 1000);
  });
});
