import { isClosedTrade, localDayKey } from './calculations';

// Severity is about what the trader can still do about it, not about size.
// critical — a plan limit is breached RIGHT NOW by something still open.
// warning  — the limit is intact but one more step crosses it.
// info     — worth knowing, nothing to act on this minute.
export const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const pnlOf = (t) => num(t.netPnl ?? t.pnl);
const usd = (v) => `$${Math.abs(Math.round(v * 100) / 100).toFixed(2)}`;
const isOpen = (t) => !!t && !isClosedTrade(t);

// The dollar amount actually at risk on an open position. riskAmount is the
// field the trade form asks for; when it is missing we derive it from the stop,
// and when there is no stop either the position is unbounded — which is itself
// the finding, so it must not silently read as zero risk.
function riskOf(trade) {
  const explicit = num(trade.riskAmount);
  if (explicit > 0) return { usd: explicit, source: 'declared' };

  const entry = num(trade.entryPrice);
  const stop = num(trade.stopLoss);
  const size = num(trade.positionSize) || num(trade.contracts);
  if (entry > 0 && stop > 0 && size > 0) {
    return { usd: Math.abs(entry - stop) * size, source: 'derived' };
  }
  return { usd: 0, source: stop > 0 ? 'unknown' : 'no-stop' };
}

/**
 * Deterministic check of the CURRENTLY open book against the active plan and
 * today's realized result. Nothing here goes near a model — the numbers are the
 * product, and a supervisor that hedges is worthless.
 *
 * @param {Array}  trades         every trade in the active journal
 * @param {Object} plan           the active trading plan (may be null)
 * @param {Object} opts.accountBalance  journal opening balance, 0 when unset
 * @param {Date}   opts.now       injected so the day boundary is testable
 */
