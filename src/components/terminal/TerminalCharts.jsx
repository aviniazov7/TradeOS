import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Link2Off, PenLine, PanelTop, Moon, Expand, Shrink, Maximize2, Minimize2, X, ExternalLink } from 'lucide-react';
import ResizableGrid from './ResizableGrid';
import SelectDropdown from '../shared/SelectDropdown';
import { useStoredJson, useFullscreen } from './terminalHooks';
import { TIMEFRAMES, CHART_STYLES, tfById, tvChartUrl } from '../../utils/terminal';
import {
  CHART_LAYOUTS, getLayout, resolveLayoutId, areaRects, sizesForLayout, panesForLayout, symbolFromInput, symbolLabel,
} from '../../utils/terminalLayout';

// TradingView-style split screen: 1–4 Advanced Chart iframes
// (s.tradingview.com/embed-widget — no third-party script on the page) in a
// resizable grid. Each pane has its own timeframe and can be maximized; all
// panes follow the selected position's symbol unless sync is off, in which
// case a pane can be given its own symbol. Phones get one chart with timeframe
// tabs. Charts are LTR inside the RTL page.
//
// localStorage (per viewer):
//   tradeos_terminal_layout2      layout id ('3l' …); falls back to the old
//                                 tradeos_terminal_layout (1/2/4) once
//   tradeos_terminal_sizes        { [layoutId]: { cols, rows } } track fractions
//   tradeos_terminal_panes        { [layoutId]: [{ tf, symbol }] }
//   tradeos_terminal_chart_prefs  { style, black, drawTools, topBar, sync, mobileTf }

const LS_LAYOUT = 'tradeos_terminal_layout2';
const LS_LAYOUT_OLD = 'tradeos_terminal_layout';
const LS_SIZES = 'tradeos_terminal_sizes';
const LS_PANES = 'tradeos_terminal_panes';
const LS_PREFS = 'tradeos_terminal_chart_prefs';

const TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'; } catch { return 'Etc/UTC'; }
})();

const STYLE_IDS = CHART_STYLES.map((s) => s.id);
const TF_OPTIONS = TIMEFRAMES.map((t) => ({ value: t.id, label: t.label }));
const TF_IDS = TIMEFRAMES.map((t) => t.id);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

const parsePrefs = (v) => {
  const p = obj(v);
  return {
    style: STYLE_IDS.includes(p.style) ? p.style : '1',
    black: p.black !== false,
    drawTools: p.drawTools === true,
    topBar: p.topBar !== false,
    sync: p.sync !== false,
    mobileTf: TF_IDS.includes(p.mobileTf) ? p.mobileTf : '4H',
  };
};
const parseLayoutId = (v) => {
  let legacy = null;
  try { legacy = localStorage.getItem(LS_LAYOUT_OLD); } catch { /* none */ }
  return resolveLayoutId(v, legacy);
};

// ── Small pieces ─────────────────────────────────────────────────────────────

const toolBtn = (on) => `w-8 h-8 shrink-0 rounded-lg grid place-items-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${
  on ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-white/5'
}`;

/** The layout drawn from its own grid definition. */
function LayoutIcon({ layout }) {
  const rects = areaRects(layout);
  const nCols = layout.areas[0].length;
  const nRows = layout.areas.length;
  const W = 18; const H = 14; const g = 1.5;
  const cw = (W - (nCols - 1) * g) / nCols;
  const ch = (H - (nRows - 1) * g) / nRows;
  return (
    <svg viewBox="-1 -1 20 16" className="w-[18px] h-[15px]" aria-hidden>
      {rects.map((r) => (
        <rect
          key={r.index}
          x={r.col * (cw + g)}
          y={r.row * (ch + g)}
          width={r.colSpan * cw + (r.colSpan - 1) * g}
          height={r.rowSpan * ch + (r.rowSpan - 1) * g}
          rx="1.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      ))}
    </svg>
  );
}

/** Chart-type glyphs: candles, OHLC bars, hollow candles, line. */
function StyleIcon({ id }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 18 18" className="w-[17px] h-[17px]" aria-hidden>
      {id === '1' && (
        <>
          <path d="M5 2.5v13M13 2.5v13" {...p} />
          <rect x="3" y="5" width="4" height="7" rx=".6" fill="currentColor" stroke="none" />
          <rect x="11" y="6.5" width="4" height="5.5" rx=".6" fill="currentColor" stroke="none" />
        </>
      )}
      {id === '0' && <path d="M5.5 3v12M3 6h2.5M5.5 12H8M12.5 4v10M10 11h2.5M12.5 6.5H15" {...p} />}
      {id === '9' && (
        <>
          <path d="M5 2.5V5M5 12v3.5M13 3v3.5M13 12v3" {...p} />
          <rect x="3" y="5" width="4" height="7" rx=".6" {...p} />
          <rect x="11" y="6.5" width="4" height="5.5" rx=".6" fill="currentColor" stroke="none" />
        </>
      )}
      {id === '2' && <path d="M2.5 13.5 6.5 8l3.5 3 5.5-7" {...p} />}
    </svg>
  );
}

function LayoutPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="פריסת מסך מפוצל" className="flex items-center gap-0.5">
      {CHART_LAYOUTS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={value === l.id}
          aria-label={l.label}
          title={l.label}
          onClick={() => onChange(l.id)}
          className={toolBtn(value === l.id)}
        >
          <LayoutIcon layout={l} />
        </button>
      ))}
    </div>
  );
}

function StylePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="סוג גרף" className="flex items-center gap-0.5">
      {CHART_STYLES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          aria-label={s.label}
          title={s.label}
          onClick={() => onChange(s.id)}
          className={toolBtn(value === s.id)}
        >
          <StyleIcon id={s.id} />
        </button>
      ))}
    </div>
  );
}

const Sep = () => <span aria-hidden className="w-px h-5 bg-border-primary mx-1 shrink-0" />;

function TfTabs({ value, onChange, className = '' }) {
  // Nine tabs overflow a phone: keep the selected one in view (scrolling only
  // the strip, never the page).
  const stripRef = useRef(null);
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector('[aria-selected="true"]');
    if (!el) return;
    strip.scrollLeft = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
  }, [value]);
  return (
    <div ref={stripRef} role="tablist" aria-label="טיימפריים" dir="ltr" className={`relative flex items-center gap-0.5 overflow-x-auto no-scrollbar ${className}`}>
      {TIMEFRAMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`num-mono h-8 min-w-8 px-2 shrink-0 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            value === t.id ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Chart iframe ─────────────────────────────────────────────────────────────

/**
 * One Advanced Chart iframe. Mounted once it first scrolls into view, and
 * re-created only when its own URL (symbol / interval / style / theme) changes.
 */
const ChartFrame = memo(function ChartFrame({ src, title, watermark, dark = true }) {
  const boxRef = useRef(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  const [loadedSrc, setLoadedSrc] = useState(null);

  useEffect(() => {
    if (seen) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div ref={boxRef} className="absolute inset-0">
      {loadedSrc !== src && (
        <div aria-hidden className="absolute inset-0 grid place-items-center pointer-events-none select-none">
          <span className={`num-mono text-3xl md:text-5xl font-bold whitespace-nowrap ${dark ? 'text-white/[0.07]' : 'text-black/[0.07]'}`}>{watermark}</span>
        </div>
      )}
      {seen && (
        <iframe
          key={src}
          title={title}
          src={src}
          loading="lazy"
          onLoad={() => setLoadedSrc(src)}
          className="absolute inset-0 w-full h-full border-0"
          allow="fullscreen"
        />
      )}
    </div>
  );
});

// ── Pane ─────────────────────────────────────────────────────────────────────

function PaneSymbolInput({ own, followed, exchange, onSet }) {
  const [draft, setDraft] = useState(null); // null = not editing
  const commit = () => {
    if (draft == null) return;
    const v = draft.trim();
    onSet(v ? symbolFromInput(v, exchange) : null);
    setDraft(null);
  };
  return (
    <span className="inline-flex items-center gap-0.5 min-w-0">
      <input
        type="text"
        value={draft ?? (own ? symbolLabel(own) : '')}
        placeholder={symbolLabel(followed)}
        onFocus={(e) => { setDraft(own ? symbolLabel(own) : ''); e.target.select(); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); e.currentTarget.blur(); }
        }}
        aria-label="סימבול לגרף הזה"
        title={own ? `${own} — ריק = עוקב אחרי הפוזיציה הנבחרת` : 'הקלד סימבול (ETH, SOLUSDT, BINANCE:BTCUSDT) — ריק = עוקב אחרי הפוזיציה הנבחרת'}
        spellCheck={false}
        autoComplete="off"
        className={`num-mono w-24 h-6 px-1.5 rounded-md bg-white/5 border text-xs font-semibold uppercase outline-none focus:border-accent-primary/60 ${
          own ? 'border-accent-primary/30 text-text-primary' : 'border-border-primary text-text-secondary placeholder:text-text-secondary'
        }`}
      />
      {own && (
        <button type="button" onClick={() => onSet(null)} title="חזרה לסימבול הנבחר" aria-label="חזרה לסימבול הנבחר" className="w-5 h-5 grid place-items-center rounded text-text-muted hover:text-text-primary cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function ChartPane({ index, pane, symbol, sync, exchange, chartOpts, surface, maximized, canMaximize, onPane, onToggleMax }) {
  const dark = chartOpts.theme !== 'light';
  const tf = tfById(pane.tf);
  const src = useMemo(
    () => tvChartUrl({ symbol, interval: tf.interval, timezone: TZ, ...chartOpts }),
    [symbol, tf.interval, chartOpts],
  );
  const label = symbolLabel(symbol);
  const venue = symbol.includes(':') ? symbol.split(':')[0] : '';

  return (
    <div className={`@container absolute inset-0 flex flex-col rounded-lg border border-border-primary overflow-hidden ${surface}`}>
      <div
        className="flex items-center gap-1.5 h-8 px-1.5 border-b border-border-primary bg-white/[0.03] shrink-0 min-w-0"
        onDoubleClick={(e) => { if (canMaximize && e.target === e.currentTarget) onToggleMax(index); }}
      >
        {sync ? (
          <span className="inline-flex items-baseline gap-1 min-w-0 px-1" title={symbol}>
            <span className="num-mono text-xs font-bold text-text-primary truncate">{label}</span>
            {venue && <span className="text-[10px] text-text-muted hidden @[20rem]:inline">{venue}</span>}
          </span>
        ) : (
          <PaneSymbolInput own={pane.symbol} followed={symbol} exchange={exchange} onSet={(s) => onPane(index, { symbol: s })} />
        )}

        <span aria-hidden className="w-px h-4 bg-border-primary shrink-0" />

        {/* Wide pane: every timeframe as a button; narrow: a compact select. */}
        <div role="radiogroup" aria-label="טיימפריים" className="hidden @[30rem]:flex items-center gap-px min-w-0">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={pane.tf === t.id}
              onClick={() => onPane(index, { tf: t.id })}
              className={`num-mono h-6 px-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                pane.tf === t.id ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <SelectDropdown
          compact
          ariaLabel="טיימפריים"
          value={pane.tf}
          onChange={(tf) => { if (tf) onPane(index, { tf }); }}
          options={TF_OPTIONS}
          className="@[30rem]:hidden w-[4.5rem] shrink-0"
          triggerClassName="!h-6 !py-0 !px-1.5 num-mono font-semibold"
        />

        <span className="flex-1" />
        {/* The embed can't sign in, so hand off to the user's own TradingView
            (their account, saved layouts and indicators) with the same chart. */}
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf.interval)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="פתח ב-TradingView בחשבון שלך"
          aria-label="פתח ב-TradingView"
          className="w-6 h-6 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        {canMaximize && (
          <button
            type="button"
            onClick={() => onToggleMax(index)}
            title={maximized ? 'שחזור הפריסה (Esc)' : 'הגדלת הגרף'}
            aria-label={maximized ? 'שחזור הפריסה' : 'הגדלת הגרף'}
            aria-pressed={maximized}
            className="w-6 h-6 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 cursor-pointer shrink-0"
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <ChartFrame src={src} title={`${label} ${tf.label}`} watermark={`${label} · ${tf.label}`} dark={dark} />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TerminalCharts({ symbol, exchange, theme, mobile, toolbar }) {
  const rootRef = useRef(null);
  const [layoutId, setLayoutId] = useStoredJson(LS_LAYOUT, parseLayoutId);
  const [sizesAll, setSizesAll] = useStoredJson(LS_SIZES, obj);
  const [panesAll, setPanesAll] = useStoredJson(LS_PANES, obj);
  const [prefs, setPrefs] = useStoredJson(LS_PREFS, parsePrefs);
  const [maxState, setMaxState] = useState(null); // { layoutId, index }
  const [fullscreen, toggleFullscreen, fsSupported] = useFullscreen(rootRef);

  const layout = getLayout(layoutId);
  const sizes = useMemo(() => sizesForLayout(layout, sizesAll), [layout, sizesAll]);
  const panes = useMemo(() => panesForLayout(layout, panesAll), [layout, panesAll]);
  const maximized = maxState && maxState.layoutId === layout.id && !mobile ? maxState.index : null;
  const dark = theme !== 'light';
  const surface = !dark ? 'bg-white' : prefs.black ? 'bg-black' : 'bg-[#141414]';

  const chartOpts = useMemo(
    () => ({ theme, style: prefs.style, black: prefs.black, drawTools: prefs.drawTools, topBar: prefs.topBar }),
    [theme, prefs.style, prefs.black, prefs.drawTools, prefs.topBar],
  );
  const setPref = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  const setPane = (i, patch) => setPanesAll((all) => {
    const cur = panesForLayout(layout, all);
    cur[i] = { ...cur[i], ...patch };
    return { ...all, [layout.id]: cur };
  });
  const toggleMax = (i) => setMaxState((m) => (m && m.layoutId === layout.id && m.index === i ? null : { layoutId: layout.id, index: i }));

  // Esc restores a maximized pane (unless typing in a field).
  useEffect(() => {
    if (maximized == null) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      setMaxState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  const fsButton = fsSupported && (
    <button type="button" onClick={toggleFullscreen} className={toolBtn(fullscreen)} title={fullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'} aria-label={fullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}>
      {fullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
    </button>
  );

  // ── Phones: one chart, timeframe tabs + chart type ──
  if (mobile) {
    const tf = tfById(prefs.mobileTf);
    const src = tvChartUrl({ symbol, interval: tf.interval, timezone: TZ, ...chartOpts });
    const label = symbolLabel(symbol);
    return (
      <section aria-label="גרפים" className="space-y-2">
        <div className="min-w-0">{toolbar}</div>
        <div className="flex items-center gap-1 min-w-0">
          <TfTabs value={prefs.mobileTf} onChange={(v) => setPref({ mobileTf: v })} className="flex-1 min-w-0" />
          <Sep />
          <StylePicker value={prefs.style} onChange={(v) => setPref({ style: v })} />
        </div>
        <div dir="ltr" className={`relative rounded-xl border border-border-primary overflow-hidden h-[62dvh] min-h-[340px] max-h-[600px] ${surface}`}>
          <ChartFrame src={src} title={`${label} ${tf.label}`} watermark={`${label} · ${tf.label}`} dark={dark} />
        </div>
      </section>
    );
  }

  // ── Desktop / tablet: the split screen ──
  return (
    <section
      ref={rootRef}
      aria-label="גרפים"
      className={`flex flex-col gap-2 ${fullscreen ? 'bg-bg-primary p-2' : 'h-[calc(100dvh-7rem)] min-h-[560px]'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <div dir="ltr" className="flex items-center gap-0.5 h-10 px-1 rounded-xl bg-bg-tertiary border border-border-primary shrink-0 max-w-full overflow-x-auto no-scrollbar">
          <LayoutPicker value={layout.id} onChange={(id) => { setLayoutId(id); setMaxState(null); }} />
          <Sep />
          <StylePicker value={prefs.style} onChange={(v) => setPref({ style: v })} />
          <Sep />
          <button
            type="button"
            onClick={() => setPref({ sync: !prefs.sync })}
            aria-pressed={prefs.sync}
            className={toolBtn(prefs.sync)}
            title={prefs.sync ? 'סנכרון סימבול: כל הגרפים עוקבים אחרי הפוזיציה הנבחרת (לחיצה = סימבול נפרד לכל גרף)' : 'סימבול נפרד לכל גרף (לחיצה = סנכרון לפוזיציה הנבחרת)'}
            aria-label="סנכרון סימבול בין הגרפים"
          >
            {prefs.sync ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setPref({ drawTools: !prefs.drawTools })}
            aria-pressed={prefs.drawTools}
            className={toolBtn(prefs.drawTools)}
            title={prefs.drawTools ? 'הסתרת כלי הציור' : 'הצגת כלי ציור'}
            aria-label="כלי ציור"
          >
            <PenLine className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPref({ topBar: !prefs.topBar })}
            aria-pressed={prefs.topBar}
            className={toolBtn(prefs.topBar)}
            title={prefs.topBar ? 'הסתרת הסרגל העליון של TradingView (אינדיקטורים) — מראה נקי' : 'הצגת הסרגל העליון של TradingView (אינדיקטורים)'}
            aria-label="הסרגל העליון של TradingView"
          >
            <PanelTop className="w-4 h-4" />
          </button>
          {dark && (
            <button
              type="button"
              onClick={() => setPref({ black: !prefs.black })}
              aria-pressed={prefs.black}
              className={toolBtn(prefs.black)}
              title={prefs.black ? 'רקע שחור מלא (לחיצה = רקע האפליקציה)' : 'רקע האפליקציה (לחיצה = שחור מלא)'}
              aria-label="רקע שחור מלא"
            >
              <Moon className="w-4 h-4" />
            </button>
          )}
          {fsButton && <Sep />}
          {fsButton}
        </div>
      </div>

      <ResizableGrid
        layout={layout}
        sizes={sizes}
        onChange={(next) => setSizesAll((all) => ({ ...all, [layout.id]: next }))}
        maximized={maximized}
        className="flex-1"
        renderPane={(i) => (
          <ChartPane
            index={i}
            pane={panes[i]}
            symbol={!prefs.sync && panes[i].symbol ? panes[i].symbol : symbol}
            sync={prefs.sync}
            exchange={exchange}
            chartOpts={chartOpts}
            surface={surface}
            maximized={maximized === i}
            canMaximize={panes.length > 1}
            onPane={setPane}
            onToggleMax={toggleMax}
          />
        )}
      />
    </section>
  );
}
