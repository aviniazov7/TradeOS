import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import TradingViewPreview from './TradingViewPreview';
import { MAX_TRADE_CHART_LINKS, normalizeTradingViewUrl } from '../../utils/tradingViewLink';

/**
 * Up to four TradingView links on the trade ticket. Empty rows are allowed
 * while editing; the parent validates on save.
 */
export default function TradeChartLinksField({ links, onChange }) {
  const rows = links?.length ? links : [''];
  const [blurred, setBlurred] = useState({});

  const updateAt = (index, value) => {
    const next = rows.slice();
    next[index] = value;
    onChange(next);
  };

  const removeAt = (index) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : ['']);
    setBlurred({});
  };

  const add = () => {
    if (rows.length >= MAX_TRADE_CHART_LINKS) return;
    onChange([...rows, '']);
  };

  const previews = [];
  const seen = new Set();
  rows.forEach((value) => {
    const url = normalizeTradingViewUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    previews.push(url);
  });

  return (
    <div className="space-y-2">
      {rows.map((value, index) => {
        const trimmed = String(value || '').trim();
        const invalid = Boolean(trimmed) && blurred[index] && !normalizeTradingViewUrl(trimmed);
        return (
          <div key={index}>
            <div className="flex items-center gap-2">
              <input
                id={index === 0 ? 'tt-tv' : undefined}
                type="text"
                inputMode="url"
                dir="ltr"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={value}
                onChange={(e) => updateAt(index, e.target.value)}
                onBlur={() => setBlurred((prev) => ({ ...prev, [index]: true }))}
                placeholder="https://www.tradingview.com/x/..."
                aria-label={`קישור TradingView ${index + 1}`}
                aria-invalid={invalid || undefined}
                className={`min-h-11 flex-1 min-w-0 rounded-lg border bg-bg-secondary px-3 text-sm text-text-primary text-left outline-none focus:border-accent-primary ${
                  invalid ? 'border-loss' : 'border-border-primary'
                }`}
              />
              {(rows.length > 1 || trimmed) && (
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={`הסר קישור ${index + 1}`}
                  className="min-h-11 min-w-11 grid place-items-center rounded-lg border border-border-primary text-text-muted hover:text-loss hover:border-loss/40 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {invalid && (
              <p role="alert" className="mt-1 text-[11px] text-loss">הקישור חייב להיות כתובת של tradingview.com</p>
            )}
          </div>
        );
      })}

      {rows.length < MAX_TRADE_CHART_LINKS && (
        <button
          type="button"
          onClick={add}
          className="min-h-11 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-primary px-3 text-xs text-text-secondary hover:border-accent-primary/40 hover:text-text-primary transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          הוסף קישור
        </button>
      )}

      <p className="text-[10px] text-text-muted leading-relaxed">
        עד {MAX_TRADE_CHART_LINKS} קישורים מ-tradingview.com — צילום (/x/) או גרף. הקישור נפתח ב-TradingView, בלי לשמור תמונה אצלנו.
      </p>

      {previews.map((url) => (
        <TradingViewPreview key={url} url={url} />
      ))}
    </div>
  );
}
