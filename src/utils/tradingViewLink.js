// TradingView links attached to a trade. Up to four https://tradingview.com
// URLs (snapshot shares and chart pages). A snapshot share
// (tradingview.com/x/<id>) maps to TradingView's own public PNG. A chart
// URL can be embedded. Nothing else is turned into an image or an iframe.
//
// TRADINGVIEW_URL_RE is the same pattern as tvLinkOk() in firestore.rules.
// normalizeTradingViewUrl() only returns strings that pattern accepts.

import { safeHttpUrl } from './urls';

export const MAX_TRADE_CHART_LINKS = 4;
export const MAX_TRADE_CHART_LINK_CHARS = 2000;

export const TRADINGVIEW_URL_RE = /^https:\/\/([A-Za-z0-9-]+\.)*tradingview\.com(\/.*)?$/;

const SNAPSHOT_RE = /tradingview\.com\/x\/([A-Za-z0-9]+)/i;
const TV_HOST_RE = /^https:\/\/(?:www\.|s\.)?tradingview\.com\//i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function isTradingViewHost(hostname) {
  const host = String(hostname || '').replace(/\.$/, '').toLowerCase();
  return host === 'tradingview.com' || host.endsWith('.tradingview.com');
}

/**
 * Canonical https TradingView URL, or null when the text is not one.
 * A bare tradingview.com/... paste gets an https scheme. Empty input is ''.
 */
export function normalizeTradingViewUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return '';
  if (text.length > MAX_TRADE_CHART_LINK_CHARS || /\s/.test(text)) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!isTradingViewHost(url.hostname)) return null;
  url.protocol = 'https:';
  url.hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!url.search && !url.hash && url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  const out = url.toString();
  if (out.length > MAX_TRADE_CHART_LINK_CHARS || !TRADINGVIEW_URL_RE.test(out)) return null;
  return out;
}

/** Valid links from a list, de-duplicated, capped at four. Invalid entries are dropped. */
export function validTradingViewUrls(values) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(values) ? values : [];
  for (const value of list) {
    const url = normalizeTradingViewUrl(value);
    if (!url || seen.has(url)) continue;
    if (out.length >= MAX_TRADE_CHART_LINKS) break;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Links the trader typed. Empty rows are ignored. Any non-empty row that is
 * not a TradingView URL fails the whole save so a bad paste is not dropped.
 */
export function parseChartLinkInputs(values) {
  const list = Array.isArray(values) ? values : [];
  const nonEmpty = list.map((value) => String(value ?? '').trim()).filter(Boolean);
  if (nonEmpty.length > MAX_TRADE_CHART_LINKS) {
    return { ok: false, links: [], error: `ניתן לשמור עד ${MAX_TRADE_CHART_LINKS} קישורי TradingView` };
  }
  const links = [];
  const seen = new Set();
  for (const text of nonEmpty) {
    const url = normalizeTradingViewUrl(text);
    if (!url) {
      return { ok: false, links: [], error: 'כל קישור חייב להיות כתובת של tradingview.com' };
    }
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return { ok: true, links, error: null };
}

/** Fields written on the trade. The single URL stays for older readers. */
export function chartLinkFields(links) {
  const list = validTradingViewUrls(links);
  return {
    tradingViewUrls: list,
    tradingViewUrl: list[0] || '',
  };
}

function sameLinkRows(a, b) {
  const rows = (list) => (Array.isArray(list) ? list : []).map((value) => String(value ?? '').trim()).filter(Boolean);
  const left = rows(a);
  const right = rows(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * What to write when the ticket is saved. New and edited rows must be
 * TradingView URLs. An older single link that is not on TradingView is kept
 * as-is when the trader did not change it, so editing the rest of that trade
 * still saves.
 */
export function chartLinksToSave(trade, inputs) {
  const parsed = parseChartLinkInputs(inputs);
  if (parsed.ok) return { ok: true, fields: chartLinkFields(parsed.links), error: null };
  const legacy = String(trade?.tradingViewUrl || '').trim();
  const unchangedLegacy = trade
    && !Array.isArray(trade.tradingViewUrls)
    && sameLinkRows(inputs, chartLinksForEditor(trade))
    && (!legacy || safeHttpUrl(legacy));
  if (unchangedLegacy) return { ok: true, fields: { tradingViewUrl: legacy }, error: null };
  return { ok: false, fields: null, error: parsed.error };
}

/** Links to show for a trade: the list, or the older single URL when the list is absent. */
export function tradeChartLinks(trade) {
  const list = trade?.tradingViewUrls;
  if (Array.isArray(list) && list.length) return validTradingViewUrls(list);
  if (trade?.tradingViewUrl) {
    const valid = validTradingViewUrls([trade.tradingViewUrl]);
    if (valid.length) return valid;
    const legacy = safeHttpUrl(trade.tradingViewUrl);
    if (legacy) return [legacy];
  }
  return [];
}

/** Raw rows for the editor, including a legacy URL the new list has not replaced. */
export function chartLinksForEditor(trade) {
  const list = trade?.tradingViewUrls;
  const source = Array.isArray(list) && list.length
    ? list
    : (trade?.tradingViewUrl ? [trade.tradingViewUrl] : []);
  const rows = source.map((value) => String(value ?? '')).filter((value) => value.trim()).slice(0, MAX_TRADE_CHART_LINKS);
  return rows.length ? rows : [''];
}

export function tradingViewSnapshotImage(url) {
  const raw = String(url || '').trim();
  if (!/^https:\/\//i.test(raw)) return null;
  if (IMAGE_RE.test(raw)) return raw;
  const m = raw.match(SNAPSHOT_RE);
  if (!m) return null;
  const id = m[1];
  return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
}

/** Chart pages embed. Snapshot pages do not — those have an image preview. */
export function tradingViewEmbedSrc(url) {
  const raw = String(url || '').trim();
  if (!TV_HOST_RE.test(raw)) return null;
  if (SNAPSHOT_RE.test(raw)) return null;
  return raw;
}
