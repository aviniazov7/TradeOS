import { useMemo, useState } from 'react';
import { TIMEFRAMES, tvChartUrl } from '../../utils/terminal';

// Multi-timeframe TradingView grid for one symbol. The free Advanced Chart
// widget is embedded as a plain iframe (s.tradingview.com — the origin the
// coin-analysis page already embeds), so there is no third-party script on
// the page. Charts are LTR inside the RTL page.
//   layout 1 → one chart with timeframe tabs
//   layout 2 → D + 4H side by side
//   layout 4 → W / D / 4H / 30m, 2×2 (laid out left-to-right, like the charts)
// Phones always get one chart with tabs.

const TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'; } catch { return 'Etc/UTC'; }
})();

const tfById = (id) => TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES[2];

function ChartFrame({ symbol, tf, theme, className = '' }) {
  const src = useMemo(() => tvChartUrl({ symbol, interval: tf.interval, theme, timezone: TZ }), [symbol, tf.interval, theme]);
  return (
    <div dir="ltr" className={`relative rounded-2xl border border-border-primary bg-bg-secondary overflow-hidden ${className}`}>
      <iframe
        key={src}
        title={`${symbol} ${tf.label}`}
        src={src}
        loading="lazy"
        className="absolute inset-0 w-full h-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}

function TfTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="טיימפריים" className="inline-flex items-center gap-0.5 rounded-xl bg-bg-tertiary border border-border-primary p-0.5" dir="ltr">
      {TIMEFRAMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`num-mono h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            value === t.id ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function TerminalCharts({ symbol, layout, theme, mobile, toolbar }) {
  const [single, setSingle] = useState('4H');
  const effective = mobile ? 1 : layout;

  return (
    <section aria-label="גרפים" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        {effective === 1 && <TfTabs value={single} onChange={setSingle} />}
      </div>
      {effective === 1 && (
        <ChartFrame symbol={symbol} tf={tfById(single)} theme={theme} className="h-[380px] md:h-[560px]" />
      )}
      {effective === 2 && (
        <div dir="ltr" className="grid grid-cols-2 gap-2">
          {['D', '4H'].map((id) => (
            <ChartFrame key={id} symbol={symbol} tf={tfById(id)} theme={theme} className="h-[460px]" />
          ))}
        </div>
      )}
      {effective === 4 && (
        <div dir="ltr" className="grid grid-cols-2 gap-2">
          {['W', 'D', '4H', '30m'].map((id) => (
            <ChartFrame key={id} symbol={symbol} tf={tfById(id)} theme={theme} className="h-[300px] xl:h-[330px]" />
          ))}
        </div>
      )}
    </section>
  );
}
