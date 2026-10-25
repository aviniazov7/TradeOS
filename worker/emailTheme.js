// The look of every TradeOS email: jet black, cerulean accent, white text.
// Pure string building (no fetch / env) so it's shared and unit-tested.
//
// Gmail's iPhone app force-inverts dark emails into a light theme. Two tricks
// keep ours black there too:
//   - backgrounds are painted with background-image (bg()), which Gmail leaves
//     alone;
//   - text is wrapped in txt(): two nested blend layers that undo Gmail's
//     inversion (the "u + .body" selector only matches inside Gmail; every
//     other client ignores it and shows the text as-is).
// The blend undo is exact for white/grey only, so colour never sits on text:
// it lives on backgrounds (pills, dots, the button) and text stays neutral.

export const APP_URL = 'https://tradeoslive.web.app';

// Mirrors the app's tokens (src/index.css).
export const C = {
  page: '#0a0a0a',
  card: '#141414',
  tile: '#1a1a1a',
  line: '#2a2a2a',
  text: '#f0f0f0',
  sub: '#a0a0b0',
  muted: '#70707f',
  accent: '#007ba7',
  // Dark tints for pills — readable white text on each.
  green: '#14532d',
  red: '#7f1d1d',
  amber: '#78350f',
  violet: '#4c1d95',
  blue: '#0c4a63',
  // Bright dots / bars.
  dotGreen: '#22c55e',
  dotRed: '#ef4444',
  dotAmber: '#f59e0b',
  dotViolet: '#8b5cf6',
  dotBlue: '#007ba7',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// A background Gmail won't invert (plus the plain colour for Outlook).
export const bg = (color) => `background-color:${color};background-image:linear-gradient(${color},${color});`;

// Text that stays light in Gmail's iPhone dark mode. `html` is trusted markup.
export const txt = (html) => `<span class="gm-s"><span class="gm-d">${html}</span></span>`;

// Small rounded label with white text on a coloured background.
export const pill = (label, color) =>
  `<span style="display:inline-block;${bg(color)}border-radius:999px;padding:3px 10px;font-size:12px;font-weight:bold;color:${C.text};line-height:1.5">${txt(esc(label))}</span>`;

// A small coloured square used as a status marker.
export const dot = (color) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;${bg(color)}vertical-align:middle"></span>`;

// Plain text block in the theme.
export const para = (text, { size = 15, color = C.sub, margin = '0 0 14px', bold = false } = {}) =>
  `<p style="margin:${margin};font-size:${size}px;line-height:1.7;color:${color};${bold ? 'font-weight:bold;' : ''}text-align:right">${txt(text)}</p>`;

// Branded RTL email. All CSS inline (most clients strip <style>; the one
// block below is only the Gmail fix). Table layout for Outlook.
//   headline / intro: plain text (escaped here)
//   body: trusted HTML built with the helpers above
//   aside: small text in the header's left corner (e.g. a date range)
export function emailShell({ headline, intro, ctaText, ctaUrl, body, footer, aside }) {
  // Emoji glyphs don't survive the Gmail blend fix (their colours flip), so
  // the big title stays text-only. Subjects keep theirs.
  const title = String(headline || '').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s{2,}/g, ' ').trim();
  const cta = ctaUrl && ctaText ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 4px">
      <tr><td align="center" bgcolor="${C.accent}" style="${bg(C.accent)}border-radius:12px">
        <a href="${esc(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px">${txt(esc(ctaText))}</a>
      </td></tr>
    </table>` : '';
  const foot = footer || `קיבלת את ההודעה הזו כי יש לך חשבון ב-TradeOS · <a href="${APP_URL}" style="color:${C.sub};text-decoration:underline">פתיחת האפליקציה</a>`;
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
u + .body .gm-s{background:#000;mix-blend-mode:screen}
u + .body .gm-d{background:#000;mix-blend-mode:difference}
</style></head>
<body class="body" bgcolor="${C.page}" style="margin:0;padding:0;${bg(C.page)}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.page}" style="${bg(C.page)}">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.card}" style="max-width:600px;${bg(C.card)}border:1px solid ${C.line};border-radius:18px">
        <tr><td style="padding:22px 26px;border-bottom:1px solid ${C.line}">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="text-align:right;vertical-align:middle">
              <span style="display:inline-block;width:10px;height:10px;border-radius:3px;${bg(C.accent)}vertical-align:middle;margin-left:8px"></span>
              <span style="font-size:18px;font-weight:bold;color:${C.text};vertical-align:middle">${txt('TradeOS')}</span>
            </td>
            ${aside ? `<td style="text-align:left;vertical-align:middle;font-size:12px;color:${C.muted};white-space:nowrap">${txt(`<span dir="ltr">${esc(aside)}</span>`)}</td>` : ''}
          </tr></table>
        </td></tr>
        <tr><td style="padding:30px 26px 26px;text-align:right">
          <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:${C.text};font-weight:bold">${txt(esc(title))}</h1>
          ${intro ? para(esc(intro)) : ''}
          ${body || ''}
          ${cta}
        </td></tr>
        <tr><td style="padding:16px 26px;border-top:1px solid ${C.line};text-align:right">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted}">${txt(foot)}</p>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};text-align:center">${txt(`TradeOS &copy; ${new Date().getFullYear()}`)}</p>
    </td></tr>
  </table>
</body></html>`;
}
