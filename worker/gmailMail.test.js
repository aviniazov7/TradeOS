import { describe, it, expect, vi } from 'vitest';
import nodemailer from 'nodemailer';
import {
  GMAIL_USER, GMAIL_FROM, GMAIL_DAILY_CAP,
  normalizeAppPassword, gmailTransportOptions, gmailQuotaKey, israelDateStr,
  assertSingleRecipient, friendlyMailError, deliverWithGmail, takeGmailSlot,
  MISSING_SECRET_MESSAGE, DAILY_CAP_MESSAGE,
} from './gmailMail';

function memoryKv() {
  const store = new Map();
  return {
    store,
    get: async (k) => (store.has(k) ? store.get(k) : null),
    put: async (k, v) => { store.set(k, String(v)); },
  };
}

function env(extra = {}) {
  return { GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', ...extra };
}

describe('gmail transport', () => {
  it('uses nodemailer against smtp.gmail.com:465 with the TradeOS mailbox', () => {
    const options = gmailTransportOptions('abcd efgh ijkl mnop');
    expect(options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: 'abcdefghijklmnop' },
      pool: true,
      maxConnections: 1,
    });
    const transport = nodemailer.createTransport(options);
    expect(transport.options.host).toBe('smtp.gmail.com');
    expect(transport.options.port).toBe(465);
    expect(transport.options.secure).toBe(true);
    expect(transport.options.auth.user).toBe('tradeos.app@gmail.com');
    expect(transport.options.auth.pass).toBe('abcdefghijklmnop');
    transport.close();
  });

  it('strips spaces from the app password and never treats an empty secret as set', () => {
    expect(normalizeAppPassword('  ab cd  ')).toBe('abcd');
    expect(normalizeAppPassword('')).toBe('');
    expect(normalizeAppPassword(undefined)).toBe('');
  });
});

describe('assertSingleRecipient', () => {
  it('rejects a list so one message cannot expose other addresses', () => {
    expect(() => assertSingleRecipient(['a@x.com', 'b@x.com'])).toThrow(/multiple/);
    expect(() => assertSingleRecipient('a@x.com, b@x.com')).toThrow(/multiple/);
    expect(() => assertSingleRecipient('not-an-email')).toThrow(/invalid-recipient/);
    expect(assertSingleRecipient(' A@x.com ')).toBe('A@x.com');
  });
});

describe('friendlyMailError', () => {
  it('explains a bad app password, the daily cap, and a bad address in Hebrew', () => {
    const auth = Object.assign(new Error('Invalid login'), { responseCode: 535, response: '535-5.7.8 Username and Password not accepted' });
    expect(friendlyMailError(auth)).toMatch(/סיסמת אפליקציה/);
    expect(friendlyMailError(auth)).toContain('קוד 535');
    const daily = Object.assign(new Error('quota'), { responseCode: 550, response: '550 5.4.5 Daily user sending quota exceeded' });
    expect(friendlyMailError(daily)).toMatch(/מכסת השליחה היומית/);
    const bad = Object.assign(new Error('invalid-recipient'), { responseCode: 422 });
    expect(friendlyMailError(bad)).toMatch(/לא תקינה/);
    expect(friendlyMailError(Object.assign(new Error('nope'), { responseCode: 500 }))).toBe('שליחת המייל נכשלה · קוד 500');
  });
});

