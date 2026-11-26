# TradeOS MCP server

Remote [MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) endpoint on the existing `trade-os` Worker. Agents log trades and read the journal through the same checks as the [public REST API](./API.md).

- **URL:** `https://trade-os.tradeos.workers.dev/mcp`
- **Transport:** Streamable HTTP, stateless. One JSON-RPC message per `POST`. The server answers with `application/json` (no SSE stream). `GET` and `DELETE` return `405`.
- **Auth:** `Authorization: Bearer tos_…` — the same API key as `/api/v1`. Create it in the app: Profile → API → מפתח חדש. There is no OAuth. Do not configure an OAuth client or a token endpoint.
- **Protocol versions:** `2025-03-26`, `2025-06-18`, `2025-11-25`. The server echoes the version the client sends when it is one of these. A missing `MCP-Protocol-Version` header is accepted (treated as the 2025-03-26 default). Any other header value is `400`.
- **Rate limit:** 60 authenticated requests per minute per user, same counter as the REST API. A request does not write Cloudflare KV.

Send `Accept: application/json, text/event-stream` and `Content-Type: application/json`. After `initialize`, clients should send `MCP-Protocol-Version` on later requests. This server does not issue `Mcp-Session-Id`.

Tool failures (validation, unknown tool, missing journal) are a normal JSON-RPC result with `isError: true` and the message in `content[0].text`. A bad or missing API key is HTTP `401` `{ "error": "unauthorized" }`, not a tool result. `429` is the rate limit.

## Connect

Cursor, Claude, and other clients that speak Streamable HTTP:

```json
{
  "mcpServers": {
    "tradeos": {
      "url": "https://trade-os.tradeos.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer tos_YOUR_KEY"
      }
    }
  }
}
```

If the client asks for a transport type, set it to `http` or `streamable-http` (not `sse`). A Grok Bot or other remote assistant uses the same URL and header. Example for a client that requires `type`:

```json
{
  "mcpServers": {
    "tradeos": {
      "type": "http",
      "url": "https://trade-os.tradeos.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer tos_YOUR_KEY"
      }
    }
  }
}
```

The key is a secret. Put it in the client config, not in a chat message. Revoke it from Profile → API; it stops working immediately.

Local Worker (`npx wrangler dev`, see [API.md](./API.md)): `http://localhost:8787/mcp` with the same header.

## Tools

