// The weekly admin report (Sunday push + email, and the "send me now" button
// in the panel). Pure: users in → numbers, push text and email out.
import { C, esc, bg, txt, pill, dot, para, emailShell } from './emailTheme.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
const RISK_DAYS = 14;

const ms = (v) => (v ? new Date(v).getTime() || 0 : 0);
const nameOf = (u) => String(u.displayName || u.email || 'משתמש').trim();
const fmtDay = (t) => new Date(t).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' });

// users: [{ role, plan, planExpires, planGrantedAt, createdAt, lastActive,
//           onboardingCompleted, displayName, email }]
export function computeDigest(users, now = Date.now()) {
  const customers = (users || []).filter((u) => u.role !== 'admin');
  const isPrem = (u) => u.plan === 'premium' && (!u.planExpires || ms(u.planExpires) > now);
  const age = (v) => now - ms(v);

  const joined = customers
    .filter((u) => ms(u.createdAt) > 0 && age(u.createdAt) < WEEK)
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const newPrevWeek = customers.filter((u) => ms(u.createdAt) > 0 && age(u.createdAt) >= WEEK && age(u.createdAt) < 2 * WEEK).length;
  const activeWeek = customers.filter((u) => ms(u.lastActive) > 0 && age(u.lastActive) < WEEK).length;
  const premium = customers.filter(isPrem);
  const upgrades = premium.filter((u) => ms(u.planGrantedAt) > 0 && age(u.planGrantedAt) < WEEK).length;
  const expiring = premium
    .filter((u) => u.planExpires && ms(u.planExpires) - now > 0 && ms(u.planExpires) - now < WEEK)
    .sort((a, b) => ms(a.planExpires) - ms(b.planExpires))
    .map((u) => ({ name: nameOf(u), days: Math.ceil((ms(u.planExpires) - now) / DAY) }));
  const churn = premium.filter((u) => ms(u.lastActive) > 0 && age(u.lastActive) >= WEEK).map(nameOf);
  const inactive = customers.filter((u) => ms(u.lastActive) > 0 && age(u.lastActive) >= RISK_DAYS * DAY).map(nameOf);
  const notOnboarded = customers.filter((u) => !u.onboardingCompleted && ms(u.createdAt) > 0 && age(u.createdAt) < 2 * WEEK).length;

  return {
    total: customers.length,
    newWeek: joined.length,
    newPrevWeek,
    activeWeek,
    premium: premium.length,
    upgrades,
    expiring,
    churn,
    inactive,
    notOnboarded,
    joined: joined.map((u) => ({ name: nameOf(u), at: ms(u.createdAt) })),
    range: `${fmtDay(now - 6 * DAY)}–${fmtDay(now)}`,
  };
}

export function digestPush(d) {
  return `${d.newWeek} חדשים · ${d.activeWeek} פעילים · ${d.premium} Premium · ${d.inactive.length} בסיכון`;
}

const names = (list, max = 3) => list.slice(0, max).join(', ') + (list.length > max ? ` ועוד ${list.length - max}` : '');

function tile(label, value, foot) {
  return `<td width="50%" style="padding:5px;vertical-align:top">
    <div style="${bg(C.tile)}border:1px solid ${C.line};border-radius:14px;padding:16px 16px 14px;text-align:right">
      <div style="font-size:12px;color:${C.sub};margin-bottom:6px">${txt(esc(label))}</div>
      <div style="font-size:32px;line-height:1.1;font-weight:bold;color:${C.text};margin-bottom:10px">${txt(esc(value))}</div>
      <div style="font-size:12px;color:${C.sub};line-height:1.5">${foot}</div>
    </div>
  </td>`;
}

function section(title, rowsHtml) {
  return `<div style="margin:26px 0 0">
    <div style="font-size:15px;font-weight:bold;color:${C.text};padding-bottom:10px;border-bottom:1px solid ${C.line}">${txt(esc(title))}</div>
    ${rowsHtml}
  </div>`;
}

