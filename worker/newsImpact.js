/**
 * News → price attribution. Pure functions, no I/O, so they can be unit tested
 * outside the Worker runtime.
 *
 * Three design decisions, each forced by a measurement rather than taste:
 *
 * 1. PRICE-FIRST. Only ~16% of headlines have any price anomaly within ±30
 *    minutes, so triggering on news alone is a false-alarm machine. The move is
 *    the trigger; the news only explains it.
 *
 * 2. DIRECTION-FREE. Replaying 48h of 5m bars, price continued in the same
 *    direction after an anomaly in 2/8 cases at +10m and 3/8 at +30m. Nothing
 *    here may say "likely to rise". It reports what moved, by how much, and what
 *    was published alongside it.
 *
 * 3. ENTITY MENTIONS, NOT STORY DEDUP. The first version clustered near-
 *    duplicate headlines and was validated against a live 200-item feed: six
 *    outlets covering the same "Bitcoin nears $80,000 on Trump support" event
 *    produced six separate single-source clusters, because real headlines about
 *    one event share very few words ("Trump Support" vs "Trump-Fueled Rally").
 *    What actually matters is not "is this the same article" but "how many
 *    independent outlets are talking about this asset right now", so that is
 *    what gets counted.
 */

// A move must clear BOTH gates. Either alone fires constantly: price alone on
// any volatile alt, volume alone on a thin book.
//
// These are calibrated to a 4-hour window, not a 15-minute one. On 2026-10-20
// the rally the headlines described (Bitcoin after Trump's Iran remarks) was
// +1.60% over the trailing 4 hours with volume 3.1× the prior 4 hours. The
// largest 15-minute slice that day was +1.33%. A gate of 2.5% inside 15
// minutes therefore stayed quiet for the entire session — price never cleared
// it, and once the spike was over the 15-minute volume ratio collapsed because
// the spike had become the baseline. 1.5% over 4 hours is a real major-asset
// move; 0.2% on ordinary volume is not.
export const MOVE_MIN_PCT = 1.5;       // absolute % over the window
export const MOVE_MIN_VOL_X = 2;       // window volume vs the prior window
export const MOVE_WINDOW_BARS = 48;    // 48 × 5m = 4 hours
export const MOVE_BASELINE_BARS = 48;  // the 4 hours before that
export const MOVE_BAR_MIN = 5;

// Who gets a kline read. Majors are always included: ranking by the last
// snapshot (about 10 minutes) spends the budget on whichever alt just
// twitched and never looks at BTC once the news move is a couple of hours
// old. Assets the headlines are actually naming come next, then a few
// short-window spikes. Hard cap so the cron stays inside the subrequest budget.
export const SCAN_CAP = 10;
export const SCAN_MAJORS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
export const SCAN_MIN_QUOTE_VOL = 5_000_000;

// Corroboration thresholds. A named asset is strong evidence, so two outlets is
// enough. A macro theme is weaker — it explains the whole market, not this
// coin — so it has to be genuinely loud before it may be offered as the cause.
export const MIN_SOURCES_ASSET = 2;
export const MIN_SOURCES_MACRO = 3;

// How far back a mention may sit and still be offered as the explanation.
export const ATTRIBUTION_WINDOW_MIN = 90;

const norm = (v) => String(v ?? '').trim();
const lower = (v) => norm(v).toLowerCase();

/**
 * Macro themes worth attributing a broad move to. Deliberately narrow: these
 * are the events that move the whole crypto market, not every政策 headline.
 */
export const MACRO_TAGS = [
  { key: 'trump', label: 'טראמפ', re: /\btrump\b|truth social|realdonaldtrump/i },
  { key: 'iran', label: 'איראן', re: /\biran(?:ian)?\b/i },
  { key: 'policy', label: 'רגולציה וקונגרס', re: /\b(congress|senate|house bill|white house|executive order|cftc|\bsec\b|lawsuit|regulat\w*|legislation)\b/i },
  { key: 'fed', label: 'הפד וריבית', re: /\b(fed|fomc|powell|rate cut|rate hike|interest rate|cpi|inflation|jobs report|nfp)\b/i },
  { key: 'etf', label: 'ETF וזרימות', re: /\betfs?\b|spot btc etf|inflow|outflow/i },
  { key: 'treasury', label: 'אוצר ארה"ב', re: /\btreasury\b|buyback/i },
  { key: 'tariff', label: 'מכסים וסחר', re: /\btariffs?\b|trade war/i },
];

