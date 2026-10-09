import { describe, it, expect } from 'vitest';
import { tickerView, MIN_SCROLL_ITEMS } from './priceTicker';

describe('tickerView', () => {
  it('shows the skeleton while nothing is in and a feed is still loading', () => {
    expect(tickerView({ itemCount: 0, loading: true, failed: false })).toEqual({ state: 'loading' });
  });

  it('shows an error (not an endless "loading") when every feed came back empty', () => {
    expect(tickerView({ itemCount: 0, loading: false, failed: true }).state).toBe('error');
    expect(tickerView({ itemCount: 0, loading: false, failed: false }).state).toBe('error');
  });

  it('does not scroll (so does not duplicate) a short list', () => {
    const v = tickerView({ itemCount: 1, loading: false, failed: true });
    expect(v.state).toBe('ready');
    expect(v.scroll).toBe(false);
  });

  it('scrolls a full list', () => {
    expect(tickerView({ itemCount: MIN_SCROLL_ITEMS, loading: false, failed: false }).scroll).toBe(true);
  });

  it('offers a retry next to partial data only once the failed feed has settled', () => {
    expect(tickerView({ itemCount: 1, loading: false, failed: true }).showRetry).toBe(true);
    expect(tickerView({ itemCount: 1, loading: true, failed: true }).showRetry).toBe(false);
    expect(tickerView({ itemCount: 8, loading: false, failed: false }).showRetry).toBe(false);
  });
});