function row(color, title, sub) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid ${C.line}"><tr>
    <td width="18" style="padding:13px 0;vertical-align:top;padding-top:18px">${dot(color)}</td>
    <td style="padding:12px 0;text-align:right">
      <div style="font-size:14px;color:${C.text};font-weight:bold;line-height:1.5">${txt(esc(title))}</div>
      ${sub ? `<div style="font-size:13px;color:${C.sub};line-height:1.5">${txt(esc(sub))}</div>` : ''}
    </td>
  </tr></table>`;
}

export function digestEmailBody(d) {
  const diff = d.newWeek - d.newPrevWeek;
  const newFoot = diff > 0 ? pill(`+${diff} משבוע שעבר`, C.green)
    : diff < 0 ? pill(`−${Math.abs(diff)} משבוע שעבר`, C.red)
      : txt('כמו בשבוע שעבר');
  const activePct = d.total ? Math.round((d.activeWeek / d.total) * 100) : 0;
  const premFoot = d.upgrades > 0 ? pill(d.upgrades === 1 ? '+1 שדרג השבוע' : `+${d.upgrades} שדרגו השבוע`, C.violet) : txt('ללא שדרוגים השבוע');

  const summary = d.newWeek === 0 && d.activeWeek === 0
    ? 'שבוע שקט: לא היו הרשמות ואף משתמש לא נכנס.'
    : `השבוע ${d.newWeek === 1 ? 'הצטרף משתמש חדש אחד' : `הצטרפו ${d.newWeek} משתמשים חדשים`} ו-${d.activeWeek} היו פעילים. יש ${d.premium} לקוחות Premium פעילים.`;

  const todo = [];
  for (const e of d.expiring.slice(0, 3)) {
    todo.push(row(C.dotAmber, `המנוי של ${e.name} מסתיים ${e.days <= 1 ? 'מחר' : `בעוד ${e.days} ימים`}`, 'כדאי לפנות ולחדש לפני שהוא נגמר'));
  }
  if (d.churn.length) {
    todo.push(row(C.dotViolet, d.churn.length === 1 ? 'לקוח Premium אחד לא נכנס שבוע+' : `${d.churn.length} לקוחות Premium לא נכנסו שבוע+`, names(d.churn)));
  }
  if (d.inactive.length) {
    todo.push(row(C.dotAmber, d.inactive.length === 1 ? `משתמש אחד לא נכנס ${RISK_DAYS}+ ימים` : `${d.inactive.length} משתמשים לא נכנסו ${RISK_DAYS}+ ימים`, names(d.inactive)));
  }
  if (d.notOnboarded) {
    todo.push(row(C.dotBlue, d.notOnboarded === 1 ? 'משתמש אחד נרשם ועדיין לא סיים את ההיכרות' : `${d.notOnboarded} נרשמו ועדיין לא סיימו את ההיכרות`, 'נרשמו בשבועיים האחרונים'));
  }

  const joinedRows = d.joined.slice(0, 6).map((j) => row(C.dotGreen, j.name, `הצטרף ב-${fmtDay(j.at)}`)).join('')
    + (d.joined.length > 6 ? para(`ועוד ${d.joined.length - 6}`, { size: 13, margin: '10px 0 0' }) : '');

  return `
    ${para(esc(summary), { margin: '0 0 18px' })}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>${tile('חדשים השבוע', d.newWeek, newFoot)}${tile('פעילים השבוע', d.activeWeek, txt(`${activePct}% מכלל המשתמשים`))}</tr>
      <tr>${tile('לקוחות Premium', d.premium, premFoot)}${tile('בסיכון נטישה', d.inactive.length, txt(`לא נכנסו ${RISK_DAYS}+ ימים`))}</tr>
    </table>
    ${section('דורש טיפול', todo.length ? todo.join('') : para('אין שום דבר דחוף השבוע.', { margin: '12px 0 0' }))}
    ${section('הצטרפו השבוע', d.joined.length ? joinedRows : para('לא היו הרשמות חדשות השבוע.', { margin: '12px 0 0' }))}`;
}

// The whole report, ready to send.
export function buildDigestEmail(users, { now = Date.now(), test = false } = {}) {
  const d = computeDigest(users, now);
  const html = emailShell({
    headline: 'הדוח השבועי',
    aside: d.range,
    body: digestEmailBody(d),
    ctaText: 'לפאנל הניהול',
    ctaUrl: 'https://tradeos-91a58.web.app/admin',
    footer: test
      ? 'שליחת בדיקה מהפאנל. הדוח נשלח אוטומטית בכל יום ראשון ב-09:00.'
      : 'נשלח אוטומטית בכל יום ראשון ב-09:00 · אפשר לשלוח שוב מהפאנל, בלשונית צמיחה.',
  });
  return {
    digest: d,
    push: digestPush(d),
    subject: `${test ? '[בדיקה] ' : ''}TradeOS · הדוח השבועי · ${d.range}`,
    html,
  };
}