describe('deliverWithGmail', () => {
  const dateStr = '2026-06-15';

  function captureTransport(sendMail) {
    const calls = [];
    return {
      calls,
      createTransport(options) {
        calls.options = options;
        return {
          sendMail: async (mail) => {
            calls.push(mail);
            return sendMail ? sendMail(mail, calls) : { messageId: 'm' };
          },
          close: vi.fn(),
        };
      },
    };
  }

  it('sends each recipient in their own message from TradeOS', async () => {
    const cap = captureTransport();
    const kv = memoryKv();
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 'פרסומת: היי', html: '<p>א</p>', headers: { 'List-Unsubscribe': '<https://w.example/u>' } },
      { to: 'b@x.com', subject: 'פרסומת: היי', html: '<p>ב</p>', replyTo: 'admin@x.com' },
    ], { createTransport: cap.createTransport, kv, dateStr, gapMs: 200, sleep: async (ms) => { cap.sleeps = (cap.sleeps || []).concat(ms); } });

    expect(r).toMatchObject({ ok: true, sent: 2, failed: 0, deferred: 0 });
    expect(cap.calls.map((m) => m.to)).toEqual(['a@x.com', 'b@x.com']);
    expect(cap.calls.every((m) => typeof m.to === 'string' && !m.to.includes(','))).toBe(true);
    expect(cap.calls.every((m) => m.from === GMAIL_FROM)).toBe(true);
    expect(cap.calls[0].headers['List-Unsubscribe']).toBe('<https://w.example/u>');
    expect(cap.calls[1].replyTo).toBe('admin@x.com');
    expect(cap.sleeps).toEqual([200]);
    expect(cap.calls.options.auth.pass).toBe('abcdefghijklmnop');
    expect(kv.store.get(gmailQuotaKey(dateStr))).toBe('2');
  });

  it('does not open a socket when the secret is missing', async () => {
    const createTransport = vi.fn();
    const r = await deliverWithGmail({ GMAIL_APP_PASSWORD: '   ' }, [
      { to: 'a@x.com', subject: 's', html: 'h' },
    ], { createTransport });
    expect(createTransport).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, sent: 0, failed: 0, deferred: 1, skipped: 'no-app-password' });
    expect(r.firstError).toBe(MISSING_SECRET_MESSAGE);
  });

  it('stops at the daily cap and counts the rest as not sent', async () => {
    const cap = captureTransport();
    const kv = memoryKv();
    kv.store.set(gmailQuotaKey(dateStr), String(GMAIL_DAILY_CAP - 1));
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
      { to: 'b@x.com', subject: 's', html: 'h' },
      { to: 'c@x.com', subject: 's', html: 'h' },
    ], { createTransport: cap.createTransport, kv, dateStr, gapMs: 0 });
    expect(cap.calls.map((m) => m.to)).toEqual(['a@x.com']);
    expect(r).toMatchObject({ sent: 1, failed: 0, deferred: 2 });
    expect(r.firstError).toBe(DAILY_CAP_MESSAGE);
    expect(kv.store.get(gmailQuotaKey(dateStr))).toBe(String(GMAIL_DAILY_CAP));
  });

  it('returns a failed slot to the daily counter', async () => {
    const kv = memoryKv();
    const createTransport = () => ({
      sendMail: async () => {
        const err = new Error('invalid-recipient');
        err.responseCode = 422;
        throw err;
      },
      close() {},
    });
    const r = await deliverWithGmail(env(), [
      { to: 'bad@x.com', subject: 's', html: 'h' },
    ], { createTransport, kv, dateStr, gapMs: 0 });
    expect(r).toMatchObject({ sent: 0, failed: 1, deferred: 0 });
    expect(kv.store.get(gmailQuotaKey(dateStr))).toBe('0');
  });

  it('retries a temporary Gmail slow-down once, then stops the rest on a daily-limit rejection', async () => {
    const seen = [];
    let n = 0;
    const createTransport = () => ({
      sendMail: async (mail) => {
        seen.push(mail.to);
        n++;
        if (n === 1) {
          const err = new Error('421 4.7.0 try again later');
          err.responseCode = 421;
          err.response = '421 4.7.0 try again later';
          throw err;
        }
        if (mail.to === 'b@x.com') {
          const err = new Error('quota');
          err.responseCode = 550;
          err.response = '550 5.4.5 Daily user sending quota exceeded';
          throw err;
        }
        return { messageId: 'ok' };
      },
      close() {},
    });
    const slept = [];
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
      { to: 'b@x.com', subject: 's', html: 'h' },
      { to: 'c@x.com', subject: 's', html: 'h' },
    ], {
      createTransport, dateStr, gapMs: 0, retryGapMs: 50, kv: memoryKv(),
      sleep: async (ms) => { slept.push(ms); },
    });
    expect(seen).toEqual(['a@x.com', 'a@x.com', 'b@x.com']);
    expect(slept).toEqual([50]);
    expect(r).toMatchObject({ sent: 1, failed: 1, deferred: 1 });
    expect(r.firstError).toMatch(/מכסת השליחה היומית/);
  });

  it('does not keep going after Gmail rejects the password', async () => {
    const seen = [];
    const createTransport = () => ({
      sendMail: async (mail) => {
        seen.push(mail.to);
        const err = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
        err.responseCode = 535;
        throw err;
      },
      close() {},
    });
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
      { to: 'b@x.com', subject: 's', html: 'h' },
    ], { createTransport, dateStr, gapMs: 0, kv: memoryKv() });
    expect(seen).toEqual(['a@x.com']);
    expect(r).toMatchObject({ sent: 0, failed: 1, deferred: 1 });
    expect(r.firstError).toMatch(/דחה את ההתחברות/);
  });

  it('stops when the request budget runs out and does not count that as a failure', async () => {
    let t = 0;
    const seen = [];
    const createTransport = () => ({
      sendMail: async (mail) => { seen.push(mail.to); return {}; },
      close() {},
    });
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
      { to: 'b@x.com', subject: 's', html: 'h' },
      { to: 'c@x.com', subject: 's', html: 'h' },
    ], {
      createTransport, dateStr, gapMs: 100, budgetMs: 50, kv: memoryKv(),
      now: () => t,
      sleep: async (ms) => { t += ms; },
    });
    expect(seen).toEqual(['a@x.com']);
    expect(r).toMatchObject({ sent: 1, failed: 0, deferred: 2 });
    expect(r.firstError).toMatch(/נעצרה באמצע/);
  });
});

describe('takeGmailSlot', () => {
  it('reserves up to the cap for one Israel day', async () => {
    const kv = memoryKv();
    expect(await takeGmailSlot(kv, '2026-06-15', 2)).toBe(true);
    expect(await takeGmailSlot(kv, '2026-06-15', 2)).toBe(true);
    expect(await takeGmailSlot(kv, '2026-06-15', 2)).toBe(false);
    expect(kv.store.get(gmailQuotaKey('2026-06-15'))).toBe('2');
  });

  it('fails closed when there is no KV', async () => {
    expect(await takeGmailSlot(undefined, '2026-06-15')).toBe('error');
  });
});

describe('israelDateStr', () => {
  it('formats the Jerusalem calendar day', () => {
    expect(israelDateStr(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-15');
    expect(israelDateStr(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
  });
});
