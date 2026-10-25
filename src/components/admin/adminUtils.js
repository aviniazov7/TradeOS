// Shared helpers for the admin panel tabs. Pure — no React, no Firebase.
import { Crown, X, Send, Plus, Trash2, Ticket, Mail, Users } from 'lucide-react';

// Audit-log event kinds → label, colour and icon.
export const KIND_META = {
  premium_grant: { label: 'הענקת Premium', color: 'text-amber-400', tile: 'bg-amber-500/12 text-amber-400', Icon: Crown },
  premium_revoke: { label: 'ביטול Premium', color: 'text-loss', tile: 'bg-loss/12 text-loss', Icon: X },
  notify: { label: 'שליחת Push', color: 'text-accent-primary', tile: 'bg-accent-primary/14 text-accent-hover', Icon: Send },
  'notify-bulk': { label: 'תזכורת לקבוצה', color: 'text-accent-primary', tile: 'bg-accent-primary/14 text-accent-hover', Icon: Users },
  'email-campaign': { label: 'מייל לקבוצה', color: 'text-accent-primary', tile: 'bg-accent-primary/14 text-accent-hover', Icon: Mail },
  payment_email: { label: 'מייל אישור תשלום', color: 'text-profit', tile: 'bg-profit/12 text-profit', Icon: Mail },
  coupon_create: { label: 'יצירת קופון', color: 'text-amber-400', tile: 'bg-amber-500/12 text-amber-400', Icon: Plus },
  coupon_delete: { label: 'מחיקת קופון', color: 'text-loss', tile: 'bg-loss/12 text-loss', Icon: Trash2 },
  coupon_redeem: { label: 'מימוש קופון', color: 'text-profit', tile: 'bg-profit/12 text-profit', Icon: Ticket },
  account_deleted: { label: 'מחיקת חשבון', color: 'text-loss', tile: 'bg-loss/12 text-loss', Icon: Trash2 },
};

export const DAY_MS = 24 * 60 * 60 * 1000;
// A customer we've seen before who hasn't opened the app for this long is
// "at risk" — the overview's to-do list and the users tab's filter agree on it.
export const RISK_DAYS = 14;

export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();        // Firestore SDK Timestamp
  if (typeof v === 'number') return new Date(v);                 // epoch ms
  if (typeof v === 'object') {                                   // serialized Timestamp
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return new Date(s * 1000);
  }
  const d = new Date(v);                                         // ISO string / Date
  return isNaN(d) ? null : d;
}

// Compute effective premium status from a user doc (admins are always premium;
// otherwise plan='premium' and planExpires (if set) must be in the future).
export function isUserPremium(u) {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.plan !== 'premium') return false;
  if (!u.planExpires) return true; // lifetime
  // Must go through toDate — planExpires is a Firestore Timestamp, and
  // new Date(Timestamp) is Invalid Date → NaN → a real premium user would be
  // shown as "חינמי". If it's set but truly unparseable, keep the badge
  // (plan is explicitly 'premium') rather than falsely stripping it.
  const d = toDate(u.planExpires);
  return d ? d.getTime() > Date.now() : true;
}

export function formatDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

export function shortDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '—';
}

export function lastActiveMs(u) {
  return toDate(u?.lastActive)?.getTime() || 0;
}

export function createdMs(u) {
  return toDate(u?.createdAt)?.getTime() || 0;
}

export function daysSinceActive(u) {
  const t = lastActiveMs(u);
  return t ? Math.floor((Date.now() - t) / DAY_MS) : Infinity;
}

// Hebrew relative "last seen" label.
export function relativeActive(v) {
  const d = toDate(v);
  if (!d) return 'מעולם לא';
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return 'עכשיו';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} ד'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}

// Active = opened the app within the last `days` days.
export function activeWithin(u, days) {
  return daysSinceActive(u) <= days;
}

// Days until Premium expires (negative if already expired, Infinity if lifetime).
export function daysUntilExpiry(u) {
  const d = toDate(u?.planExpires);
  if (!d) return Infinity; // lifetime / unknown
  return Math.ceil((d.getTime() - Date.now()) / DAY_MS);
}

