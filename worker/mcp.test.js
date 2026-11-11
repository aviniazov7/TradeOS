import { describe, expect, it } from 'vitest';
import { handlePublicApi } from './publicApi.js';
import { handleMcp } from './mcp.js';
import { decodeFields, encodeFields } from './firestoreValues.js';
import { memoryFirestore } from './memoryFirestore.js';

const PROJECT = 'p';

function memoryDb() {
  return memoryFirestore(PROJECT);
}

function deps(db, extra = {}) {
  return {
    projectId: PROJECT,
    cors: { 'Access-Control-Allow-Origin': 'https://tradeoslive.web.app' },
    fetchFn: db.fetchFn,
    verifyFirebaseToken: async (token) => (token === 'firebase-good' ? 'user1' : null),
    getAdminToken: async () => 'admin',
    rateLimit: async () => ({ count: 1 }),
    now: () => new Date('2026-06-15T12:00:00.000Z'),
    allowOrigin: (origin) => origin === 'https://tradeoslive.web.app',
    ...extra,
  };
}

function mcp(db, { method, params, token = 'firebase-good', id = 1, headers = {}, notify = false, extra } = {}) {
  const body = { jsonrpc: '2.0', method };
  if (!notify) body.id = id;
  if (params !== undefined) body.params = params;
  const reqHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...headers,
  };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  const req = new Request('https://trade-os.example/mcp', {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify(body),
  });
  return handleMcp(req, deps(db, extra));
}

async function rpc(res) {
  expect(res.headers.get('Content-Type')).toContain('application/json');
  return res.json();
}

const tradeArgs = {
  journalId: 'j1',
  pair: 'BTCUSDT',
  direction: 'long',
  entryPrice: 100,
  exitPrice: 110,
  quantity: 2,
  stopLoss: 90,
  leverage: 10,
  fees: 1,
};

