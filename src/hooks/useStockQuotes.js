import { useWorkerQuotes } from './useWorkerQuotes';
import { stockSymbol } from '../utils/stocks';

// Live stock quotes for the given tickers — { AAPL: { price, change24h,
// prevClose, name, exchange, marketState } }. 30s refresh: the worker's edge
// cache is 30s too, so polling faster would only re-read the same answer.
export function useStockQuotes(symbols = [], { enabled = true } = {}) {
  const list = [...new Set(symbols.map(stockSymbol).filter(Boolean))].sort();
  const { prices, loading } = useWorkerQuotes('/stk/quotes', list, { enabled: enabled && list.length > 0, intervalMs: 30_000 });
  return { quotes: prices, loading };
}
