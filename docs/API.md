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

Lists the journals owned by the caller: live trading accounts and backtest journals. Starred rows come first, then name. An empty list is `{ "journals": [] }`.

Every row has `id`, `name`, `type` (`"live"` or `"backtest"`), and `isBacktest` (boolean). Live rows are otherwise unchanged: `exchange` (the broker, such as `MEXC`, `bybit`, or `Vantage`), `assetClass`, `currency`, `initialBalance`, `archived`, `starred`, and `isDefault`. `type` and `isBacktest` are the only fields added to a live row.

A backtest row uses the same keys so a client can render one list. It has no broker and no opening balance, so `exchange` and `currency` are `""`, `assetClass` and `initialBalance` are `null`, and `archived` and `starred` are `false`. `isDefault` is the stored flag. The row also includes `description`, `createdAt`, and `updatedAt`. Strategy text (entry rules, checklist, chart examples) stays in the app and is not on this list.

Optional `type` is `live` or `backtest`. Omit it to return both. Any other value is `400` (`type must be live or backtest`). `includeArchived` and `mode` are not filters: archived live journals are already included (`archived: true`), and backtest journals have no archive flag.

Live journals are a collection list under `users/{uid}/journals`. Backtest journals are a collection list under `users/{uid}/backtestJournals`. No composite index is required. Another user's journals are not included. There is no write API for backtest journals. `GET /api/v1/backtests` and `GET /api/v1/backtest/journals` stay `405`.

```bash
curl -s https://trade-os.tradeos.workers.dev/api/v1/journals \
  -H "Authorization: Bearer $API_KEY"

curl -s "https://trade-os.tradeos.workers.dev/api/v1/journals?type=backtest" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "journals": [
    { "id": "JOURNAL_ID", "name": "MEXC", "exchange": "MEXC", "initialBalance": 1000, "starred": true, "type": "live", "isBacktest": false },
    {
      "id": "BACKTEST_JOURNAL_ID",
      "name": "BTC backtest",
      "exchange": "",
      "assetClass": null,
      "currency": "",
      "initialBalance": null,
      "archived": false,
      "starred": false,
      "isDefault": true,
      "type": "backtest",
      "isBacktest": true,
      "description": "trendline",
      "createdAt": "2026-05-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

## GET /api/v1/plans

Lists the trading plans stored at `users/{uid}/tradingPlans`. Read-only. Active plans come first, then name. Another user's plans are not included. An empty list is `{ "plans": [] }`.

Each row is a summary: `id`, `name`, `description`, `isActive`, `color`, `pairs`, `timeframes`, `sessions`, `maxDailyLoss`, `maxPositions`, `createdAt`, `updatedAt`. The long rule text is on `GET /api/v1/plans/{id}`.

`POST`, `PATCH`, and `DELETE` are `405`. No composite index is required.

```bash
curl -s https://trade-os.tradeos.workers.dev/api/v1/plans \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "plans": [
    {
      "id": "PLAN_ID",
      "name": "London ORB",
      "description": "open drive",
      "isActive": true,
      "color": "#06b6d4",
      "pairs": ["BTCUSDT"],
      "timeframes": ["15m"],
      "sessions": ["London"],
      "maxDailyLoss": 3,
      "maxPositions": 2,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-02T00:00:00.000Z"
    }
  ]
}
```

## GET /api/v1/plans/{id}

One plan the key owns, with every field stored on the document. A missing id and another user's id are both `404` (`plan not found`). `..` and a slash in the id are `400`.

The plan form does not store a field named `setups`. The names people use map onto the stored fields like this:

| Asked for | Stored field |
|---|---|
| Rules | `entryRules`, `exitRules`, `checklist`, `mistakesToAvoid` |
| Risk | `riskManagement`, `maxDailyLoss`, `maxPositions` |
| Sessions | `sessions` |
| Setups | *(not stored)* — markets are `pairs` and `timeframes` |

Also stored, and returned: `description`, `goals`, `notes`, `marketConditions`, `dailyRoutine`, `tradeManagement`, `tradeExamples` (`title`, `chartUrl`, `description`), `color`, `isActive`, `createdAt`, `updatedAt`, plus any older key still on the document.

```bash
curl -s https://trade-os.tradeos.workers.dev/api/v1/plans/PLAN_ID \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "plan": {
    "id": "PLAN_ID",
    "name": "London ORB",
    "entryRules": "wait for the range",
    "exitRules": "first target",
    "riskManagement": "1% per trade",
    "sessions": ["London"],
    "checklist": ["HTF bias"],
    "mistakesToAvoid": ["revenge"],
    "maxDailyLoss": 3,
    "maxPositions": 2
  }
}
```

## GET /api/v1/daily-journals

Reads the caller's morning and evening entries (`users/{uid}/morningJournals` and `users/{uid}/eveningJournals`). Read-only. Business-ledger and notebook documents are not included.

`from` and `to` are inclusive calendar days (`YYYY-MM-DD`, or an ISO timestamp whose date prefix is used). They match the entry's `date`. `kind` is `morning` or `evening`; omit it for both. Newest date first. The same date lists the morning entry before the evening entry.

`journalId` or `journal`, when set, must be a live journal the key owns (`404` otherwise). Morning and evening entries are not stored on a trading journal, so the filter does not narrow the list. The response says so with `filteredByJournal: false` and echoes `journalId` (`null` when omitted).

Each entry is the stored document plus `id` and `kind`. Morning fields include `emotion`, `readinessLevel`, `sleepQuality`, `marketBias`, `mainGoal`, `focusToday`, `rulesChecked`, and `rulesPlanName`. Evening fields include `dayRating`, `emotionAfter`, `emotionsAfter`, `planAdherence`, `followedPlan`, `lessonsLearned`, `whatWentWell`, `whatDidntGoWell`, and `gratitude`.

`POST` is `405`.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/daily-journals?from=2026-06-01&to=2026-06-30&kind=morning" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "journalId": null,
  "filteredByJournal": false,
  "entries": [
    { "id": "ENTRY_ID", "kind": "morning", "date": "2026-06-02", "emotion": "calm", "sleepQuality": "good", "mainGoal": "one setup" }
  ]
}
```

