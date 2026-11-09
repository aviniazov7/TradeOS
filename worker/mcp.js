// Remote MCP server (Streamable HTTP, stateless) for the TradeOS journal.
// Same tos_ API key and rate limits as /api/v1. Tool calls run the public
// API functions in-process — this worker does not HTTP itself.
//
// Protocol: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
// No session id and no SSE stream. GET and DELETE are 405. POST is one
// JSON-RPC message. Notifications get 202. Tool failures are isError results.

import { authorizeApi, createTrade, deleteTrade, journalStats, listJournals, listTrades, updateTrade } from './publicApi.js';

const PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];
const PREFERRED_PROTOCOL = '2025-11-25';

const TOOLS = [
  {
    name: 'list_journals',
    description: 'List the journals (accounts) owned by the API key. Each row has id, name, and exchange (the broker, for example MEXC or Bybit), plus assetClass, currency, initialBalance, archived, starred, and isDefault. Use id or name with add_trade, update_trade, list_trades, get_stats, and delete_trade. Omitting a journal elsewhere does not pick one of these for you.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'add_trade',
    description: 'Add one trade to a journal owned by the API key. Validation and stored fields match POST /api/v1/trades: pnl, netPnl, pnlPercent, result, position size, margin, and a derived risk amount when entry, stop, and size can price it. P&L is computed from prices and fees. pnlFromExchange is not accepted. Only the properties listed in this schema are accepted. Pass journalId or journal (the journal name, or its id). One of them is required — omitting both is rejected and does not guess a journal. Also required: pair, direction (long or short), entryPrice, quantity. status may be omitted — an exit price closes the trade, partial exits become partial, otherwise the trade stays open. fees default to 0 and leverage to 1 (crypto and stocks). Futures (assetClass futures_cme) need contract.contracts, contract.pointValue, and contract.tickSize. Pass idempotencyKey (8–128 printable characters) to make a retry return the original trade instead of writing another one.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['pair', 'direction', 'entryPrice', 'quantity'],
      properties: {
        journalId: { type: 'string', description: 'Id of a journal the key owner owns.' },
        journal: { type: 'string', description: 'Journal name (case-insensitive) or journal id. Must belong to the key owner. Ambiguous names are rejected.' },
        pair: { type: 'string', description: 'Symbol, 1–30 characters. Example: BTCUSDT.' },
        direction: { type: 'string', enum: ['long', 'short'] },
        entryPrice: { type: 'number', exclusiveMinimum: 0 },
        exitPrice: { type: 'number', minimum: 0 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        stopLoss: { type: 'number', minimum: 0 },
        takeProfit: { type: 'number' },
        leverage: { type: 'number', description: '1–200. Defaults to 1 for crypto and stocks.' },
        fees: { type: 'number', minimum: 0 },
        riskAmount: { type: 'number', description: 'Optional. Derived from entry, stop, and size when omitted or 0.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        assetClass: { type: 'string', enum: ['crypto', 'futures_cme', 'stocks'] },
        entryDate: { type: 'string', description: 'ISO-8601. Defaults to now.' },
        exitDate: { type: 'string', description: 'ISO-8601.' },
        notes: { type: 'string' },
        entryReason: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        contract: {
          type: 'object',
          description: 'Required when assetClass is futures_cme.',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            contracts: { type: 'number', exclusiveMinimum: 0 },
            pointValue: { type: 'number', exclusiveMinimum: 0 },
            tickSize: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        idempotencyKey: { type: 'string', description: '8–128 printable characters. A repeat returns the original trade.' },
      },
    },
  },
  {
    name: 'update_trade',
    description: 'Update one trade owned by the API key. Same checks as PATCH /api/v1/trades/{id}. id is required. Every other argument is optional and partial: omitted fields stay as stored. Only the properties listed here are accepted. id and createdAt cannot be changed. Sending no field besides id is rejected. Validation matches add_trade (types, ranges, futures contract). The Worker recomputes pnl, netPnl, pnlPercent, result, position size, margin, and R from the merged trade, and sets updatedAt. Another user\'s id is not found. Pass journalId or journal only when moving the trade to another journal you own.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128, description: 'Trade id from add_trade or list_trades.' },
        journalId: { type: 'string', description: 'Move the trade to this journal id. The journal must belong to the key owner.' },
        journal: { type: 'string', description: 'Journal name (case-insensitive) or journal id to move the trade to.' },
        pair: { type: 'string', description: 'Symbol, 1–30 characters. Example: BTCUSDT.' },
        direction: { type: 'string', enum: ['long', 'short'] },
        entryPrice: { type: 'number', exclusiveMinimum: 0 },
        exitPrice: { type: 'number', minimum: 0 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        stopLoss: { type: 'number', minimum: 0 },
        takeProfit: { type: 'number' },
        leverage: { type: 'number', description: '1–200 for crypto and stocks.' },
        fees: { type: 'number', minimum: 0 },
        riskAmount: { type: 'number', description: 'Derived from entry, stop, and size when omitted or 0 on create. Send 0 to recompute it.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        assetClass: { type: 'string', enum: ['crypto', 'futures_cme', 'stocks'] },
        entryDate: { type: 'string', description: 'ISO-8601. Does not change createdAt.' },
        exitDate: { type: 'string', description: 'ISO-8601.' },
        notes: { type: 'string' },
        entryReason: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        contract: {
          type: 'object',
          description: 'Required when assetClass is futures_cme.',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            contracts: { type: 'number', exclusiveMinimum: 0 },
            pointValue: { type: 'number', exclusiveMinimum: 0 },
            tickSize: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      },
    },
  },
  {
    name: 'list_trades',
    description: 'List the caller\'s trades, newest entryDate first. The same entryDate ties break by document id in that same direction. Set order to "asc" for oldest first (id ascending on a tie). Optional filters: journalId or journal (name or id of a journal the key owner owns), status (open, closed, or partial), pair, direction (long or short), from, and to. Omitting the journal filter lists every journal, same as before. from and to filter the entry date (ISO-8601 or YYYY-MM-DD). limit is 1–100 and defaults to 50. Pass the previous nextCursor as cursor to read the next page; the cursor is only valid for the same filters and order. Trades with no entryDate are omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        journalId: { type: 'string' },
        journal: { type: 'string', description: 'Journal name or id. Limits the list to that account. Omit to list every journal.' },
        status: { type: 'string', enum: ['open', 'closed', 'partial'] },
        pair: { type: 'string' },
        direction: { type: 'string', enum: ['long', 'short'] },
        from: { type: 'string', description: 'Entry-date lower bound. ISO-8601 or YYYY-MM-DD.' },
        to: { type: 'string', description: 'Entry-date upper bound. ISO-8601 or YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string', description: 'nextCursor from the previous page.' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Default desc: newest entryDate first.' },
      },
    },
  },
  {
    name: 'delete_trade',
    description: 'Delete one trade owned by the API key. id is the trade id from add_trade or list_trades. The trade must live under that user — another user\'s id is not found. Screenshot docs for the trade are removed too. Stats and balances are computed from the trades that remain, the same way the journal screen updates after a delete. There is no separate aggregate to patch.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Trade id.' },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Journal performance for one journal, matching GET /api/v1/stats and the dashboard. Pass journalId or journal (name or id). One of them is required — omitting both is rejected and does not combine journals. period is all (default), week, month, or year. from and to, when set, replace period. Returns counts, win rate (breakevens excluded), net P&L, opening and current balance, return percent on the equity the period opened at (null when the journal has no opening balance), summed dollar risk, profit factor, expectancy, average R, and max drawdown. truncated is true when the journal has more than 5000 trades. Deleting a trade changes the next result, because stats are summed from the remaining trades.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        journalId: { type: 'string' },
        journal: { type: 'string', description: 'Journal name or id. Required when journalId is omitted.' },
        period: { type: 'string', enum: ['all', 'week', 'month', 'year'] },
        from: { type: 'string', description: 'ISO-8601 or YYYY-MM-DD. Replaces period when set.' },
        to: { type: 'string', description: 'ISO-8601 or YYYY-MM-DD. Replaces period when set.' },
      },
    },
  },
];

