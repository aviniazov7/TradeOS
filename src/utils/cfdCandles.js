// Candle feed for spot/index CFDs. The live /candles worker already maps these
// roots to Yahoo continuous contracts (GC=F, SI=F, NQ=F). Yahoo has no XAUUSD
// spot series; GC=F is the same $/oz quote. The caller rebases the bars onto
// the fill so the futures basis is not counted as excursion.
const CFD_CANDLE_PROXY = {
  XAUUSD: 'GC',
  XAGUSD: 'SI',
  NAS100: 'NQ',
  US100: 'NQ',
};

/** { asset, symbol, rebase } for a CFD, or null when the symbol is not one. */
export function cfdCandleRequest(symbol) {
  const key = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const proxy = CFD_CANDLE_PROXY[key];
  return proxy ? { asset: 'futures', symbol: proxy, rebase: true } : null;
}