// Names that appear in headlines instead of tickers. Only 36 of 200 live items
// carried a machine-readable symbol, so without this most attribution is lost.
export const NAME_TO_TICKER = [
  { ticker: 'btc', re: /\bbitcoin\b|\bbtc\b/i },
  { ticker: 'zec', re: /\bzcash\b|\bzec\b/i },
  { ticker: 'eth', re: /\bethereum\b|\beth\b|\bether\b/i },
  { ticker: 'sol', re: /\bsolana\b|\bsol\b/i },
  { ticker: 'xrp', re: /\bripple\b|\bxrp\b/i },
  { ticker: 'bnb', re: /\bbinance coin\b|\bbnb\b/i },
  { ticker: 'doge', re: /\bdogecoin\b|\bdoge\b/i },
  { ticker: 'ada', re: /\bcardano\b|\bada\b/i },
  { ticker: 'link', re: /\bchainlink\b|\blink\b/i },
  { ticker: 'avax', re: /\bavalanche\b|\bavax\b/i },
  { ticker: 'ton', re: /\btoncoin\b|\bton\b/i },
];

// Real tokens whose tickers are also ordinary English words. The upstream feed
// tagged "THE BLOCK: AI adoption in crypto crime..." with THE_USDT and AI_USDT,
// which would have attributed an unrelated price move to a headline about
// neither token. These need the title to name the ticker unmistakably — as
// $THE, or as a standalone all-caps word — before they count.
export const AMBIGUOUS_TICKERS = new Set([
  'the', 'ai', 'on', 'it', 'me', 'go', 'in', 'up', 'we', 'id', 'my', 'so',
  'now', 'one', 'all', 'for', 'new', 'win', 'top', 'run', 'time', 'best',
  'super', 'people', 'gas', 'sun', 'age', 'era', 'arc', 'ice', 'sky',
]);

function tickerNamedExplicitly(ticker, title) {
  // Only the "$THE" cashtag form counts. An all-caps standalone word cannot be
  // used as evidence: outlet prefixes are themselves all-caps, so "THE BLOCK:"
  // and "THE NATIONAL:" would both read as the THE token.
  return new RegExp(`\\$${ticker.toUpperCase()}\\b`).test(title);
}

// "BTC_USDT" / "BTCUSDT" / "btc" all describe the same asset.
export function baseTicker(symbol) {
  const s = lower(symbol).replace(/[^a-z0-9]/g, '');
  if (!s) return '';
  for (const quote of ['usdt', 'usdc', 'usd', 'busd', 'btc', 'eth', 'krw']) {
    if (s.length > quote.length && s.endsWith(quote)) return s.slice(0, -quote.length);
  }
  return s;
}

/** Which assets and which macro themes a single headline is about. */
export function extractEntities(item) {
  const title = norm(item?.title);
  const tickers = new Set();
  for (const sym of item?.symbols || []) {
    const t = baseTicker(sym);
    if (!t) continue;
    if (AMBIGUOUS_TICKERS.has(t) && !tickerNamedExplicitly(t, title)) continue;
    tickers.add(t);
  }
  for (const { ticker, re } of NAME_TO_TICKER) {
    if (re.test(title)) tickers.add(ticker);
  }
  const macro = MACRO_TAGS.filter((m) => m.re.test(title)).map((m) => m.key);
  return { tickers: [...tickers], macro };
}

/**
 * How loudly each entity is being covered right now, and by whom.
 *
 * @param {Array} items [{id, title, url, source, ms, symbols[]}]
 * @returns {Map} key ("ticker:btc" | "macro:trump") -> mention record
 */