## GET /api/v1/risk-rules

Reads risk rules for the caller's live journals and whether they are breached now. Read-only. Omit `journalId` to list every live journal. Pass `journalId` or `journal` for one. A backtest journal is `400` (`risk rules apply to live journals`). Another user's journal is `404`.

`riskRules` and `dailyLossAlert` are the objects stored on the journal (`null` when the journal has never saved them). `status` is the same measurement the journal screen uses, against closed trades, on the Asia/Jerusalem clock:

- `weeklyLoss`, `dailyLossPercent`, `weeklyLossPercent`, `maxTrades`, `tradingHours` — from `journal.riskRules`
- `dailyLossAlert` — from `journal.dailyLossAlert` (`show` is true when today's loss has reached the dollar cap)
- `breached` — true when any enabled rule is breached or the daily alert is showing

`truncated` is true when the trade scan stopped at 5000 documents. No new Firestore index. `POST` is `405`.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/risk-rules?journalId=JOURNAL_ID" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "journals": [
    {
      "journalId": "JOURNAL_ID",
      "name": "MEXC",
      "riskRules": { "weeklyLoss": { "enabled": true, "amount": 100 }, "maxTradesPerDay": { "enabled": true, "count": 3 } },
      "dailyLossAlert": { "enabled": true, "amount": 80 },
      "status": {
        "dayKey": "2026-06-15",
        "breached": true,
        "weeklyLoss": { "enabled": true, "breached": true, "loss": 110, "cap": 100 },
        "dailyLossAlert": { "show": true, "loss": 110, "amount": 80 }
      },
      "truncated": false
    }
  ]
}
```

## POST /api/v1/trades

Adds a trade to a journal you own. Pass `journalId`, or `journal` (the journal's name, or its id). One of them is required. Omitting both is `400` with `journalId is required` — the same rejection as before. The Worker does not pick a default journal.

`journal` is trimmed and matched without case sensitivity. An exact id wins when the string equals a journal id. Two journals with the same name are `409` (`journal name is ambiguous: id1, id2`). A name or id that is not one of your journals is `404`. When both fields are sent, they must refer to the same journal.

The Worker validates the payload the same way `firestore.rules` validates a client create (service-account writes bypass rules), then stores the same derived fields the journal writes: `pnl`, `netPnl`, `pnlPercent`, `rrRatio`, `result`, `positionSize`, `margin`, `createdAt`, `updatedAt`.

`pnl`, `netPnl`, `pnlPercent`, and `result` are computed from the entry, the exit, the size, and fees. A `pnlFromExchange` field on the request is ignored and is not stored. Trades imported from an exchange inside the app still keep that exchange's settled P&L. This API does not take that path.

If `riskAmount` is omitted or 0, and the entry, stop, and size can price the risk, that dollar amount is stored. The UI then shows the real risk instead of $0.00.

`status` may be omitted: an exit price (or exits that close the position) becomes `closed`, partial exits become `partial`, otherwise `open`. `fees` defaults to 0, `leverage` to 1 (crypto and stocks). Futures (`assetClass: "futures_cme"`) require `contract.contracts`, `contract.pointValue`, and `contract.tickSize`.

`custom` is optional. It is an object of field id (`f1`, `f2`, …) to a string or number. The ids and values are checked against the caller's `settings/customTradeFields` document (each field has `name`, `type` of `text`, `number`, or `select`, and `options` when the type is `select`). A text value is at most 80 characters. A number has to be finite. A select value has to be one of that field's options. An unknown id, a value of the wrong type, or a select value that is not an option is `400` (`custom.<id> …`) and nothing is written. Omit `custom` and the stored trade has no `custom` field, the same shape as every trade written before the field existed. `custom: {}` also stores no answers.

The owner's `GET` and `POST` responses include `custom` when the trade has answers. A shared journal does not. Sharing never copies `custom`.

`trigger` is the entry trigger (a string, at most 80 characters). `setups` is the older list of setup names (at most 8 strings, 40 characters each). The trade form no longer writes `setups`; it writes `trigger`. `POST` and `PATCH` still accept both. Omitting `setups` on `PATCH` leaves the stored list as it is. Sending `setups` still replaces that list. Nothing here rewrites existing trades.

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

A trade that has custom-field answers includes `custom` (`{ "f1": "לונדון" }`). A trade without answers omits `custom`. That is the key owner's list. A shared journal still does not include `custom`.

### Backtest trades

`journalId` or `journal` may name a backtest journal. `type=backtest` lists the caller's backtest trades (every backtest journal when no journal is passed). `type=live` is the live list. Omitting `type` and the journal filter stays the live list above, so existing clients keep the same pages.

Backtest trades are read from `users/{uid}/backtests`, where the app stores them, and kept when `backtestJournalId` equals that journal. The scan is the same document-id walk as `GET /api/v1/stats` (no composite index), then the page is ordered by `date` (`createdAt` when `date` is missing). Undated rows are last. The same timestamp ties break by document id, in the same direction as `order`. `from` / `to` filter that date. `pair` and `direction` filter the stored values. `status` does not apply (`400`, `status does not apply to backtest trades`). A backtest journal with `type=live`, or a live journal with `type=backtest`, is `400` (`journal type does not match type filter`).

A backtest row is the stored document plus `id`, `type: "backtest"`, `isBacktest: true`, and `journalId`. `journalId` repeats `backtestJournalId` so it matches the query. The response also includes `truncated` (`true` when the scan stopped at 5000 documents) and `nextCursor`.

The names used in the product map onto the fields the backtest screen writes:

| Product | Stored field | Meaning |
|---|---|---|
| Setup | `strategy` | Strategy name. The entry trigger is the separate field `trigger`. |
| Session | `session` | `Asia`, `London`, `London/NY Overlap`, `New York`, or a custom session. |
| Stop distance | `stopDistancePct` | Stop distance as a percent of price, not a price delta. |
| R | `rResult` | Final R of the trade. |
| Max R | `maxR` | Highest R reached before the close. |
| 3R result | *(not stored)* | There is no 3R column. The trade reached 3R when `maxR >= 3`. |
| Tags | *(not stored)* | Live trades store `tags`. A backtest document does not. |

Other stored fields are returned as well: `pair`, `direction`, `timeframe`, `result` (`win`, `loss`, or `breakeven`), `date`, `notes`, `entryChartUrl`, `managementChartUrl`, `createdAt`, `updatedAt`, and any older keys still on the document (for example `screenshots`). `POST`, `PATCH`, and `DELETE` do not accept a backtest journal or a backtest trade. Those ids are `404` and the backtest document is left as it is.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/trades?journalId=JOURNAL_ID&status=closed&from=2026-06-01&to=2026-06-30&limit=50" \
  -H "Authorization: Bearer $API_KEY"

curl -s "https://trade-os.tradeos.workers.dev/api/v1/trades?journalId=BACKTEST_JOURNAL_ID&limit=50" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "trades": [ { "id": "…", "pair": "BTCUSDT", "netPnl": 4.5 } ], "nextCursor": null }
```

