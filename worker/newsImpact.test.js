import { describe, it, expect } from 'vitest';
import {
  baseTicker, extractEntities, buildMentionIndex, isAnomalous, attributeMoves,
  describeFinding, windowMove, rankScanSymbols, MOVE_MIN_PCT, MOVE_MIN_VOL_X,
  MOVE_WINDOW_BARS, MOVE_BASELINE_BARS, MIN_SOURCES_ASSET, MIN_SOURCES_MACRO,
} from './newsImpact';

// The whole point of this module is that it does NOT cry wolf and does NOT
// predict. Both properties are asserted here directly.

const NOW = new Date('2026-08-21T15:00:00Z').getTime();
const minsAgo = (n) => NOW - n * 60000;

describe('baseTicker', () => {
  it('reduces every symbol shape to the same base', () => {
    expect(baseTicker('BTC_USDT')).toBe('btc');
    expect(baseTicker('BTCUSDT')).toBe('btc');
    expect(baseTicker('btc')).toBe('btc');
    expect(baseTicker('XRP_BTC')).toBe('xrp');
    expect(baseTicker('BTC-USD')).toBe('btc');
  });

  it('does not eat a ticker that merely ends in a quote name', () => {
    expect(baseTicker('USDT')).toBe('usdt'); // stripping would leave nothing
  });

  it('survives junk', () => {
    expect(baseTicker('')).toBe('');
    expect(baseTicker(null)).toBe('');
  });
});

describe('extractEntities', () => {
  it('reads tickers from machine-readable symbols', () => {
    const e = extractEntities({ title: 'Something happened', symbols: ['XRP_USDT', 'XRP_BTC'] });
    expect(e.tickers).toEqual(['xrp']);
  });

  it('reads tickers from the headline text, because most items carry no symbols', () => {
    // Measured on a live 200-item feed: only 36 had symbols.
    const e = extractEntities({ title: 'WSJ: Bitcoin Nears $80,000 on Trump Support, Weaker Dollar' });
    expect(e.tickers).toContain('btc');
    expect(e.macro).toContain('trump');
  });

  it('tags macro themes independently of the asset', () => {
    const e = extractEntities({ title: 'Fed holds rates steady as CPI cools' });
    expect(e.macro).toContain('fed');
    expect(e.tickers).toEqual([]);
  });

  it('reads a Trump/Iran headline and a Zcash name', () => {
    const iran = extractEntities({ title: 'Trump says a deal with Iran is close, Bitcoin rises' });
    expect(iran.macro).toEqual(expect.arrayContaining(['trump', 'iran']));
    expect(iran.tickers).toContain('btc');
    const zec = extractEntities({ title: 'Zcash leads the crypto bounce, surging 8.5%' });
    expect(zec.tickers).toContain('zec');
  });

  it('rejects a ticker that is an ordinary English word unless the title names it', () => {
    // The live feed tagged this exact headline with THE_USDT and AI_USDT.
    const spurious = extractEntities({
      title: 'THE BLOCK: AI adoption in crypto crime rose 40% over the past year',
      symbols: ['THE_USDT', 'AI_USDT'],
    });
    expect(spurious.tickers).toEqual([]);

    // But a headline that genuinely names the token still counts.
    const real = extractEntities({ title: 'Aethir ($ATH) and $THE rally after listing', symbols: ['THE_USDT'] });
    expect(real.tickers).toContain('the');
  });

  it('does not invent entities for an unrelated headline', () => {
    const e = extractEntities({ title: 'Aligned Launches ALIGN, the Native Token of Its Full Stack' });
    expect(e.tickers).toEqual([]);
    expect(e.macro).toEqual([]);
  });
});