export function buildMentionIndex(items, { windowMin = ATTRIBUTION_WINDOW_MIN, now = 0 } = {}) {
  const cutoff = now - windowMin * 60000;
  const index = new Map();

  const add = (key, kind, entity, item) => {
    const cur = index.get(key) || { key, kind, entity, sources: [], newestMs: 0, title: '', url: '' };
    const src = norm(item.source) || 'unknown';
    // Distinct OUTLETS, not distinct articles. One outlet republishing the same
    // story five times is one voice, and must not look like five.
    if (!cur.sources.includes(src)) cur.sources.push(src);
    const ms = Number(item.ms) || 0;
    if (ms > cur.newestMs) {
      cur.newestMs = ms;
      cur.title = norm(item.title);
      cur.url = item.url || cur.url;
    }
    index.set(key, cur);
  };

  for (const item of items || []) {
    const ms = Number(item?.ms) || 0;
    if (!norm(item?.title) || !ms || ms < cutoff) continue;
    const { tickers, macro } = extractEntities(item);
    for (const t of tickers) add(`ticker:${t}`, 'ticker', t, item);
    for (const m of macro) add(`macro:${m}`, 'macro', m, item);
  }
  return index;
}

/**
 * Price change and volume multiple over the candle window.
 * `rows` are oldest-first Binance-shaped klines: index 1 open, 4 close, 5 volume.
 * Returns null when there isn't a full window plus a full baseline.
 */
export function windowMove(symbol, rows, {
  windowBars = MOVE_WINDOW_BARS,
  baselineBars = MOVE_BASELINE_BARS,
  barMin = MOVE_BAR_MIN,
} = {}) {
  if (!Array.isArray(rows) || rows.length < windowBars + baselineBars) return null;
  const window = rows.slice(-windowBars);
  const baseline = rows.slice(-(windowBars + baselineBars), -windowBars);
  const openPrice = Number(window[0]?.[1]);
  const closePrice = Number(window[window.length - 1]?.[4]);
  if (!(openPrice > 0) || !(closePrice > 0)) return null;

  const avgVol = (bars) => bars.reduce((sum, k) => sum + (Number(k?.[5]) || 0), 0) / bars.length;
  const baseVol = avgVol(baseline);
  if (!(baseVol > 0)) return null;

  return {
    symbol,
    changePct: ((closePrice - openPrice) / openPrice) * 100,
    volumeX: avgVol(window) / baseVol,
    windowMin: windowBars * barMin,
  };
}

/**
 * Symbols worth a kline read. Liquid USDT pairs only.
 * `mentioned` is base tickers the headlines are naming, loudest first.
 */