```json
{
  "trades": [
    {
      "id": "BACKTEST_TRADE_ID",
      "backtestJournalId": "BACKTEST_JOURNAL_ID",
      "journalId": "BACKTEST_JOURNAL_ID",
      "type": "backtest",
      "isBacktest": true,
      "pair": "BTCUSDT",
      "direction": "long",
      "strategy": "Trendline Break",
      "trigger": "CHoCH",
      "timeframe": "4H",
      "session": "London",
      "date": "2026-06-02T13:00:00.000Z",
      "stopDistancePct": 0.9,
      "maxR": 5.7,
      "rResult": 2.4,
      "result": "win",
      "notes": "retest",
      "entryChartUrl": "https://charts.example/entry",
      "managementChartUrl": ""
    }
  ],
  "nextCursor": null,
  "truncated": false
}
```

Pass `cursor` from the previous response to read the next page. A list with no equality filter uses the automatic single-field index on `entryDate`. Filtering by `journalId`, `status`, `pair`, or `direction` needs the composite indexes in `firestore.indexes.json` (one per filter field, both directions). Firestore merges those indexes when a query uses more than one equality. The document-id tie-break is the same direction as `entryDate`, so `__name__` is not an extra index field. `GET /api/v1/stats` still walks trades by document id and does not need these indexes.