describe('buildMentionIndex', () => {
  const items = [
    { title: 'WSJ: Bitcoin Nears $80,000 on Trump Support, Weaker Dollar', source: 'WSJ', ms: minsAgo(20) },
    { title: 'BARRONS: Bitcoin Heads for Best Week as Trump-Fueled Crypto Rally Rages On', source: 'Barrons', ms: minsAgo(14) },
    { title: 'THE BLOCK: Bitcoin surge toward $80K points to liquidity-driven momentum shift', source: 'The Block', ms: minsAgo(6) },
  ];

  it('counts outlets talking about one asset, even when the wording barely overlaps', () => {
    // This is the case that broke the previous story-dedup design on live data:
    // three real headlines about one event share almost no words.
    const idx = buildMentionIndex(items, { now: NOW });
    const btc = idx.get('ticker:btc');
    expect(btc.sources).toHaveLength(3);
    expect(btc.title).toContain('THE BLOCK'); // newest represents it
  });

  it('counts one outlet republishing as one voice, not many', () => {
    const spam = [
      { title: 'Bitcoin rallies hard', source: 'CoinDesk', ms: minsAgo(9) },
      { title: 'Bitcoin rallies again', source: 'CoinDesk', ms: minsAgo(7) },
      { title: 'Bitcoin keeps rallying', source: 'CoinDesk', ms: minsAgo(5) },
    ];
    expect(buildMentionIndex(spam, { now: NOW }).get('ticker:btc').sources).toHaveLength(1);
  });

  it('indexes macro themes separately from assets', () => {
    const idx = buildMentionIndex(items, { now: NOW });
    expect(idx.get('macro:trump').sources).toHaveLength(2);
    expect(idx.has('ticker:btc')).toBe(true);
  });

  it('drops anything outside the attribution window', () => {
    const idx = buildMentionIndex(
      [{ title: 'Bitcoin did something ages ago', source: 'A', ms: minsAgo(400) }],
      { now: NOW },
    );
    expect(idx.size).toBe(0);
  });
});

describe('isAnomalous', () => {
  it('requires BOTH price and volume to clear their gate', () => {
    expect(isAnomalous({ changePct: MOVE_MIN_PCT, volumeX: MOVE_MIN_VOL_X })).toBe(true);
    expect(isAnomalous({ changePct: 10, volumeX: 1 })).toBe(false);
    expect(isAnomalous({ changePct: 0.4, volumeX: 20 })).toBe(false);
  });

  it('treats a fall exactly like a rise', () => {
    expect(isAnomalous({ changePct: -4, volumeX: 5 })).toBe(true);
  });

  it('survives junk', () => {
    expect(isAnomalous(null)).toBe(false);
    expect(isAnomalous({})).toBe(false);
  });
});

