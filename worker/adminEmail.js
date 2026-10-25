// Admin "come back to TradeOS" emails: one message to one user or a whole
// segment, personalised per recipient. Pure (no fetch / env) so it is
// unit-tested; index.js sends each result on its own via Gmail SMTP.
//
// The HTML is a dark, RTL, table-based message aimed at Gmail web and the
// Gmail mobile apps: inline CSS, bgcolor fallbacks, and the theme's
// background-image / blend-mode tricks so Gmail's forced inversion stays dark.
import { txt, APP_URL, bg } from './emailTheme.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export { APP_URL };
// Hard cap per campaign — a typo in the panel must not mail everyone twice.
export const CAMPAIGN_MAX = 300;

// Jet black page, near-black card. Cerulean is only the button and the small brand mark.
const PAGE = '#0a0a0a';
const CARD = '#141414';
const TILE = '#1a1a1a';
const LINE = '#222222';
const BTN = '#007ba7';
const TEXT = '#f5f5f5';
const SUB = '#c8c8c8';
const MUTED = '#8a8a8a';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const stripEmoji = (s) => String(s || '').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s{2,}/g, ' ').trim();

// Plain text → safe email HTML: blank lines split paragraphs, single newlines
// become <br>. Everything is escaped — the admin types text, not HTML.
export function messageToHtml(message) {
  return String(message || '')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;color:${SUB};line-height:1.75;text-align:right">${txt(esc(p.trim()).replace(/\n/g, '<br>'))}</p>`)
    .join('');
}

