import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, ReferenceArea,
} from 'recharts';
import Modal from '../shared/Modal';
import { fetchKlinesRange } from '../../services/coingeckoApi';
import {
  formatCurrency,
  formatPrice,
  formatPercent,
  formatRR,
  formatDuration,
  formatDateTime,
} from '../../utils/formatters';
import { MISTAKE_LABELS } from '../../utils/constants';
import {
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Share2,
  ExternalLink,
  Clock,
  Loader2,
} from 'lucide-react';

// Safe numeric coercion — returns null when not a finite number.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toDate = (d) => (d?.toDate ? d.toDate() : d ? new Date(d) : null);

const RATING_LABELS = { 1: 'נמוך', 2: 'בינוני-', 3: 'בינוני', 4: 'טוב', 5: 'מעולה' };
const MENTAL_FIELDS = [
  { key: 'focusRating', label: 'ריכוז' },
  { key: 'confidenceRating', label: 'ביטחון' },
  { key: 'stressRating', label: 'לחץ' },
  { key: 'planAdherenceRating', label: 'עקביות' },
];

// Chart plot geometry (must match the AreaChart margins + axis sizes below) so
// the custom level tags can be positioned in pixels with collision avoidance.
const CH_H = 240;
const CH_TOP = 12;
const CH_BOTTOM = 6;
const CH_XAXIS = 22;
const PLOT_TOP = CH_TOP;
const PLOT_H = CH_H - CH_BOTTOM - CH_XAXIS - CH_TOP; // usable price area height

