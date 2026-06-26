import Modal from '../shared/Modal';
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
} from 'lucide-react';

// Safe numeric coercion — returns null when not a finite number.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function TradeDetailModal({
  trade,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onShare,
}) {
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
  const toDate = (d) =>
    d?.toDate ? d.toDate() : d ? new Date(d) : null;

  const isFutures = trade.assetClass === 'futures_cme';

  // ── Duration ──────────────────────────────────────────────────────
  const entryDt = toDate(trade.entryDate);
  const exitDt = toDate(trade.exitDate || trade.createdAt);
  let durationHours = null;
  if (entryDt && exitDt && !isNaN(entryDt) && !isNaN(exitDt)) {
    const h = (exitDt.getTime() - entryDt.getTime()) / 3_600_000;
    if (h > 0) durationHours = h;
  }

  // ── Chart levels ──────────────────────────────────────────────────
  const entry = num(trade.entryPrice);
  const stop = num(trade.stopLoss);
  const exit = status === 'open' ? null : num(trade.exitPrice);
  const tps = (trade.tps || []).map(num).filter((n) => n !== null && n > 0);

  const allLevels = [entry, stop, exit, ...tps].filter(
    (n) => n !== null && n > 0
  );
  const distinct = [...new Set(allLevels)];

  // SVG geometry
  const VB_W = 300;
  const VB_H = 240;
  const PAD = 16;

  let lo = distinct.length ? Math.min(...distinct) : 0;
  let hi = distinct.length ? Math.max(...distinct) : 0;
  if (distinct.length < 2) {
    const base = distinct.length ? distinct[0] : 1;
    const pad = Math.abs(base) * 0.005 || 0.5;
    lo = base - pad;
    hi = base + pad;
  }
  const span = hi - lo || 1;
  // higher price → smaller y (top of chart)
  const yFor = (price) =>
    PAD + (1 - (price - lo) / span) * (VB_H - 2 * PAD);

  // best tp for the profit-zone extent when no exit
  const bestTp =
    tps.length > 0
      ? trade.direction === 'short'
        ? Math.min(...tps)
        : Math.max(...tps)
      : null;
  const profitTarget = exit ?? bestTp;

  const profitZone =
    entry !== null && profitTarget !== null
      ? { y1: yFor(entry), y2: yFor(profitTarget) }
      : null;
  const riskZone =
    entry !== null && stop !== null
      ? { y1: yFor(entry), y2: yFor(stop) }
      : null;

  const clampY = (y) => Math.max(PAD - 4, Math.min(VB_H - PAD + 4, y));

  // Build labelled line descriptors
  const lines = [];
  if (entry !== null && entry > 0)
    lines.push({
      key: 'entry',
      value: entry,
      label: 'כניסה',
      stroke: 'var(--color-text-secondary)',
      fill: 'var(--color-text-secondary)',
      dashed: false,
    });
  if (stop !== null && stop > 0)
    lines.push({
      key: 'stop',
      value: stop,
      label: 'סטופ',
      stroke: 'var(--color-loss)',
      fill: 'var(--color-loss)',
      dashed: true,
    });
  if (exit !== null && exit > 0)
    lines.push({
      key: 'exit',
      value: exit,
      label: 'סגירה',
      stroke: pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)',
      fill: pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)',
      dashed: false,
    });
  tps.forEach((tp, i) =>
    lines.push({
      key: `tp-${i}`,
      value: tp,
      label: tps.length > 1 ? `TP${i + 1}` : 'TP',
      stroke: 'rgba(34,197,94,0.4)',
      fill: 'rgba(34,197,94,0.7)',
      dashed: true,
    })
  );

  const hasChart = lines.length > 0;

  // ── Stat tiles ────────────────────────────────────────────────────
  const moneyOrDash = (v) =>
    num(v) !== null ? `$${Number(v).toLocaleString()}` : '—';

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
          <span className="text-xs text-text-muted">מבנה העסקה</span>
          {hasChart ? (
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              width="100%"
              height={VB_H}
              className="mt-2"
            >
              {/* Profit zone */}
              {profitZone && (
                <rect
                  x="0"
                  y={Math.min(profitZone.y1, profitZone.y2)}
                  width={VB_W}
                  height={Math.abs(profitZone.y2 - profitZone.y1)}
                  fill="rgba(34,197,94,0.12)"
                />
              )}
              {/* Risk zone */}
              {riskZone && (
                <rect
                  x="0"
                  y={Math.min(riskZone.y1, riskZone.y2)}
                  width={VB_W}
                  height={Math.abs(riskZone.y2 - riskZone.y1)}
                  fill="rgba(239,68,68,0.12)"
                />
              )}
              {/* Lines + labels */}
              {lines.map((ln) => {
                const y = yFor(ln.value);
                const ly = clampY(y);
                return (
                  <g key={ln.key}>
                    <line
                      x1="0"
                      y1={y}
                      x2={VB_W}
                      y2={y}
                      stroke={ln.stroke}
                      strokeWidth="1.5"
                      strokeDasharray={ln.dashed ? '4 4' : undefined}
                    />
                    <text
                      x="4"
                      y={ly - 3}
                      fontSize="10"
                      fill={ln.fill}
                      direction="ltr"
                    >
                      {ln.label} {formatPrice(ln.value)}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="mt-2 h-40 flex items-center justify-center text-text-muted text-xs">
              אין נתוני מחיר
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