function jsonResponse(cors, status, body, extra = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function rpc(cors, status, id, result, error) {
  const body = { jsonrpc: '2.0', id };
  if (error) body.error = error;
  else body.result = result;
  return jsonResponse(cors, status, body);
}

function toolError(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function toolOk(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false,
  };
}

function acceptsJson(request) {
  const accept = request.headers.get('Accept');
  if (!accept) return true;
  return accept.split(',').some((part) => {
    const media = part.split(';')[0].trim().toLowerCase();
    return media === 'application/json' || media === 'text/event-stream' || media === '*/*';
  });
}

function tradeRequest(args, { method = 'POST', path = '/api/v1/trades' } = {}) {
  const { idempotencyKey, ...trade } = args;
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey != null && idempotencyKey !== '') headers['Idempotency-Key'] = String(idempotencyKey);
  return new Request(`https://trade-os.internal${path}`, {
    method,
    headers,
    body: JSON.stringify(trade),
  });
}

function queryUrl(path, args, keys) {
  const url = new URL(`https://trade-os.internal${path}`);
  for (const key of keys) {
    const value = args[key];
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function asTool(response) {
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (response.status >= 400 || !body || typeof body !== 'object') {
    const message = body && typeof body.error === 'string' ? body.error : `request failed (${response.status})`;
    return toolError(message);
  }
  return toolOk(body);
}

async function callTool(params, ctx) {
  const name = params?.name;
  const args = params?.arguments == null ? {} : params.arguments;
  if (typeof name !== 'string' || !name) {
    return { rpcError: { code: -32602, message: 'tools/call requires params.name' } };
  }
  if (typeof args !== 'object' || Array.isArray(args)) return toolError('arguments must be an object');
  if (name === 'add_trade') return asTool(await createTrade(tradeRequest(args), ctx));
  if (name === 'update_trade') {
    const id = typeof args.id === 'string' ? args.id : '';
    const patch = { ...args };
    delete patch.id;
    return asTool(await updateTrade(id, tradeRequest(patch, {
      method: 'PATCH',
      path: `/api/v1/trades/${encodeURIComponent(id)}`,
    }), ctx));
  }
  if (name === 'list_journals') return asTool(await listJournals(ctx));
  if (name === 'list_trades') {
    return asTool(await listTrades(queryUrl('/api/v1/trades', args, [
      'journalId', 'journal', 'status', 'pair', 'direction', 'from', 'to', 'limit', 'cursor', 'order',
    ]), ctx));
  }
  if (name === 'delete_trade') return asTool(await deleteTrade(typeof args.id === 'string' ? args.id : '', ctx));
  if (name === 'get_stats') {
    return asTool(await journalStats(queryUrl('/api/v1/stats', args, ['journalId', 'journal', 'period', 'from', 'to']), ctx));
  }
  return toolError(`unknown tool: ${name}`);
}

function initializeResult(params) {
  const requested = params?.protocolVersion;
  return {
    protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PREFERRED_PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'tradeos', title: 'TradeOS', version: '1.0.0' },
    instructions: 'TradeOS journal tools for the signed-in API key. list_journals returns id, name, and exchange. add_trade writes one trade to journalId or journal (optional idempotencyKey); omitting both is rejected. update_trade patches one trade by id and recomputes P&L; id and createdAt stay as stored. list_trades returns newest entryDate first unless order is asc, and lists every journal when no journal filter is passed. delete_trade removes one trade by id. get_stats is one journal, by journalId or journal. Dates are ISO-8601.',
  };
}

async function dispatch(message, ctx) {
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') return initializeResult(message.params);
  if (message.method === 'ping') return {};
  if (message.method === 'tools/list') return { tools: TOOLS };
  if (message.method === 'tools/call') return callTool(params, ctx);
  return { rpcError: { code: -32601, message: `method not found: ${message.method}` } };
}

export async function handleMcp(request, deps) {
  const cors = deps.cors || {};
  const origin = request.headers.get('Origin');
  if (origin && !deps.allowOrigin?.(origin)) {
    return jsonResponse(cors, 403, { error: 'origin not allowed' });
  }

  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path !== '/mcp') return jsonResponse(cors, 404, { error: 'not found' });

  if (request.method === 'GET' || request.method === 'DELETE') {
    return jsonResponse(cors, 405, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32601, message: 'this stateless server has no SSE stream and no session to terminate' },
    }, { Allow: 'POST' });
  }
  if (request.method !== 'POST') {
    return jsonResponse(cors, 405, { error: 'method not allowed' }, { Allow: 'POST' });
  }
  if (!acceptsJson(request)) {
    return jsonResponse(cors, 406, { error: 'Accept must include application/json or text/event-stream' });
  }

  const opened = await authorizeApi(request, { ...deps, cors });
  if (!opened.ok) return opened.response;

  let message;
  try { message = await request.json(); } catch {
    return rpc(cors, 400, null, null, { code: -32700, message: 'parse error' });
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    const id = message && typeof message === 'object' && !Array.isArray(message) ? message.id ?? null : null;
    return rpc(cors, 400, id, null, { code: -32600, message: 'invalid request' });
  }

  const versionHeader = request.headers.get('MCP-Protocol-Version');
  if (versionHeader && !PROTOCOL_VERSIONS.includes(versionHeader)) {
    return rpc(cors, 400, Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null, null, {
      code: -32600,
      message: `unsupported MCP-Protocol-Version: ${versionHeader}`,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
    return jsonResponse(cors, 202, null);
  }

  try {
    const result = await dispatch(message, opened.ctx);
    if (result?.rpcError) return rpc(cors, 200, message.id, null, result.rpcError);
    return rpc(cors, 200, message.id, result, null);
  } catch (err) {
    console.error('mcp request failed', message.method, err?.message || err);
    return rpc(cors, 200, message.id, null, { code: -32603, message: 'request failed' });
  }
}