describe('attributeMoves', () => {
  const news = (extra = []) => buildMentionIndex([
    { title: 'WSJ: Bitcoin Nears $80,000 on Trump Support', source: 'WSJ', ms: minsAgo(20) },
    { title: 'BARRONS: Bitcoin Best Week as Trump-Fueled Rally Rages', source: 'Barrons', ms: minsAgo(14) },
    { title: 'CNBC: Trump comments lift risk assets', source: 'CNBC', ms: minsAgo(9) },
    ...extra,
  ], { now: NOW });

  it('attributes a move to the asset when outlets name it', () => {
    const [f] = attributeMoves([{ symbol: 'BTCUSDT', changePct: 3.2, volumeX: 4, windowMin: 15 }], news(), { now: NOW });
    expect(f.cause).toBe('direct');
    expect(f.story.sourceCount).toBe(2);
  });

  it('falls back to a macro theme for an asset nobody named', () => {
    const [f] = attributeMoves([{ symbol: 'AVAXUSDT', changePct: 5, volumeX: 6, windowMin: 15 }], news(), { now: NOW });
    expect(f.cause).toBe('macro');
    expect(f.theme).toBe('טראמפ');
    expect(f.story.sourceCount).toBeGreaterThanOrEqual(MIN_SOURCES_MACRO);
  });

  it('says unexplained rather than inventing a cause', () => {
    const quiet = buildMentionIndex([{ title: 'Some tiny project ships a testnet', source: 'A', ms: minsAgo(5) }], { now: NOW });
    const [f] = attributeMoves([{ symbol: 'DOGEUSDT', changePct: 6, volumeX: 8, windowMin: 15 }], quiet, { now: NOW });
    expect(f.cause).toBe('unexplained');
    expect(f.story).toBeNull();
  });

  it('refuses a single outlet as an asset cause', () => {
    const lonely = buildMentionIndex([{ title: 'Solana ships something', source: 'A', ms: minsAgo(5) }], { now: NOW });
    const [f] = attributeMoves([{ symbol: 'SOLUSDT', changePct: 5, volumeX: 6, windowMin: 15 }], lonely, { now: NOW });
    expect(MIN_SOURCES_ASSET).toBeGreaterThan(1);
    expect(f.cause).toBe('unexplained');
  });

  it('holds macro to a higher bar than a named asset', () => {
    const twoMacro = buildMentionIndex([
      { title: 'WSJ: Trump comments move markets', source: 'WSJ', ms: minsAgo(10) },
      { title: 'CNBC: Trump remarks ripple through risk assets', source: 'CNBC', ms: minsAgo(8) },
    ], { now: NOW });
    const [f] = attributeMoves([{ symbol: 'AVAXUSDT', changePct: 5, volumeX: 6, windowMin: 15 }], twoMacro, { now: NOW });
    expect(MIN_SOURCES_MACRO).toBeGreaterThan(MIN_SOURCES_ASSET);
    expect(f.cause).toBe('unexplained'); // 2 macro sources is not enough
  });

  it('emits nothing when no move clears the gates — the quiet case must stay quiet', () => {
    const moves = [
      { symbol: 'BTCUSDT', changePct: 1.2, volumeX: 9, windowMin: 15 },
      { symbol: 'ETHUSDT', changePct: 8, volumeX: 1.1, windowMin: 15 },
    ];
    expect(attributeMoves(moves, news(), { now: NOW })).toHaveLength(0);
  });

  it('ranks a smaller explained move above a bigger unexplained one', () => {
    // Only two outlets mention Trump, which is below the macro bar, so DOGE has
    // no cause available while BTC is named directly.
    const idx = buildMentionIndex([
      { title: 'WSJ: Bitcoin Nears $80,000 on Trump Support', source: 'WSJ', ms: minsAgo(20) },
      { title: 'BARRONS: Bitcoin Best Week as Trump-Fueled Rally Rages', source: 'Barrons', ms: minsAgo(14) },
    ], { now: NOW });
    const out = attributeMoves([
      { symbol: 'DOGEUSDT', changePct: 9, volumeX: 5, windowMin: 15 },
      { symbol: 'BTCUSDT', changePct: 3, volumeX: 6, windowMin: 15 },
    ], idx, { now: NOW });
    expect(out[0].ticker).toBe('BTC');
    expect(out[0].cause).toBe('direct');
    expect(out[1].cause).toBe('unexplained');
  });

  it('ranks two explained moves by size', () => {
    const out = attributeMoves([
      { symbol: 'BTCUSDT', changePct: 3, volumeX: 6, windowMin: 15 },
      { symbol: 'DOGEUSDT', changePct: 9, volumeX: 5, windowMin: 15 },
    ], news(), { now: NOW });
    expect(out[0].ticker).toBe('DOGE'); // macro-explained via Trump, and bigger
    expect(out[0].cause).toBe('macro');
  });

  it('tolerates a missing index', () => {
    expect(attributeMoves([{ symbol: 'BTCUSDT', changePct: 5, volumeX: 5, windowMin: 15 }], null))
      .toHaveLength(1);
  });
});

