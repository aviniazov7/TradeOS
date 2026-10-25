// Transactional email via Gmail SMTP (nodemailer).
//
// The Worker used to call Resend, which is stuck in test mode and rejects
// every recipient except the account owner (HTTP 422 until a domain is
// verified). This module is the only send path for user-facing mail: the
// admin reminder, Premium receipts, coupon mail, the contact form, and the
// weekly digest. Push notifications do not come through here.
//
// The app password is a Worker secret (GMAIL_APP_PASSWORD). Nothing in this
// file is a password — the From address is the mailbox that secret logs into.
import nodemailer from 'nodemailer';

export const GMAIL_USER = 'tradeos.app@gmail.com';
export const GMAIL_FROM = `TradeOS <${GMAIL_USER}>`;
// Gmail consumer accounts cap at about 500 recipients/day. Stay under that
// so a campaign can't lock the mailbox, and so a receipt later the same day
// still has room.
export const GMAIL_DAILY_CAP = 450;
// One connection, one recipient at a time, with a short pause. Parallel
// SMTP sessions are what gets a Gmail account temporarily blocked.
export const GMAIL_GAP_MS = 200;
export const GMAIL_RETRY_GAP_MS = 2000;
// Wall-clock budget for one HTTP request. Past this we stop and report who
// was not attempted, instead of letting the admin's request hang.
export const GMAIL_BUDGET_MS = 90_000;
const QUOTA_TTL_SECONDS = 60 * 60 * 48;

export const MISSING_SECRET_MESSAGE = 'GMAIL_APP_PASSWORD חסר ב-Worker — לא ניתן לשלוח מיילים';
export const DAILY_CAP_MESSAGE = 'הגעת למכסת המיילים היומית של Gmail (כ-500 ביום). מי שלא נשלח לא קיבל מייל — אפשר לנסות שוב מחר';
export const DEADLINE_MESSAGE = 'השליחה נעצרה באמצע כדי להספיק להחזיר תשובה. מי שלא נשלח לא קיבל מייל; שליחה נוספת תגיע שוב גם למי שכבר קיבל';
export const QUOTA_CHECK_MESSAGE = 'לא הצלחנו לבדוק את מכסת Gmail, אז לא נשלח מייל';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google shows the app password in groups of four. Accept either form.
export function normalizeAppPassword(raw) {
  return String(raw ?? '').replace(/\s+/g, '');
}

export function hasGmailPassword(env) {
  return normalizeAppPassword(env?.GMAIL_APP_PASSWORD).length > 0;
}

export function gmailQuotaKey(dateStr) {
  return `gmail:sent:${dateStr}`;
}

