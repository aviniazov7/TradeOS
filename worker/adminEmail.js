// Admin "come back to TradeOS" emails: one message to one user or a whole
// segment, personalised per recipient. Pure (no fetch / env) so it is
// unit-tested; index.js sends the result through Resend's batch API.
import { C, txt } from './emailTheme.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const APP_URL = 'https://tradeos-91a58.web.app';
// Hard cap per campaign — a typo in the panel must not mail everyone twice.
export const CAMPAIGN_MAX = 300;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Plain text → safe email HTML: blank lines split paragraphs, single newlines
// become <br>. Everything is escaped — the admin types text, not HTML.
export function messageToHtml(message) {
  return String(message || '')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;color:${C.sub};line-height:1.7;text-align:right">${txt(esc(p.trim()).replace(/\n/g, '<br>'))}</p>`)
    .join('');
}

// The button only ever points inside the app: a path like "/journal".
// Anything else (full URLs, protocol-relative "//evil") falls back to "/".
export function ctaUrlFor(path) {
  const p = String(path || '/').trim();
  const safe = p.startsWith('/') && !p.startsWith('//') && !/[\s<>"']/.test(p) ? p : '/';
  return `${APP_URL}${safe}`;
}

// recipients: [{ email, name }] → [{ to, subject, html }], de-duplicated,
// invalid addresses dropped, capped at CAMPAIGN_MAX. `shell` is the branded
// email wrapper from index.js (injected so this stays pure).
export function buildCampaignEmails({ recipients, subject, headline, message, ctaText, ctaPath }, shell) {
  const seen = new Set();
  const out = [];
  const body = messageToHtml(message);
  const ctaUrl = ctaUrlFor(ctaPath);
  for (const r of recipients || []) {
    const to = String(r?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to) || seen.has(to)) continue;
    seen.add(to);
    const name = String(r?.name || '').trim().slice(0, 60);
    out.push({
      to,
      subject: String(subject || headline || 'TradeOS').slice(0, 150),
      html: shell({
        headline: String(headline || subject || '').slice(0, 150),
        intro: name ? `היי ${name},` : 'היי,',
        body,
        ctaText: String(ctaText || 'כניסה ל-TradeOS').slice(0, 40),
        ctaUrl,
      }),
    });
    if (out.length >= CAMPAIGN_MAX) break;
  }
  return out;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Resend's error → one plain Hebrew sentence the admin can act on. The raw
// status code stays at the end for debugging.
export function friendlyResendError(status, message = '') {
  const m = String(message || '').toLowerCase();
  let text;
  if (/testing email|own email|verify a domain|resend\.dev/.test(m) || (status === 422 && /to` field|to field/.test(m))) {
    text = 'חיבור המיילים עדיין במצב בדיקה ושולח רק אליך. כדי לשלוח למשתמשים צריך לחבר דומיין ב-Resend';
  } else if (/domain is not verified|not verified/.test(m)) {
    text = 'הדומיין של כתובת השולח עוד לא אומת ב-Resend';
  } else if (status === 401 || /api key/.test(m)) {
    text = 'מפתח ה-Resend לא תקין או חסר';
  } else if (status === 429 || /rate limit|too many/.test(m)) {
    text = 'נשלחו יותר מדי מיילים בבת אחת — נסה שוב בעוד דקה';
  } else if (status === 422) {
    text = 'כתובת המייל של הנמען לא תקינה';
  } else {
    text = 'שליחת המייל נכשלה';
  }
  return status ? `${text} · קוד ${status}` : text;
}
