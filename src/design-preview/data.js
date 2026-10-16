// Realistic, deterministic mock book for the design preview.
// Noon anchor so "today" stays today for the whole session.

const DAY = 86400000;

// Oldest → newest. Hand-shaped so the curve dips, recovers, and prints
// a believable win rate / profit factor (checked in dev, not random).
export const TRADES = [
  { daysAgo: 118, pnl: 360 },
  { daysAgo: 114, pnl: -220 },
  { daysAgo: 110, pnl: 310 },
  { daysAgo: 106, pnl: 250 },
  { daysAgo: 102, pnl: 340 },
  { daysAgo: 98, pnl: 210 },
  { daysAgo: 94, pnl: 270 },
  { daysAgo: 90, pnl: 230 },
  { daysAgo: 86, pnl: -340 },
  { daysAgo: 82, pnl: 390 },
  { daysAgo: 78, pnl: -180 },
  { daysAgo: 74, pnl: -160 },
  { daysAgo: 70, pnl: 280 },
  { daysAgo: 66, pnl: 190 },
  { daysAgo: 62, pnl: -200 },
  { daysAgo: 58, pnl: 220 },
  { daysAgo: 54, pnl: -150 },
  { daysAgo: 50, pnl: 300 },
  { daysAgo: 46, pnl: 180 },
  { daysAgo: 42, pnl: -190 },
  { daysAgo: 38, pnl: 160 },
  { daysAgo: 34, pnl: -210 },
  { daysAgo: 30, pnl: 260 },
  { daysAgo: 26, pnl: -140 },
  { daysAgo: 22, pnl: 210 },
  { daysAgo: 18, pnl: -170 },
  { daysAgo: 14, pnl: 320 },
  { daysAgo: 8, pnl: -320 },
  { daysAgo: 5, pnl: 110 },
  { daysAgo: 3, pnl: 90 },
  { daysAgo: 0, pnl: 96 },
];

export const PERIODS = [
  { id: 'week', label: 'השבוע', days: 7 },
  { id: 'month', label: 'החודש', days: 30 },
  { id: 'all', label: 'הכל', days: null },
];

export const TICKER = [
  { symbol: 'BTC', label: 'BTC/USDT', price: 67240, change: 1.82 },
  { symbol: 'ETH', label: 'ETH/USDT', price: 3241.5, change: -0.64 },
  { symbol: 'SOL', label: 'SOL/USDT', price: 178.22, change: 3.21 },
  { symbol: 'XAU', label: 'XAU/USD', price: 2684, change: 0.41 },
  { symbol: 'NQ', label: 'NQ', price: 20142, change: 0.88 },
  { symbol: 'ES', label: 'ES', price: 5842.25, change: -0.22 },
  { symbol: 'NVDA', label: 'NVDA', price: 138.4, change: 1.15 },
  { symbol: 'AAPL', label: 'AAPL', price: 228.16, change: -0.37 },
];

export const NAV = [
  { id: 'home', label: 'בית' },
  { id: 'journal', label: 'יומן' },
  { id: 'ai', label: 'TradeAI' },
  { id: 'market', label: 'שוק' },
];

function anchor() {
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  return end.getTime();
}

export function series() {
  const end = anchor();
  let value = 0;
  return TRADES.map((t) => {
    value += t.pnl;
    return { t: end - t.daysAgo * DAY, pnl: t.pnl, value };
  });
}

export function account() {
  const s = series();
  const total = s.at(-1)?.value || 0;
  const balance = 48320.5;
  const initial = balance - total;
  const peakPnl = s.reduce((m, p) => Math.max(m, p.value), 0);
  return {
    balance,
    initial,
    total,
    pnlPercent: initial ? (total / initial) * 100 : 0,
    peak: initial + peakPnl,
    series: s,
  };
}