Agents can call the same operations over MCP. See [MCP.md](./MCP.md).

## PATCH /api/v1/trades/{id}

Updates one trade the key owns. The id is read under `users/{uid}/trades/{id}`, so a missing id and another user's id are both `404` (`trade not found`). Nothing in the body is applied in that case. `..` and a slash in the id are `400` (`invalid trade id`).

The body is a JSON object with at least one field. `{}` is `400` (`body must include at least one field`). Only fields `POST /api/v1/trades` accepts are editable, including the `journal` alias and `custom`. `id` and `createdAt` are immutable (`400`, `<field> is immutable`). Derived fields (`pnl`, `netPnl`, `pnlPercent`, `rrRatio`, `result`, `positionSize`, `margin`, `updatedAt`, `pnlFromExchange`) and any other key are `400` (`<field> is not editable`). Types and ranges are the same checks as create. A field you omit is left as stored.

`custom` replaces the whole answer map and is checked against the current field definitions. `{}` removes `custom` from the trade. Omit `custom` and the stored answers stay, including a select value that is no longer one of the options. Sending `custom` again with that same stored select value is accepted. A new value that is not an option is `400`. An answer whose field was deleted is dropped the next time the trade is rewritten without a new `custom` object.

The Worker merges the patch onto the stored trade, validates that merged trade the same way as create, and rewrites `pnl`, `netPnl`, `pnlPercent`, `rrRatio`, `result`, `positionSize`, and `margin`. `riskAmount` is derived again when the merged value is omitted or 0. `updatedAt` is the time of this write. `createdAt` stays the stored timestamp, even when `entryDate` changes. A stored `pnlFromExchange` is cleared so later reads use the price-based P&L. The update is one Firestore write. If that write fails, the trade is unchanged (`502`, `failed to write trade`).

`journalId` or `journal` moves the trade only when that journal is yours. A journal that is not yours is `404`. When both are sent, they must name the same journal.

```bash
curl -s -X PATCH https://trade-os.tradeos.workers.dev/api/v1/trades/TRADE_ID \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"exitPrice":120,"fees":1}'
```

```json
{ "id": "TRADE_ID", "trade": { "id": "TRADE_ID", "pair": "BTCUSDT", "exitPrice": 120, "netPnl": 39, "updatedAt": "2026-06-16T12:00:00.000Z" } }
```

The response is `200` and the trade object has the same shape as `POST`.

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

Pass `journalId` or `journal` (name or id) of a live journal or a backtest journal. One of them is required. Omitting both is `400` with `journalId is required` — stats are not combined across journals. A name that matches one live journal and one backtest journal is `409`. The same document id in both collections is `409` (`journal id is ambiguous`); a write still targets the live journal only. `period` is `all` (default), `week`, `month`, or `year` — the same windows as the dashboard. `from` and `to`, when set, replace `period`.