describe('MCP streamable HTTP', () => {
  it('initializes without a session and lists the three tools', async () => {
    const db = memoryDb();
    const init = await mcp(db, {
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    expect(init.status).toBe(200);
    expect(init.headers.get('Mcp-Session-Id')).toBeNull();
    const opened = await rpc(init);
    expect(opened.result.protocolVersion).toBe('2025-11-25');
    expect(opened.result.capabilities.tools).toEqual({ listChanged: false });
    expect(opened.result.serverInfo.name).toBe('tradeos');

    const noted = await mcp(db, { method: 'notifications/initialized', notify: true });
    expect(noted.status).toBe(202);
    expect(await noted.text()).toBe('');

    const listed = await mcp(db, {
      method: 'tools/list',
      headers: { 'MCP-Protocol-Version': '2025-11-25' },
    });
    const tools = await rpc(listed);
    expect(tools.result.tools.map((tool) => tool.name)).toEqual([
      'list_journals', 'add_trade', 'update_trade', 'list_trades', 'delete_trade', 'get_stats', 'list_plans', 'get_plan',
    ]);
    for (const tool of tools.result.tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe('object');
    }
    expect(tools.result.tools.find((tool) => tool.name === 'add_trade').inputSchema.properties.custom.type).toBe('object');
    expect(tools.result.tools.find((tool) => tool.name === 'update_trade').inputSchema.properties.custom.type).toBe('object');
    expect(tools.result.tools.find((tool) => tool.name === 'list_journals').inputSchema.properties.type.enum).toEqual(['live', 'backtest']);
    expect(tools.result.tools.find((tool) => tool.name === 'list_trades').inputSchema.properties.type.enum).toEqual(['live', 'backtest']);
    expect(opened.result.instructions).toContain('backtest');
  });

  it('echoes an older protocol version and rejects an unknown one', async () => {
    const db = memoryDb();
    const old = await mcp(db, {
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    expect((await rpc(old)).result.protocolVersion).toBe('2025-06-18');
    const bad = await mcp(db, {
      method: 'ping',
      headers: { 'MCP-Protocol-Version': '2024-11-05' },
    });
    expect(bad.status).toBe(400);
    expect((await rpc(bad)).error.code).toBe(-32600);
  });

  it('adds a trade, replays an idempotency key, and returns validation as a tool error', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1000 } });
    const created = await mcp(db, { method: 'tools/call', params: { name: 'add_trade', arguments: { ...tradeArgs, idempotencyKey: 'agent-mcp-001' } } });
    expect(created.status).toBe(200);
    const first = await rpc(created);
    expect(first.result.isError).toBe(false);
    expect(first.result.structuredContent.trade).toMatchObject({ pair: 'BTCUSDT', netPnl: 19, riskAmount: 20, result: 'win' });
    expect(JSON.parse(first.result.content[0].text).id).toBe(first.result.structuredContent.id);

    const replay = await mcp(db, {
      method: 'tools/call',
      params: { name: 'add_trade', arguments: { ...tradeArgs, pair: 'ETHUSDT', idempotencyKey: 'agent-mcp-001' } },
    });
    const second = await rpc(replay);
    expect(second.result.isError).toBe(false);
    expect(second.result.structuredContent.idempotentReplay).toBe(true);
    expect(second.result.structuredContent.id).toBe(first.result.structuredContent.id);
    expect(second.result.structuredContent.trade.pair).toBe('BTCUSDT');
    expect([...db.docs.keys()].filter((key) => key.startsWith('users/user1/trades/'))).toHaveLength(1);
    expect(db.fetchFn.mock.calls.every((call) => String(call[0]).includes('firestore.googleapis.com'))).toBe(true);

    db.put('users/user1/settings/customTradeFields', encodeFields({
      seq: 1,
      fields: [{ id: 'f1', name: 'סשן', type: 'text' }],
    }));
    const withCustom = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'add_trade', arguments: { ...tradeArgs, custom: { f1: 'לונדון' } } },
    }));
    expect(withCustom.result.isError).toBe(false);
    expect(withCustom.result.structuredContent.trade.custom).toEqual({ f1: 'לונדון' });
    const badCustom = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'add_trade', arguments: { ...tradeArgs, custom: { f9: 'x' } } },
    }));
    expect(badCustom.result.isError).toBe(true);
    expect(badCustom.result.content[0].text).toMatch(/custom\.f9/);

    const invalid = await mcp(db, { method: 'tools/call', params: { name: 'add_trade', arguments: { journalId: 'j1' } } });
    expect(invalid.status).toBe(200);
    const failed = await rpc(invalid);
    expect(failed.result.isError).toBe(true);
    expect(failed.result.content[0].text).toMatch(/entryPrice/);
  });

  it('updates a trade through update_trade and rejects a derived field', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { doubleValue: 1000 } });
    const created = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'add_trade', arguments: tradeArgs } }));
    const id = created.result.structuredContent.id;
    const createdAt = created.result.structuredContent.trade.createdAt;

    const updated = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'update_trade', arguments: { id, fees: 3 } },
    }));
    expect(updated.result.isError).toBe(false);
    expect(updated.result.structuredContent.trade).toMatchObject({
      pair: 'BTCUSDT', exitPrice: 110, fees: 3, pnl: 20, netPnl: 17, result: 'win',
    });
    expect(updated.result.structuredContent.trade.createdAt).toBe(createdAt);
    expect(JSON.parse(updated.result.content[0].text).id).toBe(id);

    const repriced = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'update_trade', arguments: { id, exitPrice: 120 } },
    }));
    expect(repriced.result.structuredContent.trade).toMatchObject({ exitPrice: 120, pnl: 40, netPnl: 37, fees: 3 });

    const rejected = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'update_trade', arguments: { id, pnl: 5 } },
    }));
    expect(rejected.result.isError).toBe(true);
    expect(rejected.result.content[0].text).toMatch(/not editable/);

    const empty = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'update_trade', arguments: { id } },
    }));
    expect(empty.result.isError).toBe(true);
    expect(empty.result.content[0].text).toMatch(/at least one field/);

    const foreign = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'update_trade', arguments: { id: 'secret', notes: 'nope' } },
    }));
    expect(foreign.result.isError).toBe(true);
    expect(foreign.result.content[0].text).toBe('trade not found');
    expect([...db.docs.keys()].filter((key) => key.startsWith('users/user1/trades/'))).toHaveLength(1);
  });

  it('lists newest first and computes stats through the shared functions', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/j1', { initialBalance: { integerValue: '1000' } });
    const closed = (id, when, net) => db.put(`users/user1/trades/${id}`, {
      journalId: { stringValue: 'j1' },
      pair: { stringValue: 'BTCUSDT' },
      direction: { stringValue: 'long' },
      status: { stringValue: 'closed' },
      result: { stringValue: net >= 0 ? 'win' : 'loss' },
      entryPrice: { doubleValue: 100 },
      exitPrice: { doubleValue: net >= 0 ? 110 : 90 },
      quantity: { doubleValue: 1 },
      positionSize: { doubleValue: 100 },
      stopLoss: { doubleValue: 90 },
      originalStopLoss: { doubleValue: 90 },
      riskAmount: { doubleValue: 0 },
      leverage: { doubleValue: 1 },
      fees: { doubleValue: 0 },
      pnl: { doubleValue: net },
      netPnl: { doubleValue: net },
      entryDate: { timestampValue: when },
      exitDate: { timestampValue: when },
    });
    closed('a', '2026-06-01T00:00:00.000Z', 20);
    closed('m', '2026-06-02T00:00:00.000Z', -5);

    const page = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'list_trades', arguments: { journalId: 'j1', limit: 1 } },
    }));
    expect(page.result.isError).toBe(false);
    expect(page.result.structuredContent.trades.map((t) => t.id)).toEqual(['m']);
    expect(page.result.structuredContent.nextCursor).toBeTruthy();
    const rest = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'list_trades', arguments: { journalId: 'j1', cursor: page.result.structuredContent.nextCursor } },
    }));
    expect(rest.result.structuredContent.trades.map((t) => t.id)).toEqual(['a']);

    const stats = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'get_stats', arguments: { journalId: 'j1', period: 'all' } },
    }));
    expect(stats.result.isError).toBe(false);
    expect(stats.result.structuredContent).toMatchObject({ journalId: 'j1', totalPnl: 15, currentBalance: 1015 });
    expect(stats.result.structuredContent.returnPercent).toBeCloseTo(1.5);

    const missing = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'get_stats', arguments: {} } }));
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toMatch(/journalId/);
    const unknown = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'rename_journal', arguments: {} } }));
    expect(unknown.result.isError).toBe(true);
    expect(unknown.result.content[0].text).toMatch(/unknown tool/);
  });

  it('lists journals, writes by name, and deletes so stats follow the UI', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/mexc', {
      name: { stringValue: 'MEXC' }, exchange: { stringValue: 'MEXC' }, initialBalance: { doubleValue: 1000 },
    });
    db.put('users/user1/journals/bybit', {
      name: { stringValue: 'Bybit' }, exchange: { stringValue: 'bybit' }, initialBalance: { doubleValue: 250 },
    });
    db.put('users/user2/journals/mexc', {
      name: { stringValue: 'MEXC' }, exchange: { stringValue: 'MEXC' },
    });

    const listed = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'list_journals', arguments: {} } }));
    expect(listed.result.isError).toBe(false);
    expect(listed.result.structuredContent.journals.map((j) => [j.id, j.name, j.exchange])).toEqual([
      ['bybit', 'Bybit', 'bybit'],
      ['mexc', 'MEXC', 'MEXC'],
    ]);

    const rest = { ...tradeArgs };
    delete rest.journalId;
    const created = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'add_trade', arguments: { ...rest, journal: 'mexc' } },
    }));
    expect(created.result.isError).toBe(false);
    expect(created.result.structuredContent.trade.journalId).toBe('mexc');
    const id = created.result.structuredContent.id;
    db.put(`users/user1/tradeImages/${id}_0`, { tradeId: { stringValue: id } });

    const before = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'get_stats', arguments: { journal: 'MEXC' } },
    }));
    expect(before.result.structuredContent.totalPnl).toBe(19);

    const removed = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'delete_trade', arguments: { id } },
    }));
    expect(removed.result.isError).toBe(false);
    expect(removed.result.structuredContent).toEqual({ id, deleted: true });
    expect(db.docs.has(`users/user1/trades/${id}`)).toBe(false);
    expect(db.docs.has(`users/user1/tradeImages/${id}_0`)).toBe(false);
    expect(db.docs.has('users/user2/journals/mexc')).toBe(true);

    const after = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'get_stats', arguments: { journalId: 'mexc' } },
    }));
    expect(after.result.structuredContent.totalPnl).toBe(0);
    expect(after.result.structuredContent.counts.total).toBe(0);

    const missing = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'delete_trade', arguments: {} } }));
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toMatch(/trade id/);
    const traversal = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'delete_trade', arguments: { id: '../journals/mexc' } } }));
    expect(traversal.result.isError).toBe(true);
    expect(db.docs.has('users/user1/journals/mexc')).toBe(true);
  });

  it('lists, reads, and scores backtest journals without writing them', async () => {
    const db = memoryDb();
    db.put('users/user1/journals/mexc', encodeFields({
      name: 'MEXC', exchange: 'MEXC', initialBalance: 1000,
    }));
    db.put('users/user1/backtestJournals/bj1', encodeFields({
      name: 'BTC backtest', description: 'trendline', isDefault: false,
    }));
    db.put('users/user2/backtestJournals/hidden', encodeFields({ name: 'Hidden' }));
    db.put('users/user1/backtests/bt1', encodeFields({
      backtestJournalId: 'bj1', pair: 'BTCUSDT', direction: 'long', strategy: 'Trendline Break',
      trigger: 'CHoCH', session: 'London', timeframe: '4H', date: '2026-06-02T13:00:00.000Z',
      stopDistancePct: 0.9, rResult: 2, maxR: 5.7, result: 'win', notes: 'retest',
    }));
    db.put('users/user2/backtests/secret', encodeFields({
      backtestJournalId: 'hidden', pair: 'BTCUSDT', rResult: 9, result: 'win', strategy: 'Secret',
    }));

    const all = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'list_journals', arguments: {} } }));
    expect(all.result.isError).toBe(false);
    expect(all.result.structuredContent.journals.map((j) => [j.id, j.type, j.isBacktest])).toEqual([
      ['bj1', 'backtest', true],
      ['mexc', 'live', false],
    ]);
    const only = await rpc(await mcp(db, {
      method: 'tools/call', params: { name: 'list_journals', arguments: { type: 'backtest' } },
    }));
    expect(only.result.structuredContent.journals.map((j) => j.id)).toEqual(['bj1']);

    const trades = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'list_trades', arguments: { journalId: 'bj1', type: 'backtest' } },
    }));
    expect(trades.result.isError).toBe(false);
    expect(trades.result.structuredContent.trades).toHaveLength(1);
    expect(trades.result.structuredContent.trades[0]).toMatchObject({
      id: 'bt1',
      type: 'backtest',
      isBacktest: true,
      journalId: 'bj1',
      strategy: 'Trendline Break',
      session: 'London',
      stopDistancePct: 0.9,
      rResult: 2,
      maxR: 5.7,
    });
    expect(JSON.stringify(trades.result.structuredContent)).not.toContain('Secret');

    const stats = await rpc(await mcp(db, {
      method: 'tools/call', params: { name: 'get_stats', arguments: { journal: 'BTC backtest' } },
    }));
    expect(stats.result.isError).toBe(false);
    expect(stats.result.structuredContent).toMatchObject({
      journalId: 'bj1', type: 'backtest', isBacktest: true, totalR: 2, avgR: 2, totalPnl: null,
    });
    expect(stats.result.structuredContent.winRate).toBe(100);

    const written = await rpc(await mcp(db, {
      method: 'tools/call',
      params: { name: 'add_trade', arguments: { ...tradeArgs, journalId: 'bj1', journal: 'BTC backtest' } },
    }));
    expect(written.result.isError).toBe(true);
    expect(written.result.content[0].text).toMatch(/not found|does not match/);
    const removed = await rpc(await mcp(db, {
      method: 'tools/call', params: { name: 'delete_trade', arguments: { id: 'bt1' } },
    }));
    expect(removed.result.isError).toBe(true);
    expect(db.docs.has('users/user1/backtests/bt1')).toBe(true);
    expect(db.docs.has('users/user2/backtests/secret')).toBe(true);
    expect([...db.docs.keys()].some((key) => key.startsWith('users/user1/trades/'))).toBe(false);
  });

  it('lists and reads trading plans without writing them', async () => {
    const db = memoryDb();
    db.put('users/user1/tradingPlans/p1', encodeFields({
      name: 'ORB', isActive: true, sessions: ['London'], entryRules: 'wait', riskManagement: '1%',
    }));
    db.put('users/user2/tradingPlans/secret', encodeFields({ name: 'Secret', entryRules: 'hidden' }));

    const listed = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'list_plans', arguments: {} } }));
    expect(listed.result.isError).toBe(false);
    expect(listed.result.structuredContent.plans.map((plan) => plan.id)).toEqual(['p1']);
    expect(listed.result.structuredContent.plans[0].entryRules).toBeUndefined();

    const one = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'get_plan', arguments: { id: 'p1' } } }));
    expect(one.result.structuredContent.plan).toMatchObject({
      id: 'p1', entryRules: 'wait', riskManagement: '1%', sessions: ['London'],
    });
    const missing = await rpc(await mcp(db, { method: 'tools/call', params: { name: 'get_plan', arguments: { id: 'secret' } } }));
    expect(missing.result.isError).toBe(true);
    expect(db.docs.has('users/user2/tradingPlans/secret')).toBe(true);
    expect(decodeFields(db.docs.get('users/user1/tradingPlans/p1')).entryRules).toBe('wait');
  });

  it('rejects a bad key, a disallowed origin, and a rate limit before running a tool', async () => {
    const db = memoryDb();
    const anon = await mcp(db, { method: 'initialize', token: '', params: {} });
    expect(anon.status).toBe(401);
    const bad = await mcp(db, { method: 'tools/list', token: 'tos_not_a_real_key_xxxxxxxxxx' });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'unauthorized' });
    expect(db.fetchFn).toHaveBeenCalled();

    const fresh = memoryDb();
    const evil = await handleMcp(new Request('https://trade-os.example/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        Authorization: 'Bearer firebase-good',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }), deps(fresh));
    expect(evil.status).toBe(403);
    expect(fresh.fetchFn).not.toHaveBeenCalled();

    const limited = await mcp(memoryDb(), {
      method: 'tools/call',
      params: { name: 'get_stats', arguments: { journalId: 'j1' } },
      extra: { rateLimit: async () => ({ count: 61 }) },
    });
    expect(limited.status).toBe(429);

    const stream = await handleMcp(new Request('https://trade-os.example/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    }), deps(memoryDb()));
    expect(stream.status).toBe(405);
  });

  it('accepts a minted tos_ key on initialize', async () => {
    const db = memoryDb();
    const minted = await handlePublicApi(new Request('https://trade-os.example/api/v1/keys', {
      method: 'POST',
      headers: { Authorization: 'Bearer firebase-good', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MCP' }),
    }), {}, deps(db));
    expect(minted.status).toBe(201);
    const key = (await minted.json()).key;
    const init = await mcp(db, { method: 'initialize', token: key, params: { protocolVersion: '2025-03-26', capabilities: {} } });
    expect(init.status).toBe(200);
    expect((await rpc(init)).result.protocolVersion).toBe('2025-03-26');
  });
});