export function summarize(period) {
  const s = series();
  const def = PERIODS.find((p) => p.id === period) || PERIODS[2];
  const from = def.days ? anchor() - def.days * DAY : 0;
  const inRange = s.filter((p) => p.t >= from);
  let acc = 0;
  const points = def.days
    ? [{ t: from, value: 0, pnl: 0 }, ...inRange.map((p) => ({ t: p.t, value: (acc += p.pnl), pnl: p.pnl }))]
    : [{ t: s[0]?.t || from, value: 0, pnl: 0 }, ...s.map((p) => ({ t: p.t, value: p.value, pnl: p.pnl }))];
  const pnl = inRange.reduce((sum, p) => sum + p.pnl, 0);
  const wins = inRange.filter((p) => p.pnl > 0).length;
  const losses = inRange.filter((p) => p.pnl < 0).length;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = s.filter((p) => p.t >= dayStart.getTime()).reduce((sum, p) => sum + p.pnl, 0);
  const peak = points.reduce((m, p) => Math.max(m, p.value), 0);
  return {
    def,
    pnl,
    count: inRange.length,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    today,
    points,
    peak,
  };
}

export function kpis() {
  const s = series();
  const wins = s.filter((p) => p.pnl > 0);
  const losses = s.filter((p) => p.pnl < 0);
  const grossWin = wins.reduce((a, p) => a + p.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, p) => a + p.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -(grossLoss / losses.length) : 0;
  const decided = wins.length + losses.length;
  const ratio = avgLoss ? avgWin / Math.abs(avgLoss) : null;
  const pf = grossLoss ? grossWin / grossLoss : null;
  const bools = s.map((p) => p.pnl > 0);
  let best = 0;
  let run = 0;
  for (const w of bools) {
    if (w) { run += 1; best = Math.max(best, run); }
    else run = 0;
  }
  let current = 0;
  let streakWin = true;
  for (let i = bools.length - 1; i >= 0; i -= 1) {
    if (i === bools.length - 1) { streakWin = bools[i]; current = 1; }
    else if (bools[i] === streakWin) current += 1;
    else break;
  }
  const pfNote = pf == null
    ? 'ללא הפסדים עדיין'
    : pf >= 1.5
      ? 'חזק — ממשיכים כך'
      : pf >= 1
        ? 'רווחי, יש מקום לשיפור'
        : 'מתחת ל-1: ההפסדים גדולים מהרווחים';
  return {
    winRate: decided ? (wins.length / decided) * 100 : 0,
    wins: wins.length,
    losses: losses.length,
    avgWin,
    avgLoss,
    ratio,
    pf,
    pfNote,
    streak: current,
    streakWin,
    best,
    lastResults: bools.slice(-5),
    winShare: decided ? (wins.length / decided) * 100 : 0,
    sizeShare: avgWin + Math.abs(avgLoss) ? (avgWin / (avgWin + Math.abs(avgLoss))) * 100 : 0,
    pfShare: pf == null ? 100 : Math.min(100, (pf / 2) * 100),
  };
}

export function money(n, { sign = false, digits = 0 } = {}) {
  const abs = Math.abs(Number(n) || 0);
  const body = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${prefix}$${body}`;
}

export function signedPct(n) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function toneOf(n) {
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

export function shortDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatPrice(n) {
  if (n >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: n >= 10000 ? 0 : 2 });
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatChange(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function greeting(name = 'אבי') {
  const h = new Date().getHours();
  const hello = h >= 5 && h < 12 ? 'בוקר טוב'
    : h >= 12 && h < 17 ? 'צהריים טובים'
      : h >= 17 && h < 22 ? 'ערב טוב'
        : 'לילה טוב';
  return `${hello}, ${name}`;
}

export function todayLabel() {
  return new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function streakLabel(n, win) {
  if (!n) return 'אין עדיין';
  if (n === 1) return win ? 'רווח אחד' : 'הפסד אחד';
  return `${n} ${win ? 'רווחים' : 'הפסדים'}`;
}

export function thirdStat(model, acct) {
  if (model.def.id === 'week') {
    return { label: 'היום', text: money(model.today, { sign: true }), tone: toneOf(model.today) };
  }
  if (model.def.id === 'month') {
    return { label: 'אחוז הצלחה', text: model.winRate == null ? '—' : `${model.winRate}%`, tone: 'flat' };
  }
  return { label: 'שיא התיק', text: money(acct.peak), tone: acct.peak > 0 ? 'up' : 'flat' };
}
