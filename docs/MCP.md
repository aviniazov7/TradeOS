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
| `add_trade` | Same body as `POST /api/v1/trades`. Optional `idempotencyKey` (8–128 printable characters) maps to the `Idempotency-Key` header. A retry returns the original trade and does not write a second one. |
| `list_trades` | Same filters as `GET /api/v1/trades`: `journalId`, `status`, `pair`, `direction`, `from`, `to`, `limit` (1–100, default 50), `cursor`. Newest `entryDate` first. `order` is `desc` (default) or `asc`. Pass `nextCursor` back as `cursor` with the same filters and order. |
| `get_stats` | Same as `GET /api/v1/stats`. `journalId` is required. `period` is `all` (default), `week`, `month`, or `year`. `from` and `to` replace `period`. |

`add_trade` requires `journalId`, `pair`, `direction` (`long` or `short`), `entryPrice`, and `quantity`. The result text is the JSON body the REST endpoint would return (`id`, `trade`, and `idempotentReplay` on a replay). `list_trades` returns `{ trades, nextCursor }`. `get_stats` returns the stats object.

## What has to be deployed first

Merging to `main` deploys this route with the Worker. No new secret and no OAuth setup.

Filtered trade lists (`journalId`, `status`, `pair`, `direction`), including `list_trades` with those arguments, need the composite indexes in `firestore.indexes.json`. CI does not deploy indexes:

```bash
firebase deploy --only firestore:indexes --project tradeos-91a58
```

Wait until the new `trades` indexes are Enabled. `get_stats` and an unfiltered `list_trades` work before that. Details are in [API.md](./API.md).
