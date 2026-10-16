import Modal from '../shared/Modal';
import TradeScreenshots from './TradeScreenshots';
import TradingViewPreview from './TradingViewPreview';
import {
  formatCurrency,
  formatPrice,
  formatPercent,
  formatSignedR,
  formatDuration,
  formatDateTime,
} from '../../utils/formatters';
import { MISTAKE_LABELS } from '../../utils/constants';
import { isClosedTrade, signedTradeR, tradeNetPercent, tradeDurationMs } from '../../utils/calculations';
import { safeHttpUrl } from '../../utils/urls';
import TradeExcursion from './TradeExcursion';
import {
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Share2,
} from 'lucide-react';

// Safe numeric coercion — returns null when not a finite number.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toDate = (d) => (d?.toDate ? d.toDate() : d ? new Date(d) : null);

// Quality labels: higher is better. Wrong for stress, where 5 is the worst
// answer — it used to render maximum stress as "מעולה" in green.
const RATING_LABELS = { 1: 'נמוך', 2: 'בינוני-', 3: 'בינוני', 4: 'טוב', 5: 'מעולה' };
const STRESS_LABELS = { 1: 'רגוע', 2: 'נמוך', 3: 'בינוני', 4: 'גבוה', 5: 'גבוה מאוד' };
const MENTAL_FIELDS = [
  { key: 'focusRating', label: 'ריכוז וחדות' },
  { key: 'confidenceRating', label: 'ביטחון בעסקה' },
  { key: 'stressRating', label: 'לחץ / סטרס', invert: true },
  { key: 'planAdherenceRating', label: 'הצמדות לתוכנית' },
];

