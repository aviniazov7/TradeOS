# TradeOS public API (v1)

Base URL: `https://trade-os.tradeos.workers.dev`

The three trade endpoints accept either credential:

- `Authorization: Bearer tos_…` — a per-user API key (for agents)
- `Authorization: Bearer <Firebase ID token>` — the signed-in user

Key management (`/api/v1/keys`) accepts only a Firebase ID token. An API key cannot mint or revoke keys.

Responses are JSON. Errors are `{ "error": "…" }` with status 400, 401, 403, 404, 409, 429, or 502. Authenticated calls are limited to 60 per minute per user (in-memory edge counter — a request does not write Cloudflare KV). Key creation is also limited to 10 per hour, and at most 10 keys can be active.

Dates in responses are ISO-8601. Send dates as ISO-8601 or as `YYYY-MM-DD` (a local calendar day).

## Create a key

From the app: Profile → API → מפתח חדש. The full secret is shown once.

With curl, using a Firebase ID token from the signed-in client (`user.getIdToken()`):

```bash
curl -s -X POST https://trade-os.tradeos.workers.dev/api/v1/keys \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Agent"}'
```

```json
{
  "id": "3f1c…",
  "key": "tos_…",
  "name": "Agent",
  "prefix": "tos_abc12345",
  "createdAt": "2026-06-15T12:00:00.000Z"
}
```

The Worker stores only the SHA-256 of `key`, in `apiKeyIndex/{hash}`, which clients cannot read. `users/{uid}/apiKeys/{id}` holds the name, prefix, and timestamps. Revoke deletes the hash index; a revoked key stops working immediately.

```bash
curl -s https://trade-os.tradeos.workers.dev/api/v1/keys \
  -H "Authorization: Bearer $ID_TOKEN"

curl -s -X DELETE https://trade-os.tradeos.workers.dev/api/v1/keys/$KEY_ID \
  -H "Authorization: Bearer $ID_TOKEN"
```

## POST /api/v1/trades

Adds a trade to a journal you own. `journalId` is required. The Worker validates the payload the same way `firestore.rules` validates a client create (service-account writes bypass rules), then stores the same derived fields the journal writes: `pnl`, `netPnl`, `pnlPercent`, `rrRatio`, `result`, `positionSize`, `margin`, `createdAt`, `updatedAt`.

If `riskAmount` is omitted or 0, and the entry, stop, and size can price the risk, that dollar amount is stored. The UI then shows the real risk instead of $0.00.

`status` may be omitted: an exit price (or exits that close the position) becomes `closed`, partial exits become `partial`, otherwise `open`. `fees` defaults to 0, `leverage` to 1 (crypto and stocks). Futures (`assetClass: "futures_cme"`) require `contract.contracts`, `contract.pointValue`, and `contract.tickSize`.

Optional header `Idempotency-Key` (8–128 printable characters). A repeat of the same key returns the original trade and does not write another one. The first response is `201`; a replay is `200` with `idempotentReplay: true`.

```bash
curl -s -X POST https://trade-os.tradeos.workers.dev/api/v1/trades \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: agent-trade-001" \
  -d '{
    "journalId": "JOURNAL_ID",
    "pair": "BTCUSDT",
    "direction": "long",
    "entryPrice": 64000,
    "exitPrice": 64500,
    "quantity": 0.01,
    "stopLoss": 63500,
    "leverage": 10,
    "fees": 0.5
  }'
```

```json
{ "id": "…", "trade": { "id": "…", "pnl": 5, "netPnl": 4.5, "riskAmount": 5, "result": "win" } }
```

## GET /api/v1/trades

Query parameters (all optional): `journalId`, `status` (`open` | `closed` | `partial`), `pair`, `direction` (`long` | `short`), `from`, `to`, `limit` (1–100, default 50), `cursor`.

`from` / `to` filter on **entry** date. `nextCursor` is null when there is nothing left.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/trades?journalId=JOURNAL_ID&status=closed&from=2026-06-01&to=2026-06-30&limit=50" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "trades": [ { "id": "…", "pair": "BTCUSDT", "netPnl": 4.5 } ], "nextCursor": null }
```

Pass `cursor` from the previous response to read the next page. No composite Firestore index is required: equality filters are queried, and the date window is applied while scanning (at most 500 documents per call).

## GET /api/v1/stats

`journalId` is required. `period` is `all` (default), `week`, `month`, or `year` — the same windows as the dashboard. `from` and `to`, when set, replace `period`.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/stats?journalId=JOURNAL_ID&period=month" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "journalId": "JOURNAL_ID",
  "period": "month",
  "initialBalance": 1000,
  "counts": { "total": 12, "closed": 10, "open": 2, "partial": 0, "wins": 6, "losses": 3, "breakeven": 1 },
  "winRate": 66.666,
  "totalPnl": 150.5,
  "startBalance": 1000,
  "currentBalance": 1150.5,
  "returnPercent": 15.05,
  "riskAmount": 420,
  "profitFactor": 1.8,
  "profitFactorInfinite": false,
  "expectancy": 15.05,
  "avgR": 0.42,
  "maxDrawdown": 4.2,
  "maxDrawdownAmount": 48,
  "truncated": false
}
```

- `returnPercent` is net P&L divided by the account equity the period opened at (`journal.initialBalance`, plus P&L booked before the window). It is not P&L divided by position size. It is `null` when that equity is missing, zero, negative, or dust (under one cent, including a withdrawn wallet that still reports ~1e-8). That is not a 0% return and not a position return.
- `riskAmount` is the sum of each closed trade's real dollar risk: `|entry − stop| × size`, using a declared `riskAmount` only when the stop cannot price it. A stored `riskAmount` of 0 does not zero this figure.
- `avgR` is the journal header average: mean signed net R (net P&L / initial risk) of closed trades that had a defined risk. `null` when none did.
- `winRate` excludes breakevens, matching the dashboard.
- `maxDrawdown` is a percent of account equity, or `null` without an opening balance. `maxDrawdownAmount` is the dollar drawdown either way.
- `truncated` is true if the journal has more than 5000 trades and the stats used the first 5000.

## Local test

```bash
# .dev.vars is gitignored. Paste the Firebase service account JSON on one line.
echo "FIREBASE_SERVICE_ACCOUNT={...}" > .dev.vars
npx wrangler dev
```

`wrangler dev` serves the Worker on `http://localhost:8787`. Point the curls above at that origin. The Vite app reads `VITE_WORKER_URL` (default `https://trade-os.tradeos.workers.dev`); set it to the local Worker if you want the Profile screen to create keys against it.

The service account is the same `FIREBASE_SERVICE_ACCOUNT` secret the production Worker already has. Do not commit it.

## What the owner deploys

This PR does not deploy.

1. Firestore rules (CI cannot deploy them — the service account lacks `serviceusage.serviceUsageViewer`):

   ```bash
   firebase deploy --only firestore:rules --project tradeos-91a58
   ```

   Until this runs, the Profile key list cannot read `users/{uid}/apiKeys`, and clients still cannot read `apiKeyIndex`.

2. The Worker and hosting deploy from GitHub Actions when the commit reaches `main` (production) or `dev` (Worker staging flag, but the HTTP Worker `trade-os` is the production worker — treat a Worker change on `dev` as production). No new secret and no composite index are required.

3. No `wrangler deploy` from a laptop. The local Wrangler login is the personal Cloudflare account, which does not own `trade-os`.
