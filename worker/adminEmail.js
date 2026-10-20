// Admin "come back to TradeOS" emails: one message to one user or a whole
// segment, personalised per recipient. Pure (no fetch / env) so it is
// unit-tested; index.js sends the result through Resend's batch API.
import { APP_URL, C, txt } from './emailTheme.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export { APP_URL };
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

// Israeli anti-spam rules (Communications Law §30A) for advertising email:
// recipients must have opted in, the subject must start with the word
// "פרסומת", and every message must carry an easy way to opt out.
export const AD_PREFIX = 'פרסומת: ';

export function footerHtml(unsubscribeUrl) {
  return `<p style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${C.line};font-size:12px;color:${C.muted};line-height:1.7;text-align:right">`
    + 'קיבלת הודעה זו כי הסכמת לקבל עדכונים והטבות מ-TradeOS. '
    + `<a href="${esc(unsubscribeUrl)}" style="color:${C.accent};text-decoration:underline">להסרה מרשימת התפוצה לחץ כאן</a>.</p>`;
}

// recipients: [{ email, name, unsubscribeUrl }] → [{ to, subject, html, headers }],
// de-duplicated, invalid addresses dropped, capped at CAMPAIGN_MAX. A recipient
// WITHOUT an unsubscribe link is skipped: nothing is ever sent without an
// opt-out. `shell` is the branded email wrapper from index.js (injected so
// this stays pure).
export function buildCampaignEmails({ recipients, subject, headline, message, ctaText, ctaPath }, shell) {
  const seen = new Set();
  const out = [];
  const body = messageToHtml(message);
  const ctaUrl = ctaUrlFor(ctaPath);
  for (const r of recipients || []) {
    const to = String(r?.email || '').trim().toLowerCase();
    const unsubscribeUrl = String(r?.unsubscribeUrl || '');
    if (!EMAIL_RE.test(to) || seen.has(to) || !/^https:\/\//.test(unsubscribeUrl)) continue;
    seen.add(to);
    const name = String(r?.name || '').trim().slice(0, 60);
    out.push({
      to,
      subject: AD_PREFIX + String(subject || headline || 'TradeOS').slice(0, 150 - AD_PREFIX.length),
      // One-click opt-out for mail clients (RFC 8058) next to the visible link.
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: shell({
        headline: String(headline || subject || '').slice(0, 150),
        intro: name ? `היי ${name},` : 'היי,',
        body: body + footerHtml(unsubscribeUrl),
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
