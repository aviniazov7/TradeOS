# TradeOS public API (v1)

Base URL: `https://trade-os.tradeos.workers.dev`

Trade, journal, and stats endpoints accept either credential:

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

## GET /api/v1/journals

Lists the journals (accounts) owned by the caller. Each row has `id`, `name`, and `exchange` — the broker, such as `MEXC`, `bybit`, or `Vantage` — plus `assetClass`, `currency`, `initialBalance`, `archived`, `starred`, and `isDefault`. Starred journals come first, then name. An empty account list is `{ "journals": [] }`.

Journals are read with a collection list under `users/{uid}/journals`. No composite index is required. Another user's journals are not included.

```bash
curl -s https://trade-os.tradeos.workers.dev/api/v1/journals \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "journals": [ { "id": "JOURNAL_ID", "name": "MEXC", "exchange": "MEXC", "initialBalance": 1000, "starred": true } ] }
```

## POST /api/v1/trades

Adds a trade to a journal you own. Pass `journalId`, or `journal` (the journal's name, or its id). One of them is required. Omitting both is `400` with `journalId is required` — the same rejection as before. The Worker does not pick a default journal.

`journal` is trimmed and matched without case sensitivity. An exact id wins when the string equals a journal id. Two journals with the same name are `409` (`journal name is ambiguous: id1, id2`). A name or id that is not one of your journals is `404`. When both fields are sent, they must refer to the same journal.

The Worker validates the payload the same way `firestore.rules` validates a client create (service-account writes bypass rules), then stores the same derived fields the journal writes: `pnl`, `netPnl`, `pnlPercent`, `rrRatio`, `result`, `positionSize`, `margin`, `createdAt`, `updatedAt`.

`pnl`, `netPnl`, `pnlPercent`, and `result` are computed from the entry, the exit, the size, and fees. A `pnlFromExchange` field on the request is ignored and is not stored. Trades imported from an exchange inside the app still keep that exchange's settled P&L. This API does not take that path.

If `riskAmount` is omitted or 0, and the entry, stop, and size can price the risk, that dollar amount is stored. The UI then shows the real risk instead of $0.00.

`status` may be omitted: an exit price (or exits that close the position) becomes `closed`, partial exits become `partial`, otherwise `open`. `fees` defaults to 0, `leverage` to 1 (crypto and stocks). Futures (`assetClass: "futures_cme"`) require `contract.contracts`, `contract.pointValue`, and `contract.tickSize`.

Optional header `Idempotency-Key` (8–128 printable characters). The handler reserves one trade id on that key before it writes the trade. A repeat returns that same trade and does not write another one, including when the first attempt saved the trade but could not mark the key complete. The first response is `201`. A replay is `200` with `idempotentReplay: true`. A second request that arrives while the first is still in progress, before a trade has been stored, is `409` for 60 seconds. After that the same reserved id is used again, so a late retry still cannot create a second trade.

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

Query parameters (all optional): `journalId`, `journal` (name or id), `status` (`open` | `closed` | `partial`), `pair`, `direction` (`long` | `short`), `from`, `to`, `limit` (1–100, default 50), `cursor`, `order`.

Omitting `journalId` and `journal` lists every journal, as before. Passing either one limits the page to that account and `404`s when it is not yours. A cursor stays tied to the resolved journal id, so repeat the same filter on the next page.

Results are ordered by **entryDate descending** (newest first). The same entry date ties break by document id, also descending. `order=asc` reverses both: oldest entry date first, and a lower document id first when the dates match. Any other `order` value is `400`.

`from` / `to` filter on **entry** date while the ordered scan runs (at most 500 documents per call). `nextCursor` is null when there is nothing left. The cursor is opaque and only valid with the same filters and the same `order`; a cursor from a different query is `400`.

Trades with no `entryDate` are omitted. Firestore's `orderBy` skips documents that do not have the field. Trades written by the app and by this API always store `entryDate`.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/trades?journalId=JOURNAL_ID&status=closed&from=2026-06-01&to=2026-06-30&limit=50" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "trades": [ { "id": "…", "pair": "BTCUSDT", "netPnl": 4.5 } ], "nextCursor": null }
```

Pass `cursor` from the previous response to read the next page. A list with no equality filter uses the automatic single-field index on `entryDate`. Filtering by `journalId`, `status`, `pair`, or `direction` needs the composite indexes in `firestore.indexes.json` (one per filter field, both directions). Firestore merges those indexes when a query uses more than one equality. The document-id tie-break is the same direction as `entryDate`, so `__name__` is not an extra index field. `GET /api/v1/stats` still walks trades by document id and does not need these indexes.

Agents can call the same operations over MCP. See [MCP.md](./MCP.md).

## DELETE /api/v1/trades/{id}

Deletes one trade. The id is read under `users/{uid}/trades/{id}`, so another user's trade is `404`, not deleted. A second delete of the same id is `404`. `..` and a slash in the id are `400`.

This is the same write the journal screen makes. The trade document is removed, then the legacy screenshot docs `users/{uid}/tradeImages/{id}_0` … `{id}_3` are removed (a missing slot is a no-op, and a screenshot failure does not bring the trade back). Stats, balance, and return are not stored on the journal. `GET /api/v1/stats` and the dashboard both sum the trades that remain, and `journal.initialBalance` is left as it is.

```bash
curl -s -X DELETE https://trade-os.tradeos.workers.dev/api/v1/trades/TRADE_ID \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "id": "TRADE_ID", "deleted": true }
```

## GET /api/v1/stats

Pass `journalId` or `journal` (name or id). One of them is required. Omitting both is `400` with `journalId is required` — stats are not combined across journals. `period` is `all` (default), `week`, `month`, or `year` — the same windows as the dashboard. `from` and `to`, when set, replace `period`.

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

- `returnPercent` is the same account return the journal shows: measurable closed P&L divided by the balance the period opened at (`journal.initialBalance`, plus P&L booked before the window). Trades taken after that balance was wiped out are left out. It is not P&L divided by position size. It is `null` when that balance is missing, zero, negative, or dust (under one cent, including a withdrawn wallet that still reports ~1e-8). That is not a 0% return and not a position return.
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

2. Composite indexes for the ordered trade list (this does not deploy from CI):

   ```bash
   firebase deploy --only firestore:indexes --project tradeos-91a58
   ```

   Wait until each new `trades` index shows Enabled in the Firebase console. Until then, `GET /api/v1/trades` with `journalId`, `status`, `pair`, or `direction` fails (the Worker logs a Firestore `FAILED_PRECONDITION`). An unfiltered list and `GET /api/v1/stats` work without these indexes. If a combined filter still asks for an index, create the exact composite from that error. The eight `trades` indexes in `firestore.indexes.json` are the ones index merging needs (each equality field with `entryDate`, ascending and descending).

3. The Worker and hosting deploy from GitHub Actions when the commit reaches `main`. Only `main` deploys the Workers. No new secret is required. The MCP route is the same Worker: `https://trade-os.tradeos.workers.dev/mcp`. Listing journals, matching a journal by name, and deleting a trade do not add a Firestore index: journals are a collection list, the name is matched in the Worker, and delete is a single document.

4. No `wrangler deploy` from a laptop. The local Wrangler login is the personal Cloudflare account, which does not own `trade-os`.