// Real price chart for the trade window — clean TradingView-style position tool.
function RealPriceChart({ candles, entry, exit, stop, tps, direction, entryMs, exitMs, pnl }) {
  const win = pnl >= 0;
  const NEUTRAL = 'var(--color-text-secondary)';
  const exitColor = win ? 'var(--color-profit)' : 'var(--color-loss)';
  const fmtY = (v) => {
    const a = Math.abs(v);
    if (a >= 1000) return `${(v / 1000).toFixed(a >= 100000 ? 0 : 1)}K`;
    if (a >= 100) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(4);
  };
  // Planned take-profit (if recorded). The full position tool always shows the
  // risk (SL, red) and the reward target (TP, green) so a stopped-out trade is
  // still legible — the exit dot lands inside the red zone.
  const plannedTP = (tps && tps.length)
    ? (direction === 'short' ? Math.min(...tps) : Math.max(...tps))
    : null;
  // The tool always shows BOTH sides: red risk (entry→stop) + green reward.
  // Reward target = planned TP, else a 1:2 projection from the stop, else (no
  // stop) the exit on a win. So even a stopped-out trade reads as a full tool.
  const risk = (entry != null && stop != null && stop > 0) ? Math.abs(entry - stop) : null;
  const dir = direction === 'short' ? -1 : 1;
  const derivedTarget = risk != null ? entry + dir * risk * 2 : null;
  const greenTo = plannedTP != null ? plannedTP : (derivedTarget != null ? derivedTarget : (win ? exit : null));
  const tpIsProjection = plannedTP == null && derivedTarget != null;
  const xEnd = candles.length ? candles[candles.length - 1].t : null;
  const xBox = exitMs != null ? exitMs : xEnd; // zones cover only the open period

  // Y domain = price range + nearby levels, so SL/TP are always visible.
  const prices = candles.map((c) => c.price);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const span0 = hi - lo || Math.abs(hi) * 0.01 || 1;
  for (const lv of [entry, exit, stop, greenTo]) {
    if (lv != null && lv > 0 && Math.abs(lv - (lo + hi) / 2) <= span0 * 3) {
      lo = Math.min(lo, lv); hi = Math.max(hi, lv);
    }
  }
  const padY = (hi - lo) * 0.1 || 1;
  const domLo = lo - padY;
  const domHi = hi + padY;
  const domain = [domLo, domHi];

  // Price → pixel within the plot area, then build collision-free level tags.
  const yPx = (p) => PLOT_TOP + (1 - (p - domLo) / (domHi - domLo)) * PLOT_H;
  const tags = [];
  if (entry != null) tags.push({ key: 'e', text: `כניסה ${fmtY(entry)}`, color: NEUTRAL, y: yPx(entry) });
  if (stop != null && stop > 0) tags.push({ key: 'sl', text: `SL ${fmtY(stop)}`, color: 'var(--color-loss)', y: yPx(stop) });
  if (greenTo != null) tags.push({ key: 'tp', text: tpIsProjection ? 'יעד 1:2' : `TP ${fmtY(greenTo)}`, color: 'var(--color-profit)', y: yPx(greenTo) });
  if (exit != null) tags.push({ key: 'x', text: `יציאה ${fmtY(exit)}`, color: exitColor, y: yPx(exit) });
  tags.sort((a, b) => a.y - b.y);
  const GAP = 15;
  for (let i = 1; i < tags.length; i++) {
    if (tags[i].y - tags[i - 1].y < GAP) tags[i].y = tags[i - 1].y + GAP;
  }
  for (const t of tags) t.y = Math.max(PLOT_TOP + 2, Math.min(PLOT_TOP + PLOT_H - 8, t.y));

  return (
    <div className="mt-2 relative" style={{ height: CH_H }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={candles} margin={{ top: CH_TOP, right: 4, bottom: CH_BOTTOM, left: 6 }}>
          <defs>
            <linearGradient id="tradePriceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEUTRAL} stopOpacity={0.08} />
              <stop offset="100%" stopColor={NEUTRAL} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border-primary)" strokeDasharray="2 4" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={(ms) => new Date(ms).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} tickLine={false}
            axisLine={{ stroke: 'var(--color-border-primary)' }} minTickGap={60} tickMargin={8} height={CH_XAXIS}
          />
          <YAxis
            orientation="right" dataKey="price" domain={domain} tickFormatter={fmtY} tickCount={5}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}
            width={56} tickMargin={4} allowDataOverflow
          />
          <Tooltip
            contentStyle={{ background: '#141414', border: '1px solid #1a1a1a', borderRadius: '8px', fontSize: '12px', color: '#f0f0f0' }}
            labelFormatter={(ms) => new Date(ms).toLocaleString('he-IL')}
            formatter={(v) => [formatPrice(v), 'מחיר']}
          />

          {/* Position tool: green reward zone + red risk zone (always shown) */}
          {entry != null && greenTo != null && entryMs != null && xBox != null && (
            <ReferenceArea x1={entryMs} x2={xBox} y1={entry} y2={greenTo} fill="var(--color-profit)" fillOpacity={0.16} stroke="none" />
          )}
          {entry != null && stop != null && stop > 0 && entryMs != null && xBox != null && (
            <ReferenceArea x1={entryMs} x2={xBox} y1={entry} y2={stop} fill="var(--color-loss)" fillOpacity={0.16} stroke="none" />
          )}

          {/* Neutral price line so the green/red zones carry the meaning */}
          <Area type="monotone" dataKey="price" stroke={NEUTRAL} strokeWidth={1.6} fill="url(#tradePriceGrad)" isAnimationActive={false} />

          {/* Level lines (labels drawn as a collision-free overlay below) */}
          {entry != null && <ReferenceLine y={entry} stroke={NEUTRAL} strokeWidth={1} />}
          {stop != null && stop > 0 && <ReferenceLine y={stop} stroke="var(--color-loss)" strokeDasharray="5 4" />}
          {greenTo != null && <ReferenceLine y={greenTo} stroke="var(--color-profit)" strokeDasharray="5 4" />}
          {exit != null && <ReferenceLine y={exit} stroke={exitColor} strokeDasharray="2 3" strokeOpacity={0.6} />}

          {/* Entry (neutral) / Exit (green if win, red if loss) dots */}
          {entry != null && entryMs != null && (
            <ReferenceDot x={entryMs} y={entry} r={4} fill={NEUTRAL} stroke="#0b0e14" strokeWidth={2} />
          )}
          {exit != null && exitMs != null && (
            <ReferenceDot x={exitMs} y={exit} r={4} fill={exitColor} stroke="#0b0e14" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Collision-free level tags (left edge) */}
      {tags.map((t) => (
        <div
          key={t.key}
          className="absolute left-1 px-1.5 py-0.5 rounded text-[10px] font-bold pointer-events-none whitespace-nowrap"
          style={{ top: t.y, transform: 'translateY(-50%)', color: t.color, background: 'rgba(8,11,18,0.72)' }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function TradeDetailModal({
  trade,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onShare,
}) {
  const pairSym = trade?.pair || trade?.symbol || '';
  const isCrypto = !!pairSym && /USDT?$/.test(pairSym) && trade?.assetClass !== 'futures_cme';

  const [chart, setChart] = useState(null);        // { candles, entryMs, exitMs }
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    // Only fetch when the modal is open for a crypto pair; the cleanup resets
    // state on close / trade change (avoids a synchronous setState in the body).
    const entryMs = isOpen && trade && isCrypto ? toDate(trade.entryDate)?.getTime() : null;
    if (!entryMs) return undefined;
    const exitMs = toDate(trade.exitDate || trade.createdAt)?.getTime() || Date.now();
    const start = Math.min(entryMs, exitMs);
    const end = Math.max(entryMs, exitMs);
    const dur = Math.max(end - start, 10 * 60 * 1000);
    // Tight window — focus on the period the position was open, not the
    // surrounding price action.
    const pad = Math.max(dur * 0.12, 5 * 60 * 1000);
    const from = start - pad;
    const to = end + pad;
    const INTERVALS = [['1m', 60000], ['5m', 300000], ['15m', 900000], ['1h', 3600000], ['4h', 14400000], ['1d', 86400000]];
    const target = (to - from) / 100;
    let iv = INTERVALS[0];
    for (const x of INTERVALS) if (x[1] <= target) iv = x;

    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setChartLoading(true); });
    fetchKlinesRange(pairSym, iv[0], from, to, 500)
      .then((rows) => {
        if (cancelled) return;
        const candles = (rows || [])
          .map((k) => ({ t: Number(k[0]), price: parseFloat(k[4]) }))
          .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.price));
        setChart(candles.length >= 3 ? { candles, entryMs, exitMs } : null);
      })
      .catch(() => { if (!cancelled) setChart(null); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; setChart(null); setChartLoading(false); };
  }, [isOpen, trade, isCrypto, pairSym]);

  if (!trade) return null;

  const pair = trade.pair || trade.symbol || '';
  const pnl = trade.netPnl ?? trade.pnl ?? 0;
  const status =
    trade.status === 'partial'
      ? 'partial'
      : Number(trade.exitPrice) > 0
        ? 'closed'
        : 'open';
  const pnlColor = (v) =>
    v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-breakeven';

  const isFutures = trade.assetClass === 'futures_cme';

  // ── Duration ──────────────────────────────────────────────────────
  const entryDt = toDate(trade.entryDate);
  const exitDt = toDate(trade.exitDate || trade.createdAt);
  let durationHours = null;
  if (entryDt && exitDt && !isNaN(entryDt) && !isNaN(exitDt)) {
    const h = (exitDt.getTime() - entryDt.getTime()) / 3_600_000;
    if (h > 0) durationHours = h;
  }

  // ── Chart levels (passed to the position-tool chart) ──────────────
  const entry = num(trade.entryPrice);
  const stop = num(trade.stopLoss);
  const origStop = num(trade.originalStopLoss) ?? stop;
  const exit = status === 'open' ? null : num(trade.exitPrice);
  const tps = (trade.tps || []).map(num).filter((n) => n !== null && n > 0);

  // ── Stat tiles ────────────────────────────────────────────────────
  const moneyOrDash = (v) => {
    const n = num(v);
    if (n === null) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  };

  const tiles = [
    { label: 'Net P&L', value: formatCurrency(pnl), cls: pnlColor(pnl) },
    {
      label: 'תשואה',
      value: status === 'open' ? '—' : formatPercent(trade.pnlPercent),
      cls: status === 'open' ? '' : pnlColor(trade.pnlPercent),
    },
    { label: 'R-Multiple', value: formatRR(trade.rrRatio, pnl) },
    { label: 'כניסה', value: formatPrice(trade.entryPrice) },
    {
      label: 'סגירה',
      value: status === 'open' ? '—' : formatPrice(trade.exitPrice),
    },
    { label: 'סטופ', value: formatPrice(trade.stopLoss) },
    { label: 'גודל פוזיציה', value: moneyOrDash(trade.positionSize) },
    { label: 'סיכון', value: moneyOrDash(trade.riskAmount) },
    {
      label: isFutures ? 'חוזים' : 'מינוף',
      value: isFutures
        ? (trade.contract?.contracts ?? trade.quantity ?? '—')
        : trade.leverage
          ? `x${trade.leverage}`
          : '—',
    },
    { label: 'עמלות', value: moneyOrDash(trade.fees) },
    { label: 'טווח זמן', value: trade.timeframe || '—' },
    { label: 'אסטרטגיה', value: trade.strategy || '—' },
    { label: 'טריגר', value: trade.trigger || '—' },
    { label: 'סשן', value: trade.session || '—' },
  ];

  // ── Details ───────────────────────────────────────────────────────
  const partialExits =
    Array.isArray(trade.exits) && trade.exits.length > 1 ? trade.exits : null;
  const mistakes =
    Array.isArray(trade.mistakes) && trade.mistakes.length
      ? trade.mistakes
      : null;
  const tags = Array.isArray(trade.tags)
    ? trade.tags
    : typeof trade.tags === 'string' && trade.tags.trim()
      ? trade.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : null;
  const hasTags = tags && tags.length;

  // ── Handlers ──────────────────────────────────────────────────────
  const handleShare = () => {
    onClose?.();
    onShare?.(trade);
  };
  const handleEdit = () => {
    onClose?.();
    onEdit?.(trade);
  };
  const handleDelete = () => {
    onClose?.();
    onDelete?.(trade);
  };

  // ── Status badge ──────────────────────────────────────────────────
  const statusBadge =
    status === 'open'
      ? { cls: 'bg-breakeven/15 text-breakeven', text: 'פתוחה' }
      : status === 'partial'
        ? { cls: 'bg-breakeven/15 text-breakeven', text: 'חלקית' }
        : { cls: 'bg-bg-tertiary text-text-muted', text: 'נסגרה' };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${pair} · פרטי עסקה`}
      maxWidth="max-w-4xl"
    >
      {/* 1) Header strip */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {trade.direction === 'short' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-short/15 text-short px-2.5 py-1 text-xs font-semibold">
            <TrendingDown className="w-3.5 h-3.5" />
            Short
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-long/15 text-long px-2.5 py-1 text-xs font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            Long
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge.cls}`}
        >
          {statusBadge.text}
        </span>
        <span className="text-text-muted text-xs" dir="ltr">
          {formatDateTime(toDate(trade.entryDate))}
        </span>
      </div>

      {/* 2) Two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT — chart */}
        <div className="bg-bg-tertiary border border-border-primary rounded-xl p-4">
          <span className="text-xs text-text-muted">גרף מחיר</span>
          {chartLoading ? (
            <div className="mt-2 h-[240px] flex items-center justify-center text-text-muted text-xs gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> טוען גרף...
            </div>
          ) : chart?.candles?.length ? (
            <RealPriceChart
              candles={chart.candles}
              entry={entry}
              exit={exit}
              stop={origStop}
              tps={tps}
              direction={trade.direction}
              entryMs={chart.entryMs}
              exitMs={chart.exitMs}
              pnl={pnl}
            />
          ) : (
            <div className="mt-2 h-[240px] flex items-center justify-center text-text-muted text-xs text-center px-4">
              גרף לא זמין למטבע הזה
            </div>
          )}

          {trade.tradingViewUrl && (
            <a
              href={trade.tradingViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-accent-primary text-xs hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              פתח ב-TradingView
            </a>
          )}
        </div>

        {/* RIGHT — stat tiles */}
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="bg-bg-tertiary border border-border-primary rounded-lg p-2.5"
            >
              <div className="text-[11px] text-text-muted">{t.label}</div>
              <div
                className={`text-sm font-semibold ${t.cls || 'text-text-primary'}`}
                dir="ltr"
              >
                {t.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3) Full-width details */}
      <div className="mt-4 space-y-3 text-xs">
        {durationHours !== null && (
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-text-muted">משך העסקה:</span>
            <span>{formatDuration(durationHours)}</span>
          </div>
        )}

        {MENTAL_FIELDS.some((f) => trade[f.key]) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MENTAL_FIELDS.map((f) => {
              const val = trade[f.key];
              if (!val) return null;
              return (
                <div key={f.key} className="bg-bg-tertiary border border-border-primary rounded-lg p-2">
                  <div className="text-[11px] text-text-muted">{f.label}</div>
                  <div className="text-text-secondary" dir="ltr">{val}/5 {RATING_LABELS[val]}</div>
                </div>
              );
            })}
          </div>
        )}

        {partialExits && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text-muted">פירוט יציאות:</span>
            {partialExits.map((e, i) => (
              <span
                key={i}
                className="rounded-md bg-bg-tertiary border border-border-primary px-2 py-0.5 text-text-secondary"
                dir="ltr"
              >
                {formatPrice(e.price)} ({e.percent}%)
              </span>
            ))}
          </div>
        )}

        {mistakes && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text-muted">טעויות:</span>
            <span className="text-loss">
              {mistakes.map((m) => MISTAKE_LABELS[m] || m).join(', ')}
            </span>
          </div>
        )}

        {trade.entryReason && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text-muted">סיבת כניסה:</span>
            <span className="text-text-secondary">{trade.entryReason}</span>
          </div>
        )}

        {hasTags && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="rounded-full bg-bg-tertiary border border-border-primary px-2 py-0.5 text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {trade.notes && (
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="text-text-muted">הערות:</span>
            <span className="text-text-secondary whitespace-pre-wrap">
              {trade.notes}
            </span>
          </div>
        )}
      </div>

      {/* 4) Footer actions */}
      <div className="mt-4 pt-3 border-t border-border-primary flex gap-2 justify-end">
        {status !== 'open' && onShare && (
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 bg-bg-tertiary hover:bg-border-hover text-text-primary rounded-lg px-3 py-2 text-sm"
          >
            <Share2 className="w-4 h-4" />
            שיתוף
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 bg-bg-tertiary hover:bg-border-hover text-text-primary rounded-lg px-3 py-2 text-sm"
          >
            <Pencil className="w-4 h-4" />
            עריכה
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-loss hover:bg-loss/10 rounded-lg px-3 py-2 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            מחיקה
          </button>
        )}
      </div>
    </Modal>
  );
}