describe('describeFinding', () => {
  const base = { ticker: 'BTC', changePct: 3.2, volumeX: 4, windowMin: 15 };
  const story = { title: 'Bitcoin Nears $80,000 on Trump Support', url: '', sources: ['WSJ', 'Barrons'], sourceCount: 2, ageMin: 12 };

  it('never predicts a direction', () => {
    const s = describeFinding({ ...base, cause: 'direct', theme: null, story });
    expect(s).toContain('אין למערכת בסיס לומר לאן זה ימשיך');
    for (const forbidden of ['צפוי', 'סיכוי שתהיה', 'קנה', 'מכור', 'המלצה']) {
      expect(s).not.toContain(forbidden);
    }
  });

  it('states the corroboration and the age of the coverage', () => {
    const s = describeFinding({ ...base, cause: 'direct', theme: null, story: { ...story, sourceCount: 3 } });
    expect(s).toContain('3 מקורות');
    expect(s).toContain('לפני 12 דקות');
  });

  it('names the theme when the cause is macro', () => {
    const s = describeFinding({ ...base, cause: 'macro', theme: 'טראמפ', story });
    expect(s).toContain('טראמפ');
  });

  it('admits when it has no explanation instead of guessing', () => {
    const s = describeFinding({ ...base, cause: 'unexplained', theme: null, story: null });
    expect(s).toContain('לא נמצא סיקור מאושש');
  });

  it('words a fall correctly', () => {
    const s = describeFinding({ ...base, changePct: -3.2, cause: 'unexplained', theme: null, story: null });
    expect(s).toContain('ירד 3.2%');
    expect(s).not.toContain('עלה');
  });

  it('phrases a four-hour window in hours', () => {
    const s = describeFinding({ ...base, windowMin: 240, cause: 'unexplained', theme: null, story: null });
    expect(s).toContain('ב-4 השעות האחרונות');
    expect(s).not.toContain('240 דקות');
  });
});

// Oldest-first Binance-shaped 5m candles. The last `windowBars` are the move;
// the bars before them are the volume baseline. Prices match the 2026-10-20
// session: BTC went from about 81,500 to 82,805 (+1.60%) over four hours.
function candles({
  bars = MOVE_BASELINE_BARS + MOVE_WINDOW_BARS,
  windowBars = MOVE_WINDOW_BARS,
  price0 = 81500,
  price1 = 81500,
  baseVol = 10,
  windowVol = 10,
}) {
  const rows = [];
  const start = bars - windowBars;
  for (let i = 0; i < bars; i++) {
    const inWindow = i >= start;
    const t = inWindow ? (i - start) / (windowBars - 1) : 0;
    const price = inWindow ? price0 + (price1 - price0) * t : price0;
    const vol = inWindow ? windowVol : baseVol;
    rows.push([i * 300000, price, price, price, price, vol]);
  }
  return rows;
}

