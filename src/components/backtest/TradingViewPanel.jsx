import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, LineChart } from 'lucide-react';

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

const TV_INTERVALS = [
  { v: '15', label: '15ד' },
  { v: '60', label: '1ש' },
  { v: '240', label: '4ש' },
  { v: 'D', label: '1י' },
  { v: 'W', label: '1ש׳' },
];

// Embedded TradingView Advanced Chart (free widget) with full drawing tools.
// Re-injects the widget whenever the symbol, interval or theme changes.
function TvChart({ symbol, interval }) {
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
      interval,
      theme,
      style: '1',
      locale: 'he',
      timezone: 'Asia/Jerusalem',
      autosize: true,
      allow_symbol_change: true,   // user can change the symbol inside the chart
      hide_side_toolbar: false,    // keep the drawing toolbar visible
      hide_top_toolbar: false,
      withdateranges: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);

    return () => { el.innerHTML = ''; };
  }, [symbol, interval]);

  return <div ref={containerRef} className="tradingview-widget-container w-full h-full" />;
}

export default function TradingViewPanel({ open, symbol, interval, onIntervalChange, onClose }) {
  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(toTvSymbol(symbol))}`;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — only on small screens (on desktop the panel is docked,
              so the form/records stay interactive beside it). */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
          />
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-0 top-14 md:top-16 bottom-0 z-[60] w-full sm:w-[460px] lg:w-[44vw] max-w-[680px] flex flex-col border-e border-border-primary shadow-2xl"
            style={{ background: 'var(--color-bg-solid)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-primary shrink-0">
              <LineChart className="w-4 h-4 text-accent-primary shrink-0" />
              <span className="text-sm font-bold text-text-primary num-mono">{toTvSymbol(symbol)}</span>
              <div className="flex items-center gap-1 mr-2">
                {TV_INTERVALS.map((it) => (
                  <button
                    key={it.v}
                    onClick={() => onIntervalChange(it.v)}
                    className={`text-[11px] font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      interval === it.v
                        ? 'bg-accent-primary/15 text-accent-primary'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
              <a
                href={tvUrl} target="_blank" rel="noopener noreferrer"
                className="mr-auto p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
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

            {/* Chart */}
            <div className="flex-1 min-h-0">
              <TvChart symbol={symbol} interval={interval} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