// A customer we've seen before who's been gone RISK_DAYS+ days.
export function isAtRisk(u) {
  return u.role !== 'admin' && lastActiveMs(u) > 0 && daysSinceActive(u) >= RISK_DAYS;
}

export const ILS = (n) => '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');

// Display names for connected-exchange ids (the worker returns ids only —
// mirrors the list in exchange/exchangeConfig.js).
export const EXCHANGE_NAMES = {
  bybit: 'Bybit', mexc: 'MEXC', okx: 'OKX', bitget: 'Bitget', binance: 'Binance', hyperliquid: 'Hyperliquid',
};

export function csvCell(v) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One status per user for the table pill — the most useful fact first.
const STATUS = {
  admin:   { label: 'אדמין',    cls: 'text-accent-primary bg-accent-primary/12' },
  premium: { label: 'Premium',  cls: 'text-violet-300 bg-violet-500/15' },
  never:   { label: 'לא נכנס',  cls: 'text-text-secondary bg-bg-tertiary' },
  risk:    { label: 'בסיכון',   cls: 'text-amber-400 bg-amber-500/12' },
  new:     { label: 'חדש',      cls: 'text-accent-hover bg-accent-primary/12' },
  active:  { label: 'פעיל',     cls: 'text-profit bg-profit/12' },
  idle:    { label: 'רדום',     cls: 'text-text-secondary bg-bg-tertiary' },
};

export function userStatus(u) {
  let key = 'idle';
  if (u.role === 'admin') key = 'admin';
  else if (isUserPremium(u)) key = 'premium';
  else if (!lastActiveMs(u)) key = 'never';
  else if (daysSinceActive(u) >= RISK_DAYS) key = 'risk';
  else if (Date.now() - createdMs(u) <= 7 * DAY_MS) key = 'new';
  else if (activeWithin(u, 7)) key = 'active';
  return { key, ...STATUS[key] };
}

// The worker writes the cron heartbeat at most hourly, so 3h of silence means
// the scheduler really stopped.
const CRON_STALE_MS = 3 * 60 * 60 * 1000;

const CF_QUOTA_LABELS = {
  kvRead: 'KV · קריאות', kvWrite: 'KV · כתיבות', kvDelete: 'KV · מחיקות', kvList: 'KV · רשימות', workers: 'Workers · בקשות',
};

// Cloudflare quota rows (today vs the free-tier daily limits).
export function cloudflareQuotaRows(quotas) {
  if (!quotas?.configured || quotas.error) return [];
  const used = {
    kvRead: quotas.kv?.read, kvWrite: quotas.kv?.write, kvDelete: quotas.kv?.delete, kvList: quotas.kv?.list, workers: quotas.workers?.requests,
  };
  return Object.keys(CF_QUOTA_LABELS).map((k) => {
    const u = Number(used[k]) || 0;
    const l = Number(quotas.limits?.[k]) || 0;
    return { key: k, label: CF_QUOTA_LABELS[k], used: u, limit: l, pct: l ? Math.min(100, (u / l) * 100) : 0 };
  });
}

const rank = { ok: 0, loading: 0, warn: 1, bad: 2 };

