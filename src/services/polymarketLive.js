// Real-time trade tape over Polymarket's public live-data socket.
// Verified live: subscribing to {topic:'activity', type:'trades'} streams every
// trade on the platform (~40/sec at peak) — no auth, no polling.
import { safeHttpUrl } from '../utils/urls';

const WS_URL = 'wss://ws-live-data.polymarket.com';
const SUB = JSON.stringify({ action: 'subscribe', subscriptions: [{ topic: 'activity', type: 'trades' }] });
const isAddress = (w) => typeof w === 'string' && /^0x[0-9a-fA-F]{40}$/.test(w);

function normalize(p) {
  const size = Number(p.size) || 0;
  const price = Number(p.price) || 0;
  const name = typeof p.name === 'string' && p.name && !p.name.toLowerCase().startsWith('0x') ? p.name : null;
  return {
    id: `${p.transactionHash || 'n'}-${p.proxyWallet}-${p.asset}-${p.timestamp}-${size}`,
    wallet: p.proxyWallet,
    name,
    side: p.side || null,
    size,
    price,
    usd: size * price,
    title: p.title || p.slug || '—',
    slug: p.slug || null,
    eventSlug: p.eventSlug || null,
    icon: safeHttpUrl(p.icon) || null,
    outcome: p.outcome || null,
    conditionId: p.conditionId,
    timestamp: Number(p.timestamp) || Math.floor(Date.now() / 1000),
  };
}

/**
 * Open the live trade stream.
 * @param {(trade:object)=>void} onTrade   called per normalized trade
 * @param {(state:'connecting'|'live'|'down')=>void} onStatus
 * @returns {()=>void} stop function (closes the socket, cancels reconnects)
 */
export function openTradeStream(onTrade, onStatus) {
  let ws = null;
  let stopped = false;
  let retry = 0;
  let reconnectTimer = null;

  const connect = () => {
    if (stopped) return;
    onStatus?.(retry === 0 ? 'connecting' : 'down');
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retry = 0;
      try { ws.send(SUB); } catch { /* closed mid-handshake */ }
      onStatus?.('live');
    };

    ws.onmessage = (e) => {
      const raw = String(e.data || '');
      if (!raw) return;                       // keep-alive frame
      try {
        const msg = JSON.parse(raw);
        const p = msg?.payload;
        if (!p || !isAddress(p.proxyWallet)) return;
        onTrade(normalize(p));
      } catch { /* ignore malformed frame */ }
    };

    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    ws.onclose = () => { if (!stopped) scheduleReconnect(); };
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    onStatus?.('down');
    retry += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retry, 5)); // capped backoff
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    try { ws?.close(); } catch { /* already closed */ }
  };
}
