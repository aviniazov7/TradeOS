import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The owner was getting feedback, churn, the weekly digest and coupon
// redemptions as Web Push — the same tray as a fill. Those paths must file
// an adminInbox row instead.
const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

function between(startMark, endMark) {
  const start = SRC.indexOf(startMark);
  const end = SRC.indexOf(endMark, start + startMark.length);
  if (start < 0 || end < 0) throw new Error(`missing slice ${startMark}`);
  return SRC.slice(start, end);
}

describe('admin messages are not trade pushes', () => {
  it('does not push the owner on the contact, churn, digest, or coupon paths', () => {
    expect(SRC).not.toMatch(/sendPushToUser\(\s*env,\s*env\.DEV_UID/);
    expect(SRC).not.toMatch(/sendPushToUser\(\s*env,\s*adminUid/);
    expect(SRC).not.toMatch(/sendPushToUser\(\s*env,\s*coupon\.createdBy/);
    expect(SRC).not.toContain('📨 הודעה חדשה');
    expect(SRC).not.toContain("tag: 'weekly-digest'");
    expect(SRC).not.toContain('coupon-redeem-');
  });

  it('files each of those events in the admin mailbox', () => {
    const contact = between('async function handleContact', '// ==================== HTTP Handler');
    expect(contact).toContain('recordAdminInbox');
    expect(contact).toContain('contactDelivered');
    expect(contact).not.toContain('sendPushToUser');

    const churn = between('async function checkChurnedPremium', '// ---- Email sending');
    expect(churn).toContain("type: 'churn'");
    expect(churn).toContain('recordAdminInbox');
    expect(churn).not.toContain('sendPushToUser');

    const digest = between('async function checkWeeklyDigest', 'async function fetchBybitOpen');
    expect(digest).toContain("type: 'digest'");
    expect(digest).toContain('digestInboxText');
    expect(digest).not.toContain('sendPushToUser');

    const redeem = between("path === '/coupons/redeem'", "path === '/admin/schedule-expiry'");
    expect(redeem).toContain("type: 'coupon'");
    expect(redeem).toContain('recordAdminInbox');
    // The buyer still gets their own confirmation. The owner does not.
    expect(redeem).toContain('sendPushToUser(env, uid,');
    expect(redeem).not.toContain('coupon.createdBy');
  });
});