export function rankScanSymbols(tickers, prevPrices = {}, mentioned = [], {
  cap = SCAN_CAP,
  majors = SCAN_MAJORS,
  minQuoteVol = SCAN_MIN_QUOTE_VOL,
  topSpike = 4,
} = {}) {
  const liquid = new Map();
  for (const t of tickers || []) {
    const symbol = String(t?.symbol || '');
    if (!symbol.endsWith('USDT')) continue;
    if ((Number(t.quoteVolume) || 0) < minQuoteVol) continue;
    if (!(Number(t.lastPrice) > 0)) continue;
    liquid.set(symbol, t);
  }

  const out = [];
  const push = (symbol) => {
    if (!symbol || out.includes(symbol) || !liquid.has(symbol) || out.length >= cap) return;
    out.push(symbol);
  };

  for (const m of majors) push(m);
  for (const base of mentioned) {
    const ticker = String(base || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ticker) push(`${ticker}USDT`);
  }

  const spikes = [...liquid.values()].map((t) => {
    const before = Number(prevPrices[t.symbol]) || 0;
    const nowPrice = Number(t.lastPrice);
    const delta = before > 0
      ? ((nowPrice - before) / before) * 100
      : (Number(t.priceChangePercent) || 0);
    return { symbol: t.symbol, delta };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const s of spikes.slice(0, topSpike)) push(s.symbol);

  return out;
}

/** A move that cleared both gates. Direction is recorded, never extrapolated. */
export function isAnomalous(move) {
  return Math.abs(Number(move?.changePct) || 0) >= MOVE_MIN_PCT
    && (Number(move?.volumeX) || 0) >= MOVE_MIN_VOL_X;
}

const macroLabel = (key) => MACRO_TAGS.find((m) => m.key === key)?.label || key;

/**
 * Pair each anomalous move with the best-corroborated explanation available.
 *
 * @param {Array} moves [{symbol, changePct, volumeX, windowMin}]
 * @param {Map}   index output of buildMentionIndex
 */
export function attributeMoves(moves, index, { now = 0 } = {}) {
  const out = [];
  const mentions = index instanceof Map ? index : new Map();

  for (const move of moves || []) {
    if (!isAnomalous(move)) continue;
    const ticker = baseTicker(move.symbol);
    if (!ticker) continue;

    // The asset being named directly beats a market-wide theme, which beats
    // admitting we do not know — but each has to clear its own bar first.
    const asset = mentions.get(`ticker:${ticker}`);
    const direct = asset && asset.sources.length >= MIN_SOURCES_ASSET ? asset : null;

    let macro = null;
    if (!direct) {
      for (const rec of mentions.values()) {
        if (rec.kind !== 'macro' || rec.sources.length < MIN_SOURCES_MACRO) continue;
        if (!macro || rec.sources.length > macro.sources.length) macro = rec;
      }
    }

    const hit = direct || macro;
    let cause = 'unexplained';
    if (direct) cause = 'direct';
    else if (macro) cause = 'macro';

    out.push({
      symbol: norm(move.symbol),
      ticker: ticker.toUpperCase(),
      changePct: Math.round((Number(move.changePct) || 0) * 100) / 100,
      volumeX: Math.round((Number(move.volumeX) || 0) * 10) / 10,
      windowMin: Number(move.windowMin) || 0,
      cause,
      theme: cause === 'macro' ? macroLabel(hit.entity) : null,
      story: hit
        ? {
          title: hit.title,
          url: hit.url,
          sources: hit.sources,
          sourceCount: hit.sources.length,
          ageMin: now ? Math.max(0, Math.round((now - hit.newestMs) / 60000)) : null,
        }
        : null,
    });
  }

  // Biggest move first; an explained move outranks an equal unexplained one,
  // because it is the one the reader can actually do something with.
  return out.sort((a, b) => {
    if ((a.cause === 'unexplained') !== (b.cause === 'unexplained')) {
      return a.cause === 'unexplained' ? 1 : -1;
    }
    return Math.abs(b.changePct) - Math.abs(a.changePct);
  });
}

/**
 * The sentence the user reads. It states what moved, by how much, and what was
 * published alongside it — and explicitly refuses to predict, because the data
 * does not support a direction claim.
 */
function spanPhrase(min) {
  const m = Number(min) || 0;
  if (m > 0 && m % 60 === 0) {
    const h = m / 60;
    if (h === 1) return 'בשעה האחרונה';
    if (h === 2) return 'בשעתיים האחרונות';
    return `ב-${h} השעות האחרונות`;
  }
  return `ב-${m} דקות`;
}

export function describeFinding(f) {
  const dir = f.changePct >= 0 ? 'עלה' : 'ירד';
  const head = `${f.ticker} ${dir} ${Math.abs(f.changePct)}% ${spanPhrase(f.windowMin)}, בווליום גבוה פי ${f.volumeX} מהרגיל`;
  if (!f.story) {
    return `${head}. לא נמצא סיקור מאושש שמסביר את התנועה — ייתכן שהסיבה עדיין לא פורסמה.`;
  }
  const when = f.story.ageMin === null ? '' : `, האחרון לפני ${f.story.ageMin} דקות`;
  const lead = f.cause === 'macro'
    ? `ברקע, ${f.story.sourceCount} מקורות עוסקים כרגע בנושא ${f.theme}${when}`
    : `במקביל ${f.story.sourceCount} מקורות מדווחים על ${f.ticker}${when}`;
  return `${head}. ${lead}: "${f.story.title}". אין למערכת בסיס לומר לאן זה ימשיך.`;
}
