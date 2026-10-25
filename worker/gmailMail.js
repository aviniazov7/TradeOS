// Transactional email via Gmail SMTP (worker-mailer).
//
// The Worker used to call Resend, then nodemailer. Nodemailer's SMTP stack
// needs node:net / node:tls, which dies inside Workers before Gmail answers —
// the admin toast then showed only "שליחת המייל נכשלה" with no SMTP code.
// worker-mailer opens the socket with cloudflare:sockets instead.
//
// This module is the only send path for user-facing mail: the admin
// reminder, Premium receipts, coupon mail, the contact form, and the weekly
// digest. Push notifications do not come through here.
//
// The app password is a Worker secret (GMAIL_APP_PASSWORD). Nothing logged
// from this file includes that secret — the From address is the mailbox it
// logs into.
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
// worker-mailer LogLevel.ERROR. DEBUG (0) writes every SMTP line, including
// AUTH PLAIN, which is the app password in base64.
const WORKER_MAILER_LOG_ERROR = 3;

export const MISSING_SECRET_MESSAGE = 'GMAIL_APP_PASSWORD חסר ב-Worker — לא ניתן לשלוח מיילים';
export const DAILY_CAP_MESSAGE = 'הגעת למכסת המיילים היומית של Gmail (כ-500 ביום). מי שלא נשלח לא קיבל מייל — אפשר לנסות שוב מחר';
export const DEADLINE_MESSAGE = 'השליחה נעצרה באמצע כדי להספיק להחזיר תשובה. מי שלא נשלח לא קיבל מייל; שליחה נוספת תגיע שוב גם למי שכבר קיבל';
export const QUOTA_CHECK_MESSAGE = 'לא הצלחנו לבדוק את מכסת Gmail, אז לא נשלח מייל';
const GENERIC_FAILURE = 'שליחת המייל נכשלה';

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

// Port 465 is implicit TLS (secure from the first byte). Port 587 is the
// other documented pairing: secure false + STARTTLS. startTls stays false
// here so a later edit can't leave the default (true) on the TLS port.
export function gmailTransportOptions(appPassword) {
  return {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    startTls: false,
    name: 'tradeos.app',
    credentials: {
      username: GMAIL_USER,
      password: normalizeAppPassword(appPassword),
    },
    authType: ['plain', 'login'],
    logLevel: WORKER_MAILER_LOG_ERROR,
    socketTimeoutMs: 15_000,
    responseTimeoutMs: 30_000,
  };
}

function errText(err) {
  return `${err?.message || ''} ${err?.response || ''}`.toLowerCase();
}