// One status per service for the system tab, the overview's to-do list and
// the dot on the tab: 'ok' | 'warn' | 'bad' | 'loading', plus a short reason.
export function systemChecks({ health, globalAi, aiTest, fbUsage }) {
  if (!health) {
    return { services: [], issues: [], level: 'loading' };
  }
  const services = [];

  const cronAge = health.cronLast ? Date.now() - health.cronLast : null;
  services.push({
    id: 'cron',
    name: 'התראות ברקע (Cron)',
    status: cronAge == null || cronAge > CRON_STALE_MS ? 'bad' : 'ok',
    sub: health.cronLast ? `ריצה אחרונה ${relativeActive(health.cronLast)} · כל 10 דקות` : 'עדיין לא רץ',
    issue: health.cronLast ? `ה-Cron לא רץ ${relativeActive(health.cronLast).replace('לפני ', '')}` : 'ה-Cron לא רץ',
  });

  services.push({
    id: 'push',
    name: 'התראות לטלפון',
    status: health.pushConfigured ? 'ok' : 'bad',
    sub: health.pushConfigured ? 'מוגדר ומוכן לשליחה' : 'חסר מפתח VAPID',
    issue: 'התראות לטלפון לא מוגדרות',
  });

  const ceiling = health.ai?.limits?.globalCeiling || 50000;
  const today = globalAi ? (globalAi.totalText || 0) + (globalAi.totalImage || 0) : null;
  const aiPct = today != null ? Math.min(100, (today / ceiling) * 100) : null;
  const failing = aiTest && !aiTest.error
    ? [['Gemini', aiTest.gemini], ['Groq', aiTest.groq]].filter(([, r]) => r && !r.ok).map(([n]) => n)
    : [];
  // Every provider failed at once recently (the worker logs it) — users saw
  // an error then.
  const lastFail = health.aiLastFail && Date.now() - health.aiLastFail.t < 60 * 60 * 1000 ? health.aiLastFail : null;
  let aiStatus = 'ok';
  if (!health.aiConfigured || failing.includes('Groq')) aiStatus = 'bad';
  else if (lastFail) aiStatus = 'bad';
  else if (failing.length || (aiPct != null && aiPct >= 60)) aiStatus = 'warn';
  services.push({
    id: 'ai',
    name: `AI · ${health.ai?.geminiActive ? 'Gemini + Groq' : 'Groq'}`,
    status: aiStatus,
    pct: aiPct,
    lastFail,
    sub: !health.aiConfigured ? 'לא מוגדר'
      : lastFail ? `כל הספקים נכשלו ${relativeActive(lastFail.t)}: ${(lastFail.fails || []).map((f) => `${f.provider} ${f.status}`).join(' · ')}`
        : today != null ? `${today.toLocaleString()} מתוך ${ceiling.toLocaleString()} בקשות היום` : 'מחובר',
    issue: !health.aiConfigured ? 'ה-AI לא מוגדר'
      : lastFail ? 'ה-AI נכשל אצל כל הספקים בשעה האחרונה'
        : failing.length ? `בדיקת חיבור נכשלה: ${failing.join(', ')}` : 'ה-AI קרוב למגבלה היומית',
  });

  if (health.quotas?.configured) {
    const rows = cloudflareQuotaRows(health.quotas);
    const max = rows.reduce((m, r) => (r.pct > m.pct ? r : m), { pct: 0 });
    services.push({
      id: 'cloudflare',
      name: 'Cloudflare Worker',
      status: health.quotas.error ? 'warn' : max.pct >= 90 ? 'bad' : max.pct >= 70 ? 'warn' : 'ok',
      pct: health.quotas.error ? null : max.pct,
      sub: health.quotas.error ? 'לא ניתן לטעון מכסות' : max.label ? `השימוש הגבוה היום: ${max.label} ${Math.round(max.pct)}%` : 'ללא שימוש היום',
      issue: health.quotas.error ? 'מכסות Cloudflare לא נטענו' : `${max.label} ב-${Math.round(max.pct)}% מהמכסה`,
    });
  }

  const counts = fbUsage?.counts;
  services.push({
    id: 'firebase',
    name: 'Firebase',
    status: fbUsage?.error ? 'warn' : fbUsage ? 'ok' : 'loading',
    sub: fbUsage?.error ? 'טעינת הנתונים נכשלה'
      : counts ? [counts.users != null && `${counts.users.toLocaleString()} משתמשים`, counts.trades != null && `${counts.trades.toLocaleString()} עסקאות`].filter(Boolean).join(' · ') || 'מחובר'
        : 'טוען…',
    issue: 'נתוני Firebase לא נטענו',
  });

  const issues = services.filter((s) => s.status === 'warn' || s.status === 'bad').map((s) => s.issue);
  const level = services.reduce((lv, s) => (rank[s.status] > rank[lv] ? s.status : lv), 'ok');
  return { services, issues, level };
}

export const displayName =(u) => u?.displayName || u?.email || (u?.id ? `${u.id.slice(0, 8)}…` : '—');