A live journal is unchanged apart from two added fields, `type: "live"` and `isBacktest: false`. A backtest journal reads `users/{uid}/backtests` for that `backtestJournalId` and scores `result` and `rResult` the way the backtest screen does. Dollar fields are `null` (a backtest trade does not store P&L or a balance). `counts.closed` equals `counts.total` because a backtest row has no open or partial status. `winRate` excludes breakevens. `avgR` is the mean of `rResult` (a missing value counts as 0) and is `null` when the window has no trades. `totalR`, `bestR`, and `worstR` are that same R. `profitFactor` is the screen's R profit factor (sum of positive `rResult` divided by the absolute sum of negative `rResult`), not a dollar profit factor. `maxDrawdownR` is the peak-to-trough of cumulative `rResult` in date order. `maxDrawdown` and `maxDrawdownAmount` stay `null`. The per-strategy, session, pair, and timeframe tables on the backtest screen are not in this object.

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/stats?journalId=JOURNAL_ID&period=month" \
  -H "Authorization: Bearer $API_KEY"

curl -s "https://trade-os.tradeos.workers.dev/api/v1/stats?journalId=BACKTEST_JOURNAL_ID&period=all" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "journalId": "JOURNAL_ID",
  "type": "live",
  "isBacktest": false,
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

Optional `groupBy` is `session`, `setup`, `weekday`, or `hour`. Any other value is `400`. When it is set, the response adds `groupBy` and `groups`. When it is omitted, those fields are absent.

Each group is `{ key, count, wins, losses, breakeven, winRate, totalPnl, totalR, avgR }`. Groups are ordered by count, then key. Live groups are the closed trades in the stats window. Backtest groups are the backtest rows in that window, and `totalPnl` is `null`.

| `groupBy` | Live key | Backtest key |
|---|---|---|
| `session` | stored `session`, or the Israel session of `entryDate` | stored `session`, or `לא ידוע` |
| `setup` | each stored name in `setups`. When `setups` is empty, the entry `trigger` is the one key. `ללא סטאפ` when both are empty. A trade with stored setups is counted in each of them and is not also counted under its trigger | `strategy` (the setup), or `ללא אסטרטגיה` |
| `weekday` | `Sun` … `Sat` in Asia/Jerusalem, from `entryDate` | same, from `date` (or `createdAt`) |
| `hour` | `00`–`23` in Asia/Jerusalem | same |

```bash
curl -s "https://trade-os.tradeos.workers.dev/api/v1/stats?journalId=JOURNAL_ID&groupBy=session" \
  -H "Authorization: Bearer $API_KEY"
```

```json
{ "groupBy": "session", "groups": [ { "key": "London", "count": 4, "wins": 3, "losses": 1, "breakeven": 0, "winRate": 75, "totalPnl": 120, "totalR": 3.5, "avgR": 0.875 } ] }
```

Backtest example:

```json
{
  "journalId": "BACKTEST_JOURNAL_ID",
  "type": "backtest",
  "isBacktest": true,
  "period": "all",
  "from": null,
  "to": null,
  "initialBalance": null,
  "counts": { "total": 3, "closed": 3, "open": 0, "partial": 0, "wins": 1, "losses": 1, "breakeven": 1 },
  "winRate": 50,
  "totalPnl": null,
  "totalR": 1,
  "startBalance": null,
  "currentBalance": null,
  "returnPercent": null,
  "riskAmount": null,
  "profitFactor": 2,
  "profitFactorInfinite": false,
  "expectancy": null,
  "avgR": 0.333,
  "bestR": 2,
  "worstR": -1,
  "maxWinStreak": 1,
  "maxLossStreak": 1,
  "maxDrawdown": null,
  "maxDrawdownAmount": null,
  "maxDrawdownR": 1,
  "truncated": false
}
```

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

3. The Worker and hosting deploy from GitHub Actions when the commit reaches `main`. Only `main` deploys the Workers. No new secret is required. The MCP route is the same Worker: `https://trade-os.tradeos.workers.dev/mcp`. Listing journals, matching a journal by name, and deleting a trade do not add a Firestore index: journals and backtest journals are collection lists, the name is matched in the Worker, and delete is a single document. Backtest trades are paged by document id with an equality on `backtestJournalId`, the same shape as the stats scan, so they do not add a composite index either. No Firestore migration is required.

4. No `wrangler deploy` from a laptop. The local Wrangler login is the personal Cloudflare account, which does not own `trade-os`.