export function superviseRisk(trades, plan, { accountBalance = 0, now = new Date() } = {}) {
  const all = trades || [];
  const open = all.filter(isOpen);
  const today = localDayKey(now);
  const closedToday = all.filter((t) => isClosedTrade(t) && localDayKey(t.exitDate || t.entryDate) === today);
  const realizedToday = closedToday.reduce((s, t) => s + pnlOf(t), 0);

  const findings = [];
  const add = (f) => findings.push(f);

  // --- open positions vs the plan's cap -----------------------------------
  const maxPositions = num(plan?.maxPositions);
  if (maxPositions > 0) {
    if (open.length > maxPositions) {
      add({
        id: 'positions-over',
        severity: 'critical',
        title: `${open.length} פוזיציות פתוחות, התוכנית מתירה ${maxPositions === 1 ? 'אחת' : maxPositions}`,
        detail: 'סגור פוזיציה לפני שאתה פותח את הבאה, או עדכן את התוכנית אם המגבלה כבר לא רלוונטית.',
        evidence: open.map((t) => t.pair || t.symbol || '—'),
      });
    } else if (open.length === maxPositions) {
      add({
        id: 'positions-at-limit',
        severity: 'warning',
        title: `הגעת למכסת הפוזיציות של התוכנית (${maxPositions})`,
        detail: 'הפוזיציה הבאה תהיה חריגה.',
        evidence: open.map((t) => t.pair || t.symbol || '—'),
      });
    }
  }

  // --- today's realized loss vs the daily cap ------------------------------
  const maxDailyLoss = num(plan?.maxDailyLoss);
  if (maxDailyLoss > 0 && accountBalance > 0) {
    const limit = (accountBalance * maxDailyLoss) / 100;
    const lossToday = realizedToday < 0 ? Math.abs(realizedToday) : 0;
    const usedPct = limit > 0 ? (lossToday / limit) * 100 : 0;
    if (lossToday > limit) {
      add({
        id: 'daily-loss-over',
        severity: 'critical',
        title: `עברת את תקרת ההפסד היומי: ${usd(lossToday)} מתוך ${usd(limit)}`,
        detail: 'התוכנית שלך אומרת לעצור להיום. כל עסקה נוספת היא כבר החלטה נגד התוכנית.',
        evidence: [`${closedToday.length} עסקאות נסגרו היום`, `${maxDailyLoss}% מ-${usd(accountBalance)}`],
      });
    } else if (usedPct >= 70 && lossToday > 0) {
      add({
        id: 'daily-loss-near',
        severity: 'warning',
        title: `ניצלת ${Math.round(usedPct)}% מתקרת ההפסד היומי`,
        detail: `נשארו ${usd(limit - lossToday)} עד לגבול שהגדרת.`,
        evidence: [`הפסד היום ${usd(lossToday)}`, `תקרה ${usd(limit)}`],
      });
    }
  } else if (maxDailyLoss > 0) {
    add({
      id: 'daily-loss-unmeasurable',
      severity: 'info',
      title: 'תקרת ההפסד היומי מוגדרת באחוזים, אבל ליומן אין יתרת פתיחה',
      detail: 'הזן יתרת פתיחה בהגדרות היומן כדי שהמפקח יוכל לאכוף את הכלל הזה.',
      evidence: [`תקרה מוגדרת: ${maxDailyLoss}%`],
    });
  }

  // --- open positions with no protective stop ------------------------------
  const unprotected = open.filter((t) => !(num(t.stopLoss) > 0));
  if (unprotected.length) {
    add({
      id: 'no-stop',
      severity: 'critical',
      title: `${unprotected.length === 1 ? 'פוזיציה פתוחה אחת' : `${unprotected.length} פוזיציות פתוחות`} בלי סטופ לוס`,
      detail: 'בלי סטופ אין תקרה להפסד, ואף כלל סיכון אחר בתוכנית לא באמת חל.',
      evidence: unprotected.map((t) => t.pair || t.symbol || '—'),
    });
  }

  // --- open positions outside the plan's allow-lists ------------------------
  const allowRules = [
    { key: 'pairs', label: 'המטבעות', allowed: plan?.pairs, valueOf: (t) => t.pair || t.symbol },
    { key: 'timeframes', label: 'הטיימפריימים', allowed: plan?.timeframes, valueOf: (t) => t.timeframe },
    { key: 'sessions', label: 'הסשנים', allowed: plan?.sessions, valueOf: (t) => t.session },
  ];
  for (const rule of allowRules) {
    if (!Array.isArray(rule.allowed) || !rule.allowed.length) continue;
    const set = new Set(rule.allowed.map((v) => String(v).trim().toLowerCase()));
    // A trade with no value for the field was never evaluated — that is missing
    // data, not a breach.
    const offenders = open.filter((t) => {
      const v = rule.valueOf(t);
      return v && !set.has(String(v).trim().toLowerCase());
    });
    if (!offenders.length) continue;
    add({
      id: `off-plan-${rule.key}`,
      severity: 'warning',
      title: `${offenders.length === 1 ? 'פוזיציה פתוחה' : `${offenders.length} פוזיציות פתוחות`} מחוץ ל${rule.label} של התוכנית`,
      detail: 'לא בהכרח טעות, אבל זו לא העסקה שתכננת מראש — ולכן אין לך עליה סטטיסטיקה.',
      evidence: [...new Set(offenders.map((t) => rule.valueOf(t)))],
    });
  }

  // --- total exposure across the open book ----------------------------------
  let riskUsd = 0;
  let unbounded = 0;
  for (const t of open) {
    const r = riskOf(t);
    if (r.source === 'no-stop' || r.source === 'unknown') unbounded += 1;
    riskUsd += r.usd;
  }
  const exposurePct = accountBalance > 0 ? (riskUsd / accountBalance) * 100 : null;
  if (exposurePct !== null && riskUsd > 0 && maxDailyLoss > 0 && riskUsd > (accountBalance * maxDailyLoss) / 100) {
    add({
      id: 'exposure-over-daily-cap',
      severity: 'critical',
      title: `הסיכון הפתוח (${usd(riskUsd)}) גדול מתקרת ההפסד היומי שלך`,
      detail: 'אם כל הסטופים ייפגעו היום, תעבור את הגבול שהגדרת — גם בלי לפתוח עוד עסקה אחת.',
      evidence: [`${open.length} פוזיציות פתוחות`, `תקרה יומית ${usd((accountBalance * maxDailyLoss) / 100)}`],
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    openCount: open.length,
    closedTodayCount: closedToday.length,
    realizedToday: Math.round(realizedToday * 100) / 100,
    // null, not 0 — "no balance on file" and "nothing at risk" are different
    // answers and the UI must be able to tell them apart.
    openRiskUsd: riskUsd > 0 ? Math.round(riskUsd * 100) / 100 : 0,
    openRiskPct: exposurePct === null ? null : Math.round(exposurePct * 10) / 10,
    unboundedPositions: unbounded,
    hasPlan: !!plan,
    findings,
  };
}
