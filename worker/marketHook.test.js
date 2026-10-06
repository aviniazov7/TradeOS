import { describe, it, expect } from 'vitest';
import { pickMarketFacts, factPercents, buildHookUserMessage, validateHook, templateHook } from './marketHook';

const T = (symbol, pct, price = 10, turnover = 50_000_000) => ({ symbol, price24hPcnt: String(pct), lastPrice: String(price), turnover24h: String(turnover) });

const tickers = [
  T('BTCUSDT', 0.0812, 72000, 2e9),
  T('ETHUSDT', -0.012, 2500, 1e9),
  T('SOLUSDT', 0.151, 180),
  T('DOGEUSDT', 0.054, 0.2),
  T('XRPUSDT', -0.073, 1.5),
  T('PEPEUSDT', 0.9, 0.00001, 1_000),      // illiquid → ignored
  T('USDCUSDT', 0.0001, 1, 5e9),           // stablecoin → ignored
  T('BTC3LUSDT', 0.25, 1, 5e8),            // leveraged token → ignored
  T('BTCEUR', 0.08, 66000, 1e9),           // not a USDT pair → ignored
];
const digest = { stories: [{ headline: 'קרן ETF רשמה זרם שיא', impact: 'medium' }, { headline: 'הפד מסמן הורדת ריבית', impact: 'high' }] };

describe('pickMarketFacts', () => {
  const f = pickMarketFacts(tickers, digest);
  it('reads BTC/ETH and liquid movers, skipping junk', () => {
    expect(f.btc).toEqual({ coin: 'BTC', price: 72000, change: 8.1 });
    expect(f.eth.change).toBe(-1.2);
    expect(f.gainers.map((g) => g.coin)).toEqual(['SOL', 'DOGE']);
    expect(f.losers.map((g) => g.coin)).toEqual(['XRP']);
  });
  it('puts high-impact headlines first', () => {
    expect(f.headlines[0]).toBe('הפד מסמן הורדת ריבית');
  });
  it('lists only the real percentages', () => {
    expect(factPercents(f).sort((a, b) => a - b)).toEqual([1.2, 5.4, 7.3, 8.1, 15.1]);
  });
  it('builds a model message from the facts only', () => {
    const msg = buildHookUserMessage(f);
    expect(msg).toContain('ביטקוין: BTC +8.1%');
    expect(msg).toContain('SOL +15.1%');
    expect(msg).not.toContain('PEPE');
  });
});

describe('validateHook', () => {
  const f = pickMarketFacts(tickers, digest);
  const good = { title: 'ביטקוין +8.1% היום 🚀', push: 'SOL זינק 15.1%. מה עם העסקאות שלך?', email: 'הביטקוין עלה 8.1%.\n\nבדוק את התיק.', cta: 'לשוק', path: '/market' };

  it('accepts copy whose numbers are all real', () => {
    expect(validateHook(good, f)).toMatchObject({ title: good.title, path: '/market' });
  });
  it('rejects an invented percentage', () => {
    expect(validateHook({ ...good, push: 'ETH קפץ 12%!' }, f)).toBeNull();
  });
  it('rejects missing fields and unknown paths fall back', () => {
    expect(validateHook({ title: 'x' }, f)).toBeNull();
    expect(validateHook({ ...good, path: 'https://evil.com' }, f).path).toBe('/market');
  });
});

describe('templateHook', () => {
  it('leads with the biggest real move', () => {
    const h = templateHook(pickMarketFacts(tickers, digest));
    expect(h.title).toContain('SOL +15.1%');
    expect(h.push).toContain('זינק 15.1%');
    expect(h.email).toContain('הכותרת החמה: הפד מסמן הורדת ריבית');
    // its own numbers pass the same validation
    expect(validateHook(h, pickMarketFacts(tickers, digest))).not.toBeNull();
  });
  it('still says something with no data', () => {
    expect(templateHook({ btc: null, eth: null, gainers: [], losers: [], headlines: [] }).title).toBeTruthy();
  });
});
