// Regression tests for the CME futures feature (epic #32).
// Run: `node scripts/test-futures.mjs`  (exits non-zero on any failure)
//
// Covers the pure money math + the contracts catalog. Guards two things:
//   1. Futures dollar P&L is correct (points × pointValue × contracts).
//   2. The crypto path is byte-for-byte unchanged.

import {
  calculatePnL,
  calculatePnLPercent,
  calculatePartialPnL,
  calculateFuturesPnL,
  calculateFuturesPartialPnL,
  calculateFuturesNotional,
} from '../src/utils/calculations.js';
import { FUTURES_CONTRACTS, getContractSpec } from '../src/utils/constants.js';

let passed = 0;
let failed = 0;
const approx = (a, b) => Math.abs(a - b) < 1e-9;

function check(name, got, want) {
  if (approx(got, want)) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name}: got ${got}, expected ${want}`);
  }
}
function ok(name, cond) {
  if (cond) { passed++; } else { failed++; console.error(`✗ ${name}`); }
}

// ── Crypto path unchanged ──────────────────────────────────────────
check('crypto long pnl', calculatePnL('long', 100, 110, 2), 20);
check('crypto short pnl', calculatePnL('short', 100, 90, 2), 20);
check('crypto pnl% (lev 10)', calculatePnLPercent(20, 100, 2, 10), 100);
check('crypto partial', calculatePartialPnL('long', 100, [{ price: 110, percent: 50 }, { price: 120, percent: 50 }], 2), 30);

// ── Futures dollar P&L ─────────────────────────────────────────────
check('ES long 5000→5010 ×2', calculateFuturesPnL('long', 5000, 5010, 50, 2), 1000);
check('ES short 5000→5010 ×2', calculateFuturesPnL('short', 5000, 5010, 50, 2), -1000);
check('NQ short 18000→17990 ×1', calculateFuturesPnL('short', 18000, 17990, 20, 1), 200);
check('CL long 80→80.5 ×3', calculateFuturesPnL('long', 80, 80.5, 1000, 3), 1500);
check('GC long 2300→2290 ×1', calculateFuturesPnL('long', 2300, 2290, 100, 1), -1000);
check('MES micro 5000→5010 ×4', calculateFuturesPnL('long', 5000, 5010, 5, 4), 200);

// Partial exits
check('ES partial 50%@5010 + 50%@5020 ×2',
  calculateFuturesPartialPnL('long', 5000, [{ price: 5010, percent: 50 }, { price: 5020, percent: 50 }], 50, 2), 1500);

// Notional + percent-on-notional
check('ES notional 5000 ×2', calculateFuturesNotional(5000, 50, 2), 500000);
check('ES pnl% on notional', (1000 / calculateFuturesNotional(5000, 50, 2)) * 100, 0.2);

// Zero/guard inputs never throw or produce NaN
check('guard entry=0', calculateFuturesPnL('long', 0, 5010, 50, 2), 0);
check('guard contracts=0', calculateFuturesPnL('long', 5000, 5010, 50, 0), 0);
check('guard notional missing', calculateFuturesNotional(5000, 50, 0), 0);

// ── Catalog integrity ──────────────────────────────────────────────
ok('catalog non-empty', FUTURES_CONTRACTS.length >= 10);
ok('getContractSpec case-insensitive', getContractSpec('es')?.symbol === 'ES');
ok('getContractSpec unknown → null', getContractSpec('NOPE') === null);
ok('getContractSpec empty → null', getContractSpec('') === null);

const symbols = new Set();
for (const c of FUTURES_CONTRACTS) {
  ok(`${c.symbol}: pointValue > 0`, typeof c.pointValue === 'number' && c.pointValue > 0);
  ok(`${c.symbol}: tickSize > 0`, typeof c.tickSize === 'number' && c.tickSize > 0);
  ok(`${c.symbol}: has name`, typeof c.name === 'string' && c.name.length > 0);
  ok(`${c.symbol}: unique`, !symbols.has(c.symbol));
  symbols.add(c.symbol);
}

// Known point values from CME specs (the source of truth for dollar P&L)
const KNOWN = { ES: 50, MES: 5, NQ: 20, MNQ: 2, CL: 1000, GC: 100, SI: 5000 };
for (const [sym, pv] of Object.entries(KNOWN)) {
  check(`${sym} point value`, getContractSpec(sym)?.pointValue, pv);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
