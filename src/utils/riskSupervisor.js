import { isClosedTrade, localDayKey, positionUnits } from './calculations';

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
const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const isOpen = (t) => !!t && !isClosedTrade(t);
const dayOf = (t) => localDayKey(t.exitDate || t.entryDate);

// Share of the position still open (0..1). Partial exits (TP1 taken) already
// left the market — their size can no longer be stopped out.
function openFraction(trade) {
  const exitedPct = (Array.isArray(trade.exits) ? trade.exits : [])
    .reduce((s, e) => s + num(e?.percent), 0);
  return Math.max(0, Math.min(1, 1 - exitedPct / 100));
}

// The dollar amount at risk on an open position right now.
//
//   risk = max(0, (entry − stop) × sign) × units × (1 − exited% / 100)
//
// The live stop wins over the declared riskAmount. riskAmount is the risk
// planned at entry and TradeForm keeps it untouched when the trade is edited,
// so a position moved to breakeven would otherwise keep reporting the risk it
// no longer carries. A supervisor that reports stale risk as current is worse
// than one that reports nothing. A stop trailed INTO profit locks gains in —
// it is zero risk, not |entry − stop| of risk. Units come from the shared
// positionUnits (notional / entry — right for crypto and futures alike).
function riskOf(trade) {
  const entry = num(trade.entryPrice);
  const stop = num(trade.stopLoss);
  const units = positionUnits(trade);
  const remaining = openFraction(trade);

  if (entry > 0 && stop > 0 && units > 0) {
    // Without a recorded direction the side is unknowable — keep the distance.
    const sign = trade.direction === 'short' ? -1 : trade.direction === 'long' ? 1 : null;
    const perUnit = sign === null ? Math.abs(entry - stop) : Math.max(0, (entry - stop) * sign);
    return { usd: perUnit * units * remaining, source: 'derived' };
  }
  const declared = num(trade.riskAmount);
  if (declared > 0) return { usd: declared * remaining, source: 'declared' };
  // 'unsized' = there is a stop but no way to price it. Different fact from
  // 'no-stop', and the two must never be merged into one counter.
  return { usd: 0, source: stop > 0 ? 'unsized' : 'no-stop' };
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

  // Money booked today comes from two places. A partially-closed position is
  // still open, but the P&L on the legs already sold is realized — leaving it
  // out let real losses accumulate against a hard stop-trading rule unseen.
  const closedToday = all.filter((t) => isClosedTrade(t) && dayOf(t) === today);
  const partialsToday = all.filter((t) => t.status === 'partial' && pnlOf(t) !== 0 && dayOf(t) === today);
  const realizedToday = [...closedToday, ...partialsToday].reduce((s, t) => s + pnlOf(t), 0);

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
  const dailyLimit = maxDailyLoss > 0 && accountBalance > 0 ? (accountBalance * maxDailyLoss) / 100 : null;
  const lossToday = realizedToday < 0 ? Math.abs(realizedToday) : 0;
  if (dailyLimit !== null) {
    const bookedCount = closedToday.length + partialsToday.length;
    const usedPct = (lossToday / dailyLimit) * 100;
    if (lossToday > dailyLimit) {
      add({
        id: 'daily-loss-over',
        severity: 'critical',
        title: `עברת את תקרת ההפסד היומי: ${usd(lossToday)} מתוך ${usd(dailyLimit)}`,
        detail: 'התוכנית שלך אומרת לעצור להיום. כל עסקה נוספת היא כבר החלטה נגד התוכנית.',
        evidence: [count(bookedCount, 'עסקה אחת נסגרה היום', 'עסקאות נסגרו היום'), `${maxDailyLoss}% מ-${usd(accountBalance)}`],
      });
    } else if (usedPct >= 70 && lossToday > 0) {
      add({
        id: 'daily-loss-near',
        severity: 'warning',
        title: `ניצלת ${Math.round(usedPct)}% מתקרת ההפסד היומי`,
        detail: `נשארו ${usd(dailyLimit - lossToday)} עד לגבול שהגדרת.`,
        evidence: [`הפסד היום ${usd(lossToday)}`, `תקרה ${usd(dailyLimit)}`],
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
      title: `${count(unprotected.length, 'פוזיציה פתוחה אחת', 'פוזיציות פתוחות')} בלי סטופ לוס`,
      detail: 'בלי סטופ אין תקרה להפסד, ואף כלל סיכון אחר בתוכנית לא באמת חל.',
      evidence: unprotected.map((t) => t.pair || t.symbol || '—'),
    });
  }

  // --- open positions outside the plan's allow-lists ------------------------
  // Labels carry no definite article — the ל prefix below supplies it.
  const allowRules = [
    { key: 'pairs', label: 'מטבעות', allowed: plan?.pairs, valueOf: (t) => t.pair || t.symbol },
    { key: 'timeframes', label: 'טיימפריימים', allowed: plan?.timeframes, valueOf: (t) => t.timeframe },
    { key: 'sessions', label: 'סשנים', allowed: plan?.sessions, valueOf: (t) => t.session },
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
      title: `${count(offenders.length, 'פוזיציה פתוחה אחת', 'פוזיציות פתוחות')} מחוץ ל${rule.label} של התוכנית`,
      detail: 'לא בהכרח טעות, אבל זו לא העסקה שתכננת מראש — ולכן אין לך עליה סטטיסטיקה.',
      evidence: [...new Set(offenders.map((t) => rule.valueOf(t)))],
    });
  }

  // --- total exposure across the open book ----------------------------------
  let riskUsd = 0;
  let unsized = 0;
  for (const t of open) {
    const r = riskOf(t);
    if (r.source === 'unsized') unsized += 1;
    riskUsd += r.usd;
  }
  // Positions that could not be priced contribute nothing, so this is a lower
  // bound on the real exposure. Every claim built on it must stay one-directional:
  // "already too big" is safe, "small enough" is not.
  const unmeasurable = unprotected.length + unsized;
  const exposurePct = accountBalance > 0 ? (riskUsd / accountBalance) * 100 : null;
  if (dailyLimit !== null && riskUsd > 0) {
    // What the day would look like if every open stop were hit, on top of what
    // is already booked. Ignoring the realized loss let a guaranteed breach pass.
    const worstCase = lossToday + riskUsd;
    if (worstCase > dailyLimit) {
      add({
        id: 'exposure-over-daily-cap',
        severity: 'critical',
        title: `אם כל הסטופים ייפגעו היום תסיים ב-${usd(worstCase)} הפסד, מעל התקרה של ${usd(dailyLimit)}`,
        detail: 'זה כבר נכון עכשיו, בלי לפתוח אף עסקה נוספת. הקטן פוזיציה או הדק סטופ.',
        evidence: [
          count(open.length, 'פוזיציה פתוחה אחת', 'פוזיציות פתוחות'),
          `סיכון פתוח ${usd(riskUsd)}`,
          ...(lossToday > 0 ? [`הפסד שכבר מומש ${usd(lossToday)}`] : []),
        ],
      });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    openCount: open.length,
    closedTodayCount: closedToday.length,
    partialTodayCount: partialsToday.length,
    realizedToday: Math.round(realizedToday * 100) / 100,
    openRiskUsd: Math.round(riskUsd * 100) / 100,
    // null, not 0 — "no balance on file" and "nothing at risk" are different
    // answers and the UI must be able to tell them apart.
    openRiskPct: exposurePct === null ? null : Math.round(exposurePct * 10) / 10,
    // Derived from the SAME array the no-stop finding is built from, so the tile
    // can never contradict the finding rendered under it.
    stoplessPositions: unprotected.length,
    unsizedPositions: unsized,
    unmeasurablePositions: unmeasurable,
    hasPlan: !!plan,
    findings,
  };
}