// The button only ever points inside the app: a path like "/journal".
// Anything else (full URLs, protocol-relative "//evil") falls back to "/".
export function ctaUrlFor(path) {
  const p = String(path || '/').trim();
  const safe = p.startsWith('/') && !p.startsWith('//') && !/[\s<>"']/.test(p) ? p : '/';
  return `${APP_URL}${safe}`;
}

// Israeli anti-spam rules (Communications Law §30A): the subject starts with
// "פרסומת", and every message carries a one-click way to opt out.
export const AD_PREFIX = 'פרסומת: ';

export function footerHtml(unsubscribeUrl) {
  const href = esc(unsubscribeUrl);
  return `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:${TEXT};text-align:right">${txt(`<a href="${href}" style="color:${TEXT};text-decoration:underline;font-weight:bold">להסרה מרשימת התפוצה</a>`)}</p>`
    + `<p style="margin:0;font-size:12px;line-height:1.65;color:${MUTED};text-align:right">${txt('קיבלת הודעה זו מ-TradeOS (tradeos.app@gmail.com). אפשר להפסיק עדכונים ותזכורות בכל רגע, גם מההגדרות באפליקציה.')}</p>`;
}

export function campaignPlainText({ headline, name, message, ctaText, ctaUrl, unsubscribeUrl }) {
  const hello = name ? `היי ${name},` : 'היי,';
  return [
    stripEmoji(headline) || 'TradeOS',
    '',
    hello,
    '',
    String(message || '').trim(),
    '',
    `${ctaText}: ${ctaUrl}`,
    '',
    `להסרה מרשימת התפוצה: ${unsubscribeUrl}`,
    '',
    'TradeOS · tradeos.app@gmail.com',
  ].join('\n');
}

// Branded reminder. `bodyHtml` is trusted markup from messageToHtml.
export function campaignEmailHtml({ headline, intro, bodyHtml, ctaText, ctaUrl, unsubscribeUrl }) {
  const title = stripEmoji(headline) || 'TradeOS';
  const button = ctaUrl && ctaText ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:8px auto 0">
      <tr><td align="center" bgcolor="${BTN}" style="${bg(BTN)}border-radius:12px">
        <a href="${esc(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;line-height:1.2">${txt(esc(ctaText))}</a>
      </td></tr>
    </table>` : '';
  const preheader = stripEmoji(intro || title).slice(0, 140);
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
u + .body .gm-s{background:#000;mix-blend-mode:screen}
u + .body .gm-d{background:#000;mix-blend-mode:difference}
@media only screen and (max-width:480px){
  .card-pad{padding:22px 16px !important}
  .h1{font-size:22px !important}
}
</style></head>
<body class="body" dir="rtl" bgcolor="${PAGE}" style="margin:0;padding:0;${bg(PAGE)}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${PAGE}">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" bgcolor="${PAGE}" style="${bg(PAGE)}">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" dir="rtl" bgcolor="${CARD}" style="width:100%;max-width:600px;${bg(CARD)}border:1px solid ${LINE};border-radius:20px">
        <tr><td height="4" bgcolor="${BTN}" style="${bg(BTN)};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:22px 28px;border-bottom:1px solid ${LINE}">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" dir="rtl"><tr>
            <td width="40" height="40" align="center" valign="middle" bgcolor="${BTN}" style="${bg(BTN)}width:40px;height:40px;border-radius:12px;text-align:center;vertical-align:middle">
              ${txt('<span style="font-size:18px;font-weight:bold;color:#ffffff;line-height:40px">T</span>')}
            </td>
            <td style="padding-right:12px;text-align:right;vertical-align:middle">
              <div style="font-size:18px;font-weight:bold;color:${TEXT};line-height:1.2" dir="ltr">${txt('TradeOS')}</div>
              <div style="font-size:12px;color:${MUTED};line-height:1.4;margin-top:2px">${txt('מערכת ההפעלה למסחר')}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="card-pad" style="padding:32px 28px 28px;text-align:right" dir="rtl">
          <p style="margin:0 0 12px;font-size:11px;font-weight:bold;letter-spacing:0.4px;color:${MUTED};text-align:right">${txt('תזכורת · פרסומת')}</p>
          <h1 class="h1" style="margin:0 0 14px;font-size:26px;line-height:1.35;color:${TEXT};font-weight:bold;text-align:right">${txt(esc(title))}</h1>
          ${intro ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${SUB};text-align:right">${txt(esc(intro))}</p>` : ''}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" bgcolor="${TILE}" style="${bg(TILE)}border:1px solid ${LINE};border-radius:14px">
            <tr><td style="padding:18px 18px 4px;text-align:right" dir="rtl">
              ${bodyHtml || ''}
            </td></tr>
          </table>
          ${button}
        </td></tr>
        <tr><td style="padding:18px 28px 22px;border-top:1px solid ${LINE};text-align:right" dir="rtl">
          ${footerHtml(unsubscribeUrl)}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:${MUTED};text-align:center">${txt(`TradeOS &copy; ${new Date().getFullYear()}`)}</p>
    </td></tr>
  </table>
</body></html>`;
}

// recipients: [{ email, name, unsubscribeUrl }] → [{ to, subject, html, text, headers }],
// de-duplicated, invalid addresses dropped, capped at CAMPAIGN_MAX. A recipient
// WITHOUT an unsubscribe link is skipped: nothing is ever sent without an opt-out.
export function buildCampaignEmails({ recipients, subject, headline, message, ctaText, ctaPath }) {
  const seen = new Set();
  const out = [];
  const bodyHtml = messageToHtml(message);
  const ctaUrl = ctaUrlFor(ctaPath);
  const buttonText = String(ctaText || 'כניסה ל-TradeOS').slice(0, 40);
  const title = String(headline || subject || '').slice(0, 150);
  for (const r of recipients || []) {
    const to = String(r?.email || '').trim().toLowerCase();
    const unsubscribeUrl = String(r?.unsubscribeUrl || '');
    if (!EMAIL_RE.test(to) || seen.has(to) || !/^https:\/\//.test(unsubscribeUrl)) continue;
    seen.add(to);
    const name = String(r?.name || '').trim().slice(0, 60);
    const intro = name ? `היי ${name},` : 'היי,';
    out.push({
      to,
      subject: AD_PREFIX + String(subject || headline || 'TradeOS').slice(0, 150 - AD_PREFIX.length),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: campaignEmailHtml({
        headline: title,
        intro,
        bodyHtml,
        ctaText: buttonText,
        ctaUrl,
        unsubscribeUrl,
      }),
      text: campaignPlainText({
        headline: title,
        name,
        message,
        ctaText: buttonText,
        ctaUrl,
        unsubscribeUrl,
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
