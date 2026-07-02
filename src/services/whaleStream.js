// Live Bybit v5 public stream (USDT perps) for the whales page — liquidations
// and large trades. Browser-direct on purpose: Bybit's public endpoints are
// CORS-open and serve Israeli ISPs, unlike Binance futures which geo-blocks
// browsers here (see bybitDirect.js). One socket for everything, chunked
// subscribes (Bybit caps args per subscribe request), a 20s app-level ping,
// and exponential-backoff reconnect.
//
// Returns a stop() function. Callbacks:
//   onLiquidation({ T, s, S, v, p })  — S==='Sell' → a LONG was liquidated
//   onTrade({ T, s, S, v, p })        — S is the taker side (Buy/Sell)
//   onStatus('connecting'|'live'|'reconnecting')

const WS_URL = 'wss://stream.bybit.com/v5/public/linear';

export function openWhaleStream({ symbols, onLiquidation, onTrade, onStatus }) {
  let ws = null;
  let closed = false;
  let pingTimer = 0;
  let reconnectTimer = 0;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    onStatus?.('connecting');
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retry = 0;
      onStatus?.('live');
      const topics = [];
      for (const s of symbols) topics.push(`allLiquidation.${s}`, `publicTrade.${s}`);
      for (let i = 0; i < topics.length; i += 10) {
        ws.send(JSON.stringify({ op: 'subscribe', args: topics.slice(i, i + 10) }));
      }
      pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ op: 'ping' })); } catch { /* socket died; onclose reconnects */ }
      }, 20000);
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      const topic = m.topic || '';
      if (topic.startsWith('allLiquidation.')) {
        for (const d of m.data || []) onLiquidation?.(d);
      } else if (topic.startsWith('publicTrade.')) {
        for (const d of m.data || []) onTrade?.(d);
      }
    };

    ws.onclose = scheduleReconnect;
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  };

  const scheduleReconnect = () => {
    clearInterval(pingTimer);
    if (closed) return;
    onStatus?.('reconnecting');
    const delay = Math.min(30000, 1000 * 2 ** retry++);
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closed = true;
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    try { ws?.close(); } catch { /* noop */ }
  };
}

// Recent whale-sized trades via REST — instant backfill so the tape is never
// empty while waiting for the live stream. One call per symbol (Bybit returns
// up to the last 1000 prints), filtered to >= minUsd notional.
export async function fetchRecentBigTrades(symbols, minUsd) {
  const all = await Promise.all(symbols.map(async (s) => {
    try {
      const res = await fetch(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${s}&limit=1000`);
      if (!res.ok) return [];
      const j = await res.json();
      return (j?.result?.list || [])
        .map((t) => ({
          sym: s.replace(/USDT$/, ''),
          buy: t.side === 'Buy',
          usd: parseFloat(t.price) * parseFloat(t.size),
          price: t.price,
          t: Number(t.time),
        }))
        .filter((t) => Number.isFinite(t.usd) && t.usd >= minUsd);
    } catch {
      return [];
    }
  }));
  return all.flat().sort((a, b) => b.t - a.t);
}
