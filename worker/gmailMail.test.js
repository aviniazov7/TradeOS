import { describe, it, expect, vi } from 'vitest';
import {
  GMAIL_USER, GMAIL_FROM, GMAIL_DAILY_CAP,
  normalizeAppPassword, gmailTransportOptions, gmailQuotaKey, israelDateStr,
  assertSingleRecipient, friendlyMailError, deliverWithGmail, takeGmailSlot,
  openGmailTransport, MISSING_SECRET_MESSAGE, DAILY_CAP_MESSAGE,
} from './gmailMail';

const { workerMailerConnect } = vi.hoisted(() => ({ workerMailerConnect: vi.fn() }));
vi.mock('worker-mailer', () => ({
  WorkerMailer: { connect: workerMailerConnect },
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
}));

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
  it('uses worker-mailer against smtp.gmail.com:465 with implicit TLS', () => {
    const options = gmailTransportOptions('abcd efgh ijkl mnop');
    expect(options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      startTls: false,
      name: 'tradeos.app',
      credentials: { username: GMAIL_USER, password: 'abcdefghijklmnop' },
      authType: ['plain', 'login'],
    });
    // DEBUG (0) would write the AUTH command, which is the password.
    expect(options.logLevel).toBeGreaterThan(0);
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

  it('reads worker-mailer SMTP text when there is no responseCode', () => {
    const auth = new Error('Failed to plain authentication: 535-5.7.8 Username and Password not accepted');
    expect(friendlyMailError(auth)).toMatch(/סיסמת אפליקציה/);
    expect(friendlyMailError(auth)).toContain('קוד 535');
    const daily = new Error('Invalid MAIL FROM: <tradeos.app@gmail.com> 550 5.4.5 Daily user sending quota exceeded');
    expect(friendlyMailError(daily)).toMatch(/מכסת השליחה היומית/);
    expect(friendlyMailError(daily)).toContain('קוד 550');
    const rcpt = new Error('Invalid RCPT TO: <nope@x.com> 550-5.1.1 The email account that you tried to reach does not exist');
    expect(friendlyMailError(rcpt)).toMatch(/לא תקינה/);
    expect(friendlyMailError(rcpt)).toContain('קוד 550');
    const slow = new Error('Failed to EHLO. 421 4.7.0 try again later');
    expect(friendlyMailError(slow)).toMatch(/להאט/);
    expect(friendlyMailError(slow)).toContain('קוד 421');
  });

  it('keeps a short reason when the socket dies before Gmail replies', () => {
    const err = Object.assign(new Error('proxy request failed, cannot connect to the specified address'), { code: 'ECONNECTION' });
    expect(friendlyMailError(err)).toBe('שליחת המייל נכשלה · ECONNECTION · proxy request failed, cannot connect to the specified address');
    expect(friendlyMailError(new Error('proxy request failed on port 465'))).toBe('שליחת המייל נכשלה · proxy request failed on port 465');
    expect(friendlyMailError(new Error('Socket timeout!'))).toBe('שליחת המייל נכשלה · Socket timeout!');
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
      { to: 'a@x.com', subject: 'פרסומת: היי', html: '<p>א</p>', text: 'א', headers: { 'List-Unsubscribe': '<https://w.example/u>' } },
      { to: 'b@x.com', subject: 'פרסומת: היי', html: '<p>ב</p>', replyTo: 'admin@x.com' },
    ], { createTransport: cap.createTransport, kv, dateStr, gapMs: 200, sleep: async (ms) => { cap.sleeps = (cap.sleeps || []).concat(ms); } });

    expect(r).toMatchObject({ ok: true, sent: 2, failed: 0, deferred: 0 });
    expect(cap.calls.map((m) => m.to)).toEqual(['a@x.com', 'b@x.com']);
    expect(cap.calls.every((m) => typeof m.to === 'string' && !m.to.includes(','))).toBe(true);
    expect(cap.calls.every((m) => m.from === GMAIL_FROM)).toBe(true);
    expect(cap.calls[0].headers['List-Unsubscribe']).toBe('<https://w.example/u>');
    expect(cap.calls[0].text).toBe('א');
    expect(cap.calls[1].text).toBeUndefined();
    expect(cap.calls[1].replyTo).toBe('admin@x.com');
    expect(cap.sleeps).toEqual([200]);
    expect(cap.calls.options.credentials).toEqual({ username: GMAIL_USER, password: 'abcdefghijklmnop' });
    expect(cap.calls.options).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, startTls: false });
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

  it('stops the batch when worker-mailer reports a rejected app password', async () => {
    const seen = [];
    const createTransport = () => ({
      sendMail: async (mail) => {
        seen.push(mail.to);
        throw new Error('Failed to plain authentication: 535-5.7.8 Username and Password not accepted');
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
    expect(r.firstError).toContain('קוד 535');
  });

  it('retries once when worker-mailer only has the SMTP text for a slow-down', async () => {
    let n = 0;
    const createTransport = () => ({
      sendMail: async () => {
        n++;
        if (n === 1) throw new Error('421 4.7.0 try again later');
        return {};
      },
      close() {},
    });
    const slept = [];
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
    ], { createTransport, dateStr, gapMs: 0, retryGapMs: 50, kv: memoryKv(), sleep: async (ms) => { slept.push(ms); } });
    expect(n).toBe(2);
    expect(slept).toEqual([50]);
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 0 });
  });

  it('logs message and code without the app password when the connection fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Socket timeout! abcdefghijklmnop');
    err.code = 'ETIMEDOUT';
    const createTransport = () => { throw err; };
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: 'h' },
    ], { createTransport, dateStr, gapMs: 0, kv: memoryKv() });
    expect(r).toMatchObject({ ok: false, sent: 0, failed: 1, deferred: 0 });
    expect(r.firstError).toBe('שליחת המייל נכשלה · ETIMEDOUT · Socket timeout! [redacted]');
    expect(r.firstError).not.toContain('abcdefghijklmnop');
    const flat = spy.mock.calls.map((call) => call.map((part) => String(part)).join(' ')).join('\n');
    expect(flat).toContain('gmail delivery failed');
    expect(flat).toContain('Socket timeout!');
    expect(flat).toContain('ETIMEDOUT');
    expect(flat).not.toContain('abcdefghijklmnop');
    expect(flat).not.toContain('abcd efgh');
    spy.mockRestore();
  });

  it('opens worker-mailer and forwards html, text, reply-to, and List-Unsubscribe', async () => {
    workerMailerConnect.mockReset();
    const send = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    workerMailerConnect.mockResolvedValue({ send, close });
    const r = await deliverWithGmail(env(), [
      {
        to: 'a@x.com',
        subject: 'שלום',
        html: '<p>א</p>',
        text: 'א',
        replyTo: 'admin@x.com',
        headers: { 'List-Unsubscribe': '<https://w.example/u>' },
      },
    ], { kv: memoryKv(), dateStr, gapMs: 0 });
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 0 });
    expect(workerMailerConnect).toHaveBeenCalledTimes(1);
    expect(workerMailerConnect.mock.calls[0][0]).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      startTls: false,
      credentials: { username: GMAIL_USER, password: 'abcdefghijklmnop' },
      authType: ['plain', 'login'],
    });
    expect(send).toHaveBeenCalledWith({
      from: { name: 'TradeOS', email: GMAIL_USER },
      to: 'a@x.com',
      subject: 'שלום',
      html: '<p>א</p>',
      text: 'א',
      reply: 'admin@x.com',
      headers: { 'List-Unsubscribe': '<https://w.example/u>' },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('maps a mocked worker-mailer session onto one recipient per message', async () => {
    const sent = [];
    const close = vi.fn(async () => {});
    const connect = vi.fn(async () => ({
      send: async (message) => { sent.push(message); },
      close,
    }));
    const r = await deliverWithGmail(env(), [
      { to: 'a@x.com', subject: 's', html: '<p>a</p>', text: 'a', headers: { 'List-Unsubscribe': '<https://w.example/u>' } },
      { to: 'b@x.com', subject: 's', html: '<p>b</p>' },
    ], {
      createTransport: (options) => openGmailTransport(options, { connect }),
      kv: memoryKv(),
      dateStr,
      gapMs: 0,
    });
    expect(r).toMatchObject({ ok: true, sent: 2, failed: 0 });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sent.map((message) => message.to)).toEqual(['a@x.com', 'b@x.com']);
    expect(sent[0].headers['List-Unsubscribe']).toBe('<https://w.example/u>');
    expect(sent[0].text).toBe('a');
    expect(sent[1].text).toBeUndefined();
    expect(sent.map((message) => message.from)).toEqual([
      { name: 'TradeOS', email: GMAIL_USER },
      { name: 'TradeOS', email: GMAIL_USER },
    ]);
    expect(close).toHaveBeenCalledTimes(1);
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
