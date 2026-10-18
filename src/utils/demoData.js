// Sample book for "explore without an API key". These objects never go to
// Firestore. They are painted over an empty account and dropped the moment
// the user exits demo mode or a real trade exists.

export const DEMO_CHANGE_EVENT = 'tradeos-demo-change';
export const DEMO_START_BALANCE = 10000;
export const DEMO_BANNER_TEXT = 'מצב דמו. אלה עסקאות לדוגמה על המסך בלבד — הן לא נשמרות ולא מתערבבות עם הנתונים שלך.';

export function demoStorageKey(uid) {
  return uid ? `tradeos_demo_${uid}` : '';
}

export function readDemoMode(uid, storage = globalThis.localStorage) {
  if (!uid || !storage) return false;
  try { return storage.getItem(demoStorageKey(uid)) === '1'; } catch { return false; }
}

export function writeDemoMode(uid, on, storage = globalThis.localStorage) {
  if (!uid || !storage) return;
  try {
    if (on) storage.setItem(demoStorageKey(uid), '1');
    else storage.removeItem(demoStorageKey(uid));
  } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
}

export function isDemoTrade(trade) {
  return !!trade?.demo || trade?.source === 'demo' || String(trade?.id || '').startsWith('demo-');
}

const SAMPLE = [
  { id: 'btc-long', pair: 'BTCUSDT', direction: 'long', entry: 64200, exit: 65840, qty: 0.05, lev: 10, stop: 63600, pnl: 420, daysAgo: 2, session: 'New York', strategy: 'Breakout' },
  { id: 'eth-short', pair: 'ETHUSDT', direction: 'short', entry: 3240, exit: 3310, qty: 1.2, lev: 8, stop: 3300, pnl: -180, daysAgo: 4, session: 'London', strategy: 'Reversal' },
  { id: 'sol-long', pair: 'SOLUSDT', direction: 'long', entry: 148, exit: 156.5, qty: 20, lev: 5, stop: 144, pnl: 260, daysAgo: 6, session: 'London', strategy: 'Breakout' },
  { id: 'btc-short', pair: 'BTCUSDT', direction: 'short', entry: 67100, exit: 66450, qty: 0.04, lev: 10, stop: 67600, pnl: 150, daysAgo: 9, session: 'Asia', strategy: 'Mean reversion' },
  { id: 'eth-long', pair: 'ETHUSDT', direction: 'long', entry: 3180, exit: 3140, qty: 1.5, lev: 6, stop: 3120, pnl: -90, daysAgo: 11, session: 'New York', strategy: 'Breakout' },
  { id: 'sol-short', pair: 'SOLUSDT', direction: 'short', entry: 162, exit: 155, qty: 15, lev: 5, stop: 166, pnl: 190, daysAgo: 14, session: 'Asia', strategy: 'Reversal' },
];

export function buildDemoTrades(journalId, now = Date.now()) {
  const dest = journalId || 'demo-journal';
  return SAMPLE.map((row) => {
    const exitDate = new Date(now - row.daysAgo * 24 * 60 * 60 * 1000);
    const entryDate = new Date(exitDate.getTime() - 5 * 60 * 60 * 1000);
    const risk = Math.abs(row.entry - row.stop) * row.qty;
    return {
      id: `demo-${row.id}`,
      pair: row.pair,
      direction: row.direction,
      entryPrice: row.entry,
      exitPrice: row.exit,
      quantity: row.qty,
      leverage: row.lev,
      stopLoss: row.stop,
      fees: 1.5,
      status: 'closed',
      result: row.pnl > 0 ? 'win' : row.pnl < 0 ? 'loss' : 'breakeven',
      pnl: row.pnl,
      netPnl: row.pnl,
      riskAmount: Math.round(risk * 100) / 100,
      rrRatio: risk > 0 ? Math.round((row.pnl / risk) * 100) / 100 : 0,
      orderType: 'market',
      session: row.session,
      strategy: row.strategy,
      source: 'demo',
      demo: true,
      entryDate,
      exitDate,
      journalId: dest,
    };
  });
}

// Real trades always win. Demo only fills an empty book, and the returned
// journal list is a display copy (opening balance so the hero has a number)
// — callers must not write it back.
export function overlayDemo({ active, trades, journals, activeJournalId, now } = {}) {
  const real = Array.isArray(trades) ? trades : [];
  const list = Array.isArray(journals) ? journals : [];
  if (!active || real.length > 0) {
    return { active: false, trades: real, journals: list };
  }
  const host = list.find((j) => j.id === activeJournalId) || list[0] || null;
  const journalId = host?.id || 'demo-journal';
  const samples = buildDemoTrades(journalId, now);
  if (!host) {
    return {
      active: true,
      trades: samples,
      journals: [{
        id: journalId,
        name: 'יומן לדוגמה',
        exchange: '',
        initialBalance: DEMO_START_BALANCE,
        currency: 'USDT',
        assetClass: 'crypto',
        demo: true,
      }],
    };
  }
  return {
    active: true,
    trades: samples,
    journals: list.map((j) => (j.id === host.id
      ? { ...j, demo: true, initialBalance: j.initialBalance > 0 ? j.initialBalance : DEMO_START_BALANCE }
      : j)),
  };
}