describe('windowMove with a real session', () => {
  it('detects the 2026-10-20 BTC rally and attributes it to the Trump/Iran headlines', () => {
    // +1.60% over 4h, volume 3.1× the prior 4h. The old gate (2.5% inside 15
    // minutes) rejected this: the biggest 15-minute slice that day was +1.33%.
    const move = windowMove('BTCUSDT', candles({ price0: 81500, price1: 82805, baseVol: 10, windowVol: 31 }));
    expect(move.windowMin).toBe(240);
    expect(move.changePct).toBeGreaterThan(1.5);
    expect(move.changePct).toBeLessThan(2.5);
    expect(move.volumeX).toBeGreaterThan(MOVE_MIN_VOL_X);
    expect(isAnomalous(move)).toBe(true);

    const idx = buildMentionIndex([
      { title: 'Trump says Iran deal is close as Bitcoin reclaims $83,000', source: 'WSJ', ms: minsAgo(40) },
      { title: 'Bitcoin rises after Trump remarks on an Iran agreement', source: 'CoinDesk', ms: minsAgo(25) },
      { title: 'Crypto jumps as Trump talks up a deal with Iran', source: 'CNBC', ms: minsAgo(12) },
    ], { now: NOW });
    const [f] = attributeMoves([move], idx, { now: NOW });
    expect(f.ticker).toBe('BTC');
    expect(f.cause).toBe('direct');
    expect(f.story.title).toMatch(/Iran|Trump|Bitcoin/);
    expect(f.story.sourceCount).toBeGreaterThanOrEqual(MIN_SOURCES_ASSET);
    const sentence = describeFinding({ ...f, theme: f.theme });
    expect(sentence).toContain('BTC');
    expect(sentence).toContain('עלה');
    expect(sentence).toMatch(/Iran|Trump|Bitcoin/);
  });

  it('stays quiet when price and volume never leave the ordinary range', () => {
    // +0.17% and 1.2× volume — a flat afternoon. Both gates miss, so the
    // panel keeps the "nothing crossed the threshold" message.
    const move = windowMove('BTCUSDT', candles({ price0: 82000, price1: 82140, baseVol: 10, windowVol: 12 }));
    expect(Math.abs(move.changePct)).toBeLessThan(MOVE_MIN_PCT);
    expect(move.volumeX).toBeLessThan(MOVE_MIN_VOL_X);
    expect(isAnomalous(move)).toBe(false);
    const idx = buildMentionIndex([
      { title: 'Bitcoin holds steady as traders wait', source: 'WSJ', ms: minsAgo(20) },
      { title: 'Bitcoin little changed on the day', source: 'CoinDesk', ms: minsAgo(10) },
    ], { now: NOW });
    expect(attributeMoves([move], idx, { now: NOW })).toEqual([]);
  });

  it('rejects a drift that is large in price but ordinary in volume', () => {
    const move = windowMove('ETHUSDT', candles({ price0: 3000, price1: 3090, baseVol: 10, windowVol: 12 }));
    expect(move.changePct).toBeGreaterThan(MOVE_MIN_PCT);
    expect(isAnomalous(move)).toBe(false);
  });
});

describe('rankScanSymbols', () => {
  const tickers = [
    { symbol: 'BTCUSDT', lastPrice: '82800', quoteVolume: '1100000000', priceChangePercent: '1.6' },
    { symbol: 'ETHUSDT', lastPrice: '3200', quoteVolume: '500000000', priceChangePercent: '2.2' },
    { symbol: 'SOLUSDT', lastPrice: '180', quoteVolume: '200000000', priceChangePercent: '2.0' },
    { symbol: 'XRPUSDT', lastPrice: '0.5', quoteVolume: '100000000', priceChangePercent: '2.0' },
    { symbol: 'BNBUSDT', lastPrice: '600', quoteVolume: '60000000', priceChangePercent: '1.4' },
    { symbol: 'ZECUSDT', lastPrice: '1210', quoteVolume: '165000000', priceChangePercent: '6.8' },
    { symbol: 'DUSTUSDT', lastPrice: '0.01', quoteVolume: '1000', priceChangePercent: '40' },
    ...['AAA', 'BBB', 'CCC', 'DDD'].map((s, i) => ({
      symbol: `${s}USDT`, lastPrice: '1', quoteVolume: '20000000', priceChangePercent: String(3 + i),
    })),
  ];
  // BTC barely moved since the last snapshot. Four alts twitched harder.
  const prev = Object.fromEntries(tickers.map((t) => [t.symbol, Number(t.lastPrice)]));
  prev.AAAUSDT = 0.9;
  prev.BBBUSDT = 0.9;
  prev.CCCUSDT = 0.9;
  prev.DDDUSDT = 0.9;
  prev.BTCUSDT = 82790;

  it('still reads BTC and a headline-named coin when the short-window ranking ignores them', () => {
    const symbols = rankScanSymbols(tickers, prev, ['zec', 'btc']);
    expect(symbols.slice(0, 5)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT']);
    expect(symbols).toContain('ZECUSDT');
    expect(symbols).not.toContain('DUSTUSDT');
    expect(symbols.length).toBeLessThanOrEqual(10);
  });
});