// nodemailer set responseCode. worker-mailer puts the SMTP reply in the
// message ("Failed to plain authentication: 535-5.7.8 …"). Prefer an
// explicit code, then a reply that looks like Gmail's (hyphen or 5.7.8),
// then a code introduced by a colon. A bare "465" in "port 465" is not one.
function smtpReplyCode(err) {
  const explicit = Number(err?.responseCode || err?.status || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${err?.message || ''}\n${err?.response || ''}`;
  const replies = [...text.matchAll(/(?:^|[\s:])([245]\d{2})(?=(-)|(\s\d\.\d\.\d)|[\s]|$)/g)];
  const shaped = replies.filter((match) => match[2] || match[3]);
  if (shaped.length) return Number(shaped[shaped.length - 1][1]);
  const introduced = [...text.matchAll(/:\s*([245]\d{2})(?=[\s-]|$)/g)];
  if (introduced.length) return Number(introduced[introduced.length - 1][1]);
  return 0;
}

export function isAuthError(err) {
  const code = smtpReplyCode(err);
  if (code === 530 || code === 534 || code === 535 || err?.code === 'EAUTH') return true;
  return /invalid login|username and password|badcredentials|application-specific password|5\.7\.8|failed to (?:plain|login|cram-md5) authentication|no supported auth method|requires authentication/.test(errText(err));
}

export function isDailyLimitError(err) {
  return /daily user sending|sending quota|5\.4\.5|quota exceeded/.test(errText(err));
}

// A temporary "slow down", not the daily cap and not a bad password.
export function isTransientRateLimit(err) {
  if (isDailyLimitError(err) || isAuthError(err)) return false;
  const code = smtpReplyCode(err);
  return code === 421 || code === 450 || code === 451 || code === 452
    || /try again later|too many|rate limit|4\.7\.0/.test(errText(err));
}

// Connection failures have no SMTP reply. Keep a short, password-free
// reason so the next toast says what actually broke.
function fallbackDetail(err) {
  const rawCode = err?.code;
  const code = rawCode != null && String(rawCode).trim() && !/^\d+$/.test(String(rawCode).trim())
    ? String(rawCode).trim()
    : '';
  const line = String(err?.message || '').split(/\r?\n/).map((part) => part.trim()).find(Boolean) || '';
  const safe = line.replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '[redacted]').slice(0, 80);
  return [code, safe].filter(Boolean).join(' · ');
}

// One Hebrew sentence for the admin toast. The raw SMTP text stays in the
// Worker logs (without the password); it is not shown in the UI.
export function friendlyMailError(err) {
  const status = smtpReplyCode(err);
  const text = (() => {
    if (err?.skipped === 'no-app-password' || /missing-app-password|gmail_app_password/.test(errText(err))) {
      return 'סיסמת האפליקציה של Gmail חסרה בשרת';
    }
    if (isAuthError(err)) return 'Gmail דחה את ההתחברות. צריך סיסמת אפליקציה תקינה ל-tradeos.app@gmail.com';
    if (isDailyLimitError(err)) return 'הגעת למכסת השליחה היומית של Gmail (כ-500 מיילים ביום)';
    if (isTransientRateLimit(err)) return 'Gmail ביקש להאט את השליחה — נסה שוב בעוד כמה דקות';
    if (/refusing-multiple-recipients/.test(errText(err))) return 'נמסר יותר מנמען אחד באותו מייל — השליחה בוטלה';
    if (status === 422 || /invalid-recipient|invalid address|recipient address rejected|invalid rcpt|5\.1\.1|5\.1\.3/.test(errText(err))) {
      return 'כתובת המייל של הנמען לא תקינה';
    }
    return GENERIC_FAILURE;
  })();
  if (status) return `${text} · קוד ${status}`;
  if (text === GENERIC_FAILURE) {
    const detail = fallbackDetail(err);
    if (detail) return `${text} · ${detail}`;
  }
  return text;
}

function scrubSecrets(value, secret) {
  const raw = String(secret ?? '');
  const compact = normalizeAppPassword(raw);
  const tokens = [...new Set([raw, compact])].filter((token) => token.length >= 8);
  tokens.sort((a, b) => b.length - a.length);
  let out = String(value ?? '');
  for (const token of tokens) out = out.split(token).join('[redacted]');
  return out;
}

// Copy the fields the mapper reads. Drop anything else — nodemailer errors
// sometimes carry the transport config, and that config holds the password.
function sanitizeMailError(err, secret) {
  if (!err) return err;
  const message = scrubSecrets(err.message, secret);
  const response = typeof err.response === 'string' ? scrubSecrets(err.response, secret) : err.response;
  const unchanged = message === String(err.message || '') && response === err.response;
  if (unchanged) return err;
  const copy = new Error(message);
  if (err.code != null) copy.code = typeof err.code === 'string' ? scrubSecrets(err.code, secret) : err.code;
  if (err.responseCode != null) copy.responseCode = err.responseCode;
  if (err.status != null) copy.status = err.status;
  if (err.skipped != null) copy.skipped = err.skipped;
  if (response !== undefined) copy.response = response;
  return copy;
}

function logMailFailure(label, err, secret) {
  const safe = sanitizeMailError(err, secret);
  const code = typeof safe?.code === 'string' ? scrubSecrets(safe.code, secret) : (safe?.code ?? '');
  console.error(label, scrubSecrets(safe?.message, secret), code);
  return safe;
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

// "TradeOS <tradeos.app@gmail.com>" → { name, email }. worker-mailer treats
// a string From as the envelope address, so the display name has to be split
// out or Gmail rejects MAIL FROM.
function parseMailbox(raw) {
  const value = String(raw || '').trim();
  const wrapped = value.match(/^(.*)<([^>]+)>$/);
  if (!wrapped) return { email: value };
  const email = wrapped[2].trim();
  const name = wrapped[1].trim().replace(/^"(.*)"$/, '$1').trim();
  return name ? { name, email } : { email };
}

function toWorkerMailerMessage(mail) {
  const message = {
    from: parseMailbox(mail.from),
    to: mail.to,
    subject: String(mail.subject || ''),
  };
  if (mail.html) message.html = String(mail.html);
  if (mail.text) message.text = String(mail.text);
  if (mail.replyTo) message.reply = String(mail.replyTo);
  if (mail.headers && typeof mail.headers === 'object') {
    const headers = {};
    for (const [key, value] of Object.entries(mail.headers)) {
      if (value != null) headers[key] = String(value);
    }
    message.headers = headers;
  }
  return message;
}

// One SMTP session for the whole batch. Tests pass deps.connect so they
// never open a socket. The real client is imported only here: loading it
// pulls cloudflare:sockets, which Node (vitest) does not have.
export async function openGmailTransport(options, deps = {}) {
  const connect = deps.connect || (async (opts) => {
    const { WorkerMailer } = await import('worker-mailer');
    return WorkerMailer.connect(opts);
  });
  const mailer = await connect(options);
  return {
    async sendMail(mail) {
      await mailer.send(toWorkerMailerMessage(mail));
    },
    async close() {
      await mailer.close?.();
    },
  };
}

export async function sendOneMessage(transport, { to, subject, html, text, replyTo, headers, from = GMAIL_FROM }) {
  const recipient = assertSingleRecipient(to);
  const mail = {
    from,
    to: recipient,
    subject: String(subject || ''),
    html: String(html || ''),
  };
  // Plain-text alternative, sent as multipart/alternative so clients that
  // prefer text (and screen readers) don't get a blank body.
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
  secret = '',
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
      const safe = logMailFailure('gmail send failed', err, secret);
      const friendly = friendlyMailError(safe);
      note(friendly);
      results.push({ to: list[i].to, ok: false, error: friendly });
      if (isAuthError(safe) || isDailyLimitError(safe)) {
        deferred += list.length - i - 1;
        break;
      }
      if (isTransientRateLimit(safe)) gap = Math.min(gap * 2, 4000);
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
  const create = opts.createTransport || openGmailTransport;
  let transport;
  try {
    transport = await create(gmailTransportOptions(pass));
    const result = await sendIndividually(list, {
      transport,
      gapMs: opts.gapMs,
      retryGapMs: opts.retryGapMs,
      sleepFn: opts.sleep,
      now: opts.now,
      budgetMs: opts.budgetMs,
      secret: env?.GMAIL_APP_PASSWORD,
      takeSlot: () => takeGmailSlot(kv, dateStr, cap),
      releaseSlot: () => releaseGmailSlot(kv, dateStr),
    });
    const ok = result.sent === list.length && result.failed === 0 && result.deferred === 0 && list.length > 0;
    return { ok, skipped: undefined, ...result };
  } catch (e) {
    const safe = logMailFailure('gmail delivery failed', e, env?.GMAIL_APP_PASSWORD);
    return {
      ok: false,
      sent: 0,
      failed: list.length,
      deferred: 0,
      firstError: friendlyMailError(safe),
      results: [],
    };
  } finally {
    try { await transport?.close?.(); } catch { /* socket already gone */ }
  }
}