// Same Israel calendar day the rest of the Worker uses for "today".
export function israelDateStr(now = new Date()) {
  const n = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function gmailTransportOptions(appPassword) {
  return {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    name: 'tradeos.app',
    auth: {
      user: GMAIL_USER,
      pass: normalizeAppPassword(appPassword),
    },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

function errText(err) {
  return `${err?.message || ''} ${err?.response || ''}`.toLowerCase();
}

export function isAuthError(err) {
  const code = Number(err?.responseCode || 0);
  return code === 530 || code === 534 || code === 535
    || /invalid login|username and password|badcredentials|application-specific password|5\.7\.8/.test(errText(err));
}

export function isDailyLimitError(err) {
  return /daily user sending|sending quota|5\.4\.5|quota exceeded/.test(errText(err));
}

// A temporary "slow down", not the daily cap and not a bad password.
export function isTransientRateLimit(err) {
  if (isDailyLimitError(err) || isAuthError(err)) return false;
  const code = Number(err?.responseCode || 0);
  return code === 421 || code === 450 || code === 451 || code === 452
    || /try again later|too many|rate limit|4\.7\.0/.test(errText(err));
}

// One Hebrew sentence for the admin toast. The raw SMTP text stays in the
// Worker logs (without the password); it is not shown in the UI.
export function friendlyMailError(err) {
  const status = Number(err?.responseCode || err?.status || 0);
  const text = (() => {
    if (err?.skipped === 'no-app-password' || /missing-app-password|gmail_app_password/.test(errText(err))) {
      return 'סיסמת האפליקציה של Gmail חסרה בשרת';
    }
    if (isAuthError(err)) return 'Gmail דחה את ההתחברות. צריך סיסמת אפליקציה תקינה ל-tradeos.app@gmail.com';
    if (isDailyLimitError(err)) return 'הגעת למכסת השליחה היומית של Gmail (כ-500 מיילים ביום)';
    if (isTransientRateLimit(err)) return 'Gmail ביקש להאט את השליחה — נסה שוב בעוד כמה דקות';
    if (/refusing-multiple-recipients/.test(errText(err))) return 'נמסר יותר מנמען אחד באותו מייל — השליחה בוטלה';
    if (status === 422 || /invalid-recipient|invalid address|recipient address rejected|5\.1\.1|5\.1\.3/.test(errText(err))) {
      return 'כתובת המייל של הנמען לא תקינה';
    }
    return 'שליחת המייל נכשלה';
  })();
  return status ? `${text} · קוד ${status}` : text;
}

// A message is one person. An array or a comma-separated list is refused so
// nobody can see another recipient.
export function assertSingleRecipient(to) {
  if (Array.isArray(to) || (typeof to === 'string' && to.includes(','))) {
    const err = new Error('refusing-multiple-recipients');
    err.responseCode = 400;
    throw err;
  }
  const recipient = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    const err = new Error('invalid-recipient');
    err.responseCode = 422;
    throw err;
  }
  return recipient;
}

export async function sendOneMessage(transport, { to, subject, html, text, replyTo, headers, from = GMAIL_FROM }) {
  const recipient = assertSingleRecipient(to);
  const mail = {
    from,
    to: recipient,
    subject: String(subject || ''),
    html: String(html || ''),
  };
  // Plain-text alternative. Nodemailer sends it as multipart/alternative so
  // clients that prefer text (and screen readers) don't get a blank body.
  if (text) mail.text = String(text);
  if (replyTo) mail.replyTo = String(replyTo);
  if (headers && typeof headers === 'object') mail.headers = headers;
  return transport.sendMail(mail);
}

async function sendOneWithRetry(transport, message, { sleepFn, retryGapMs }) {
  try {
    return await sendOneMessage(transport, message);
  } catch (err) {
    if (!isTransientRateLimit(err)) throw err;
    await sleepFn(retryGapMs);
    return sendOneMessage(transport, message);
  }
}

function readCount(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

// true = a slot was reserved. false = the daily cap is full.
// 'error' = KV could not be read; the caller must not send.
export async function takeGmailSlot(kv, dateStr, cap = GMAIL_DAILY_CAP) {
  if (!kv?.get || !kv?.put) return 'error';
  const key = gmailQuotaKey(dateStr);
  try {
    const used = readCount(await kv.get(key));
    if (!Number.isFinite(used) || used >= cap) return false;
    await kv.put(key, String(used + 1), { expirationTtl: QUOTA_TTL_SECONDS });
    return true;
  } catch {
    console.error('gmail quota read failed');
    return 'error';
  }
}

export async function releaseGmailSlot(kv, dateStr) {
  if (!kv?.get || !kv?.put) return;
  const key = gmailQuotaKey(dateStr);
  try {
    const used = readCount(await kv.get(key));
    const next = Number.isFinite(used) ? Math.max(0, used - 1) : 0;
    await kv.put(key, String(next), { expirationTtl: QUOTA_TTL_SECONDS });
  } catch {
    // Leaving the counter high means we send less, not more.
  }
}

// messages: [{ to, subject, html, replyTo?, headers? }]
// Each entry is one SMTP transaction. Counts are per recipient.
export async function sendIndividually(messages, {
  transport,
  gapMs = GMAIL_GAP_MS,
  retryGapMs = GMAIL_RETRY_GAP_MS,
  sleepFn = sleep,
  takeSlot = async () => true,
  releaseSlot = async () => {},
  now = () => Date.now(),
  budgetMs = GMAIL_BUDGET_MS,
  from = GMAIL_FROM,
} = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const deadline = now() + budgetMs;
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let firstError = '';
  let gap = gapMs;
  const results = [];
  const note = (text) => { if (!firstError && text) firstError = text; };

  for (let i = 0; i < list.length; i++) {
    if (now() >= deadline) {
      deferred += list.length - i;
      note(DEADLINE_MESSAGE);
      break;
    }
    const slot = await takeSlot();
    if (slot !== true) {
      deferred += list.length - i;
      note(slot === 'error' ? QUOTA_CHECK_MESSAGE : DAILY_CAP_MESSAGE);
      break;
    }
    if (i > 0 && gap > 0) await sleepFn(gap);
    if (now() >= deadline) {
      await releaseSlot();
      deferred += list.length - i;
      note(DEADLINE_MESSAGE);
      break;
    }
    try {
      await sendOneWithRetry(transport, { ...list[i], from }, { sleepFn, retryGapMs });
      sent++;
      results.push({ to: list[i].to, ok: true });
    } catch (err) {
      await releaseSlot();
      failed++;
      const friendly = friendlyMailError(err);
      note(friendly);
      results.push({ to: list[i].to, ok: false, error: friendly });
      console.error('gmail send failed', err?.responseCode || '');
      if (isAuthError(err) || isDailyLimitError(err)) {
        deferred += list.length - i - 1;
        break;
      }
      if (isTransientRateLimit(err)) gap = Math.min(gap * 2, 4000);
    }
  }
  return { sent, failed, deferred, firstError, results };
}

export async function deliverWithGmail(env, messages, opts = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const pass = normalizeAppPassword(env?.GMAIL_APP_PASSWORD);
  if (!pass) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      deferred: list.length,
      firstError: MISSING_SECRET_MESSAGE,
      skipped: 'no-app-password',
      results: [],
    };
  }
  const kv = opts.kv ?? env?.ALERTS_KV;
  const dateStr = opts.dateStr || israelDateStr();
  const cap = opts.cap ?? GMAIL_DAILY_CAP;
  const create = opts.createTransport || nodemailer.createTransport;
  let transport;
  try {
    transport = create(gmailTransportOptions(pass));
    const result = await sendIndividually(list, {
      transport,
      gapMs: opts.gapMs,
      retryGapMs: opts.retryGapMs,
      sleepFn: opts.sleep,
      now: opts.now,
      budgetMs: opts.budgetMs,
      takeSlot: () => takeGmailSlot(kv, dateStr, cap),
      releaseSlot: () => releaseGmailSlot(kv, dateStr),
    });
    const ok = result.sent === list.length && result.failed === 0 && result.deferred === 0 && list.length > 0;
    return { ok, skipped: undefined, ...result };
  } catch (e) {
    console.error('gmail delivery failed', e?.responseCode || '');
    return {
      ok: false,
      sent: 0,
      failed: list.length,
      deferred: 0,
      firstError: friendlyMailError(e),
      results: [],
    };
  } finally {
    try { await transport?.close?.(); } catch { /* socket already gone */ }
  }
}
