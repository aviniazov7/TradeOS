# Spec — Futures Contracts (CME) Support

**Status:** Draft · **Epic:** #32 · **Author:** Avraham Niazov · **Date:** 2026-06-10

Tracking issues: #26 #27 #28 #29 #30 #31

---

## 1. Summary

Add support for journaling **CME index & commodity futures** (ES, NQ, CL, GC, …)
alongside the existing crypto-perpetual journal. The user picks their asset
class in the profile, and the app adapts: symbol catalog, trade form, P&L math,
and analytics.

This was chosen over full multi-asset / stocks support because it reuses the
existing leveraged-contract engine almost entirely. Stocks + broker APIs are a
much larger, more uncertain project (Israeli brokers have no public API; US
broker integrations and paid market data add real cost). Futures give most of
the "multi-asset" value at a fraction of the effort and risk.

## 2. Current state (verified in code)

| Area | Today | Implication |
|---|---|---|
| `marketType` on trades | always `'futures'` | a natural hook for `assetClass` |
| P&L (`calculations.js`) | `(exit−entry) × quantity` | generic; needs a point-value variant |
| Symbols | `COINS` (65 crypto) in `constants.js` | needs a parallel futures catalog |
| Prices | CoinGecko / Binance via worker proxy | no futures feed yet |
| Trade form | leverage 10x default, USDT pairs, funding | crypto-shaped; needs an adaptive mode |

Conclusion: the core is generic. This is an **abstraction-layer** project, not a
rewrite.

## 3. The one essential difference — P&L by point value

Crypto: `pnl = (exit − entry) × quantity`.

CME futures: `pnl = (exit − entry) × pointValue × contracts`.

`pointValue` is fixed per contract:

| Contract | Point value | Tick size |
|---|---|---|
| ES (S&P 500) | $50 | 0.25 |
| MES (Micro ES) | $5 | 0.25 |
| NQ (Nasdaq 100) | $20 | 0.25 |
| MNQ (Micro NQ) | $2 | 0.25 |
| YM (Dow) | $5 | 1.0 |
| RTY (Russell 2000) | $50 | 0.10 |
| CL (Crude Oil) | $1,000 | 0.01 |
| MCL (Micro Crude) | $100 | 0.01 |
| GC (Gold) | $100 | 0.10 |
| SI (Silver) | $5,000 | 0.005 |
| NG (Nat Gas) | $10,000 | 0.001 |

> ⚠️ These values are the source of truth for dollar P&L — they must be verified
> against current CME contract specs before shipping (#27).

**Worked example:** ES long, entry 5000 → exit 5010, 2 contracts:
`(5010 − 5000) × $50 × 2 = +$1,000`.

## 4. Data model (#26)

**Profile (settings):** `assetClass: 'crypto' | 'futures_cme'` (default `crypto`).

**Trade:** add
- `assetClass: 'crypto' | 'futures_cme'` (missing ⇒ `crypto`, for back-compat)
- `contract?: { symbol, pointValue, tickSize, contracts }` (futures only)

**Back-compat is non-negotiable:** every existing trade has no `assetClass`, so
all read/compute paths treat missing as `crypto` and behave exactly as today.

**Firestore rules:** `isValidTrade()` must accept both shapes — keep the crypto
branch (`leverage 1–200`, etc.) and add a futures branch (`contracts > 0`, no
leverage requirement). Rules changes need a manual
`firebase deploy --only firestore:rules`.

## 5. P&L engine (#28)

Branch the calc layer on `assetClass`:
- Futures: `pnl = (exit − entry) × pointValue × contracts`, direction-aware,
  partial-exit-aware.
- R:R is already unit-agnostic (`|exit−entry| / |entry−stop|`) — verify.
- `pnlPercent`: for futures, return-on-margin if margin is known, otherwise omit
  rather than show a misleading crypto-style ROE.
- Crypto path stays byte-for-byte unchanged.

## 6. Adaptive trade form (#29)

When `assetClass === 'futures_cme'`:
- Symbol picker from `FUTURES_CONTRACTS` (#27), not `COINS`.
- **# of contracts** instead of leverage; show `pointValue` as read-only.
- Live estimated $ P&L from the point value.
- Hide crypto-only fields (funding, USDT quoting).
- Keep journal / notes / strategy / mentality fields shared.

## 7. Profile & analytics (#30)

- Asset-class selector in the profile; drives defaults + which catalog loads.
- Per-asset defaults (contracts=1 vs leverage=10).
- Dashboard/analytics: hide/relabel crypto-only metrics for futures; keep the
  asset-agnostic ones (P&L, win rate, R:R, expectancy, drawdown).
- Crypto users see zero change by default.

## 8. Price data (#31) — the open risk

Crypto prices are free; **futures data is the hard part** (mostly paid or
10–15 min delayed; licensing varies). v1 can ship with **manual price entry**
and add a feed later. Research deliverable: a short comparison (provider, delay,
cost, ToS) for Yahoo continuous (`ES=F`), Twelve Data, Databento, Finnhub, then
a recommendation. If green-lit, add a worker `/fut/…` route mirroring the
existing `/cg/` + `/bnb/` cache pattern. **Non-blocking** for the rest of the epic.

## 9. Phasing

1. #26 Data model (foundation)
2. #27 Catalog
3. #28 P&L engine
4. #29 Adaptive form
5. #30 Profile + analytics
6. #31 Price feed — researched in parallel, integrated last

## 10. Non-goals (v1)

Broker auto-sync, options, TASE/stocks, real-time CME data licensing. Each is
tracked separately if pursued.

## 11. Risks

- **Market data cost/licensing** (#31) — the main unknown; mitigated by
  manual-entry-first.
- **Regression to the crypto path** — mitigated by the `assetClass` branch +
  explicit regression checks in every issue's acceptance criteria.
- **Wrong contract specs** — mitigated by verifying #27 against CME before ship.