| Tool | What it does |
|---|---|
| `list_journals` | Same as `GET /api/v1/journals`. Live and backtest journals. Each row has `id`, `name`, `type` (`live` or `backtest`), and `isBacktest`. Live rows also have `exchange` (the broker, for example MEXC). Optional `type`: `live` or `backtest`. Omit it to list both. |
| `add_trade` | Same stored trade as `POST /api/v1/trades`. Pass `journalId` or `journal` (name or id). Omitting both is rejected. The input schema is closed (`additionalProperties: false`) and accepts only its listed arguments, including `journal`, `journalId`, `contract` for futures, and `custom`. It does not accept `trigger` or `setups` (the REST API does). `custom` is an object of field id (`f1`, …) to a string or number, checked against `settings/customTradeFields`. Unknown ids and values that do not match the field are rejected. Omit it for a trade with no answers. P&L is computed from prices and fees. `pnlFromExchange` is not an argument and is ignored if it is sent to the REST API. Optional `idempotencyKey` (8–128 printable characters) maps to the `Idempotency-Key` header. A retry returns the original trade and does not write a second one, even when the first attempt failed while marking the key complete. |
| `update_trade` | Same as `PATCH /api/v1/trades/{id}`. `id` is required. Other arguments are optional and partial. The schema is closed and, like `add_trade`, does not accept `trigger` or `setups`. `id` and `createdAt` cannot be sent as changes. An empty patch is rejected. P&L, R, position size, and margin are recomputed from the merged trade. Another user's id is not found. `journalId` or `journal` moves the trade only to a journal you own. `custom` replaces the whole answer map. Omit it to keep the stored answers. `{}` clears them. |
| `list_trades` | Same filters as `GET /api/v1/trades`: `journalId`, `journal` (name or id), `type` (`live` or `backtest`), `status`, `pair`, `direction`, `from`, `to`, `limit` (1–100, default 50), `cursor`. Newest `entryDate` first for live trades. `order` is `desc` (default) or `asc`. Omit the journal filter and `type` to list live trades from every account. A backtest journal id, or `type=backtest`, returns that owner's backtest trades with the stored fields (`strategy`, `session`, `stopDistancePct`, `rResult`, `maxR`, and the rest). Pass `nextCursor` back as `cursor` with the same filters and order. Each live trade includes `custom` when it has answers and omits the field when it does not. A shared journal does not include `custom`. |
| `delete_trade` | Same as `DELETE /api/v1/trades/{id}`. Argument `id`. The trade must belong to the key's user. A backtest trade id is not found and is not deleted. Stats on the next `get_stats` are computed from the live trades that remain. |
| `get_stats` | Same as `GET /api/v1/stats`. Pass `journalId` or `journal` of a live journal or a backtest journal. One of them is required. `period` is `all` (default), `week`, `month`, or `year`. `from` and `to` replace `period`. Optional `groupBy` is `session`, `setup`, `weekday`, or `hour` and adds `groups`. For a live journal, `setup` uses stored `setups`, or the entry `trigger` when `setups` is empty. A backtest journal returns R stats (`totalR`, `avgR`, `bestR`, `worstR`, R `profitFactor`) and `null` dollar fields. |
| `list_daily_journals` | Same as `GET /api/v1/daily-journals`. Morning and evening entries. Optional `from`, `to`, `kind` (`morning` or `evening`), and `journalId` (ownership check only; entries are not stored per journal). |
| `get_risk_rules` | Same as `GET /api/v1/risk-rules`. Live journals only. Stored rules plus `status.breached`. |
| `list_plans` | Same as `GET /api/v1/plans`. Read-only summary of the caller's trading plans. |
| `get_plan` | Same as `GET /api/v1/plans/{id}`. Argument `id`. The stored plan, including rules, risk, and sessions. Another user's id is not found. |

`add_trade` requires `pair`, `direction` (`long` or `short`), `entryPrice`, `quantity`, and either `journalId` or `journal`. The journal has to be a live journal. A backtest journal id or name is rejected and nothing is written. The published schema sets `additionalProperties: false`, so clients reject arguments that are not listed. `custom` is listed and optional. The result text is the JSON body the REST endpoint would return (`id`, `trade`, and `idempotentReplay` on a replay). `list_journals` returns `{ journals }`. `list_trades` returns `{ trades, nextCursor }` and, for a backtest page, `truncated`. `delete_trade` returns `{ id, deleted: true }` for a live trade. `update_trade` returns `{ id, trade }` with the same trade shape as `add_trade`. `get_stats` returns the stats object, including `type` and `isBacktest`. `list_plans` returns `{ plans }`. `get_plan` returns `{ plan }`. `list_daily_journals` returns `{ journalId, filteredByJournal, entries }`. `get_risk_rules` returns `{ journals }`. `get_stats` with `groupBy` adds `groups`. A shared journal never includes `custom`. Business ledger and notebook entries are not exposed.

Backtest field names match the document the app stores. Setup is `strategy` (the entry trigger is `trigger`). Session is `session`. Stop distance is `stopDistancePct` (a percent). R is `rResult`. Max R is `maxR`. There is no stored 3R field and no stored `tags` array on a backtest trade; `maxR >= 3` is the 3R check. See [API.md](./API.md) for the response objects.

## What has to be deployed first

Merging to `main` deploys this route with the Worker. No new secret and no OAuth setup.

Filtered trade lists (`journalId`, `status`, `pair`, `direction`), including `list_trades` with those arguments, need the composite indexes in `firestore.indexes.json`. CI does not deploy indexes:

```bash
firebase deploy --only firestore:indexes --project tradeos-91a58
```

Wait until the new `trades` indexes are Enabled. `get_stats`, an unfiltered `list_trades`, `list_journals`, and `delete_trade` work before that. A `journal` name is resolved to an id in the Worker, then the existing `journalId` query runs. Details are in [API.md](./API.md).