// Compact key-value board — thin card, title line, then an aligned grid of
// label→value pairs: two columns on phones, four from sm up. Labels sit at
// the row start (right in RTL) and values align at the column end, so
// everything scans as clean columns instead of a dense run-on line. Values
// render LTR so prices don't flip in RTL.
function Strip({ title, items }) {
  const visible = items.filter(
    (it) => it.value !== null && it.value !== undefined && it.value !== '' && it.value !== '—'
  );
  if (!visible.length) return null;
  return (
    <div className="bg-bg-tertiary/60 border border-border-primary/60 rounded-xl px-4 py-2.5">
      <div className="text-[11px] font-semibold text-text-muted mb-1.5">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-1.5">
        {visible.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[11px] text-text-muted shrink-0">{it.label}</span>
            <span
              className={`text-[13px] font-semibold text-left truncate ${it.cls || 'text-text-primary'}`}
              dir="ltr"
              title={typeof it.value === 'string' ? it.value : undefined}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
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
  if (!trade) return null;

  const pair = trade.pair || trade.symbol || '';
  const pnl = trade.netPnl ?? trade.pnl ?? 0;
  // Same predicate as the table: a broker CSV import is status:'closed' with
  // pnlFromExchange but no exit price, and must not read as "open" here.
  const status =
    trade.status === 'partial'
      ? 'partial'
      : isClosedTrade(trade)
        ? 'closed'
        : 'open';
  const pnlColor = (v) =>
    v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-breakeven';

  const isFutures = trade.assetClass === 'futures_cme';

  // Same clock as the analytics KPI and the duration chart: exit − entry,
  // and only when the exit is actually later. createdAt is not a close time.
  const durationMs = tradeDurationMs(trade);
  const durationHours = durationMs == null ? null : durationMs / 3_600_000;

  // Unsigned dollars (size, risk, fees) still use the shared formatter so the
  // digits and the "$" stay isolated in RTL. The leading "+" is for P&L only.
  const formatMoney = (v) => {
    const n = num(v);
    if (n === null) return null;
    return formatCurrency(Math.abs(n)).replace('+', '');
  };

  // ── TradingView snapshot preview ──────────────────────────────────
  // User-typed URL — sanitize once here; every href/img below derives from it.
  const tvUrl = safeHttpUrl(trade.tradingViewUrl) || '';

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
  // Boolean() — a bare `tags && tags.length` evaluates to the NUMBER 0 for an
  // empty array, and React renders that 0 as literal text at the bottom.
  const hasTags = Boolean(tags && tags.length);

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

  const kpis = [
    {
      label: 'רווח/הפסד נטו',
      value: formatCurrency(pnl),
      cls: `text-2xl sm:text-3xl font-bold ${pnlColor(pnl)}`,
    },
    {
      label: 'תשואה נטו',
      value: status === 'open' ? '—' : formatPercent(tradeNetPercent(trade)),
      cls: `text-xl sm:text-2xl font-bold ${status === 'open' ? 'text-text-primary' : pnlColor(tradeNetPercent(trade))}`,
    },
    {
      label: 'מכפיל R נטו',
      value: status === 'open' ? '—' : formatSignedR(signedTradeR(trade)),
      cls: 'text-xl sm:text-2xl font-bold text-text-primary',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${pair} · פרטי עסקה`}
      maxWidth="max-w-3xl"
    >
      {/* 1) Header strip — badges on the right, actions on the left (RTL) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {trade.direction === 'short' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-short/15 text-short px-2.5 py-1 text-xs font-semibold">
            <TrendingDown className="w-3.5 h-3.5" />
            שורט
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-long/15 text-long px-2.5 py-1 text-xs font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            לונג
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
        {durationHours !== null && (
          <span className="text-text-muted text-xs">· {formatDuration(durationHours)}</span>
        )}

        <div className="ms-auto flex items-center gap-1">
          {status !== 'open' && onShare && (
            <button
              type="button"
              onClick={handleShare}
              title="שיתוף"
              aria-label="שיתוף"
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              title="עריכה"
              aria-label="עריכה"
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              title="מחיקה"
              aria-label="מחיקה"
              className="p-2 rounded-lg text-text-muted hover:text-loss hover:bg-loss/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2) KPI hero — the three numbers that matter, one glance */}
      <div
        className={`rounded-2xl border bg-bg-tertiary mb-3 grid grid-cols-3 divide-x divide-x-reverse divide-border-primary ${
          pnl > 0 ? 'border-profit/25' : pnl < 0 ? 'border-loss/25' : 'border-border-primary'
        }`}
      >
        {kpis.map((k) => (
          <div key={k.label} className="px-3 py-3 text-center">
            <div className="text-[11px] text-text-muted mb-0.5">{k.label}</div>
            <div className={k.cls} dir="ltr">{k.value}</div>
          </div>
        ))}
      </div>

      {/* 3) Levels + trade info — two compact horizontal strips */}
      <div className="space-y-3">
        <Strip
          title="רמות מחיר"
          items={[
            { label: 'כניסה', value: formatPrice(trade.entryPrice) },
            { label: 'סטופ', value: num(trade.stopLoss) > 0 ? formatPrice(trade.stopLoss) : null, cls: 'text-loss' },
            ...(partialExits
              ? partialExits.map((e, i) => ({
                  label: `TP${i + 1} · ${e.percent}%`,
                  value: formatPrice(e.price),
                  cls: 'text-profit',
                }))
              : []),
            {
              label: partialExits ? 'סגירה (משוקלל)' : 'סגירה',
              // Closed imports may have no exit price — hide the row instead of "0".
              value: status === 'open' || !(Number(trade.exitPrice) > 0) ? null : formatPrice(trade.exitPrice),
              cls: pnlColor(pnl),
            },
          ]}
        />
        <Strip
          title="פרטי עסקה"
          items={[
            { label: 'גודל פוזיציה', value: formatMoney(trade.positionSize) },
            { label: 'סיכון', value: formatMoney(trade.riskAmount) },
            {
              label: isFutures ? 'חוזים' : 'מינוף',
              value: isFutures
                ? (trade.contract?.contracts ?? trade.quantity ?? null)
                : trade.leverage ? `x${trade.leverage}` : null,
            },
            { label: 'עמלות', value: formatMoney(trade.fees) },
            { label: 'אסטרטגיה', value: trade.strategy || null },
            { label: 'טריגר', value: trade.trigger || null },
            { label: 'טווח זמן', value: trade.timeframe || null },
            { label: 'סשן', value: trade.session || null },
          ]}
        />
      </div>

      {status === 'closed' && <TradeExcursion key={trade.id} trade={trade} />}

      {/* 5) Full-width details */}
      <div className="mt-3 space-y-3 text-xs">
        {MENTAL_FIELDS.some((f) => trade[f.key]) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-bg-tertiary/60 border border-border-primary/60 rounded-xl px-3 py-2">
            <span className="text-[11px] text-text-muted font-semibold">מנטלי</span>
            {MENTAL_FIELDS.map((f) => {
              const val = trade[f.key];
              if (!val) return null;
              // On an inverted scale a high score is the bad outcome, so both
              // the colour and the wording have to flip with it.
              const good = f.invert ? val <= 2 : val >= 4;
              const bad = f.invert ? val >= 4 : val <= 2;
              let tone = 'text-text-primary';
              if (good) tone = 'text-profit';
              else if (bad) tone = 'text-loss';
              return (
                <span key={f.key} className="text-text-secondary whitespace-nowrap">
                  {f.label}{' '}
                  <span
                    className={`font-semibold ${tone}`}
                    dir="ltr"
                    title={(f.invert ? STRESS_LABELS : RATING_LABELS)[val]}
                  >
                    {val}/5
                  </span>
                </span>
              );
            })}
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

      {tvUrl && <TradingViewPreview key={tvUrl} url={tvUrl} pair={pair} />}

      {/* 7) Uploaded chart screenshots (own component + subcollection) */}
      {trade.id && <TradeScreenshots key={trade.id} tradeId={trade.id} pair={pair} />}
    </Modal>
  );
}
