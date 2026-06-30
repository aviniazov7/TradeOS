import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';

// Map the app's pair (e.g. "BTCUSDT", "XAUUSDT") to a TradingView symbol.
// Crypto USDT/USD pairs resolve well under BINANCE; anything already namespaced
// (contains ':') or unknown is passed through for TradingView to resolve.
function toTvSymbol(pair) {
  if (!pair) return 'BINANCE:BTCUSDT';
  const p = String(pair).toUpperCase().replace('/', '').trim();
  if (p.includes(':')) return p;
  if (/USDT?$/.test(p)) return `BINANCE:${p}`;
  return p;
}

// Embedded TradingView Advanced Chart (free widget) with the full native
// toolbar (symbol search, intervals, drawing tools). Re-injects on symbol /
// theme change. We intentionally do NOT add our own interval buttons — the
// widget's own controls handle timeframe.
function TvChart({ symbol }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    el.appendChild(widget);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      symbol: toTvSymbol(symbol),
      interval: '60',              // initial only — user changes it in the widget
      theme,
      style: '1',
      locale: 'he',
      timezone: 'Asia/Jerusalem',
      autosize: true,
      allow_symbol_change: true,
      hide_side_toolbar: false,    // drawing toolbar
      hide_top_toolbar: false,     // symbol + interval controls (TradingView's own)
      withdateranges: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);

    return () => { el.innerHTML = ''; };
  }, [symbol]);

  return <div ref={containerRef} className="tradingview-widget-container w-full h-full" />;
}

// Full-width chart panel that slides up from the bottom and fills the page below
// the backtest toolbar (so the journal name + "add trade" bar stay visible above
// it). Symbol stays synced to the trade form's pair — no copy-paste.
export default function TradingViewPanel({ symbol, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(toTvSymbol(symbol))}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-xl border border-border-primary overflow-hidden mb-4 flex flex-col"
      style={{ height: 'calc(100vh - 14rem)', minHeight: 460, background: 'var(--color-bg-secondary)' }}
    >
      {/* Slim control bar — just close + open-in-TradingView (no custom intervals) */}
      <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-border-primary shrink-0">
        <span className="mr-auto text-[11px] text-text-muted num-mono ps-1">{toTvSymbol(symbol)}</span>
        <a
          href={tvUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title="פתח ב-TradingView"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          title="סגור גרף (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <TvChart symbol={symbol} />
      </div>
    </motion.div>
  );
}
