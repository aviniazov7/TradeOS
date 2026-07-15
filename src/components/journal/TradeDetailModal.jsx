import { useState, useEffect } from 'react';
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
  ImageOff,
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

// Resolve a TradingView link to its snapshot image so the modal can preview
// it inline. Direct image URLs pass through; a tradingview.com/x/<id> share
// page maps to its s3 snapshot (first letter of the id = the shard folder).
const tvImageUrl = (url) => {
  if (!url) return null;
  if (/\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) return url;
  const m = url.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/i);
  if (m) return `https://s3.tradingview.com/snapshots/${m[1][0].toLowerCase()}/${m[1]}.png`;
  return null;
};

// A single label/value line inside a details card. Values render LTR so
// prices/percentages don't flip in the RTL layout.
function Row({ label, value, cls }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className={`text-sm font-medium ${cls || 'text-text-primary'}`} dir="ltr">{value}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-bg-tertiary border border-border-primary rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
      </div>
      <div className="px-4 py-1.5 divide-y divide-border-primary/50">{children}</div>
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
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [trade?.id, isOpen]);

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

  const moneyOrDash = (v) => {
    const n = num(v);
    if (n === null) return null;
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  };

  // ── TradingView snapshot preview ──────────────────────────────────
  const tvUrl = trade.tradingViewUrl || '';
  const tvImg = tvImageUrl(tvUrl);

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

  const kpis = [
    {
      label: 'Net P&L',
      value: formatCurrency(pnl),
      cls: `text-2xl sm:text-3xl font-bold ${pnlColor(pnl)}`,
    },
    {
      label: 'תשואה',
      value: status === 'open' ? '—' : formatPercent(trade.pnlPercent),
      cls: `text-xl sm:text-2xl font-bold ${status === 'open' ? 'text-text-primary' : pnlColor(trade.pnlPercent)}`,
    },
    {
      label: 'R-Multiple',
      value: formatRR(trade.rrRatio, pnl),
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
        {durationHours !== null && (
          <span className="text-text-muted text-xs">· {formatDuration(durationHours)}</span>
        )}
      </div>

      {/* 2) KPI hero — the three numbers that matter, one glance */}
      <div
        className={`rounded-2xl border bg-bg-tertiary mb-4 grid grid-cols-3 divide-x divide-x-reverse divide-border-primary ${
          pnl > 0 ? 'border-profit/25' : pnl < 0 ? 'border-loss/25' : 'border-border-primary'
        }`}
      >
        {kpis.map((k) => (
          <div key={k.label} className="px-3 py-4 text-center">
            <div className="text-[11px] text-text-muted mb-1">{k.label}</div>
            <div className={k.cls} dir="ltr">{k.value}</div>
          </div>
        ))}
      </div>

      {/* 3) TradingView snapshot — shown only when the trade carries a link */}
      {tvUrl && (
        <div className="rounded-2xl border border-border-primary bg-bg-tertiary overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-primary">
            <span className="text-xs font-semibold text-text-secondary">צילום גרף</span>
            <a
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent-primary text-xs hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              פתח ב-TradingView
            </a>
          </div>
          {tvImg && !imgFailed ? (
            <a href={tvUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={tvImg}
                alt={`צילום גרף — ${pair}`}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="w-full max-h-[400px] object-contain bg-black/30"
              />
            </a>
          ) : (
            <a
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-28 flex flex-col items-center justify-center gap-1.5 text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              <ImageOff className="w-5 h-5" />
              אין תצוגה מקדימה — לחץ לפתיחת הקישור
            </a>
          )}
        </div>
      )}

      {/* 4) Levels + trade info, clean definition rows instead of tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="רמות מחיר">
          <Row label="כניסה" value={formatPrice(trade.entryPrice)} />
          <Row label="סטופ" value={num(trade.stopLoss) > 0 ? formatPrice(trade.stopLoss) : null} cls="text-loss" />
          {partialExits ? (
            partialExits.map((e, i) => (
              <Row
                key={i}
                label={`TP${i + 1} · ${e.percent}%`}
                value={formatPrice(e.price)}
                cls="text-profit"
              />
            ))
          ) : null}
          <Row
            label={partialExits ? 'סגירה (משוקלל)' : 'סגירה'}
            value={status === 'open' ? null : formatPrice(trade.exitPrice)}
            cls={pnlColor(pnl)}
          />
        </Card>

        <Card title="פרטי עסקה">
          <Row label="גודל פוזיציה" value={moneyOrDash(trade.positionSize)} />
          <Row label="סיכון" value={moneyOrDash(trade.riskAmount)} />
          <Row
            label={isFutures ? 'חוזים' : 'מינוף'}
            value={isFutures
              ? (trade.contract?.contracts ?? trade.quantity ?? null)
              : trade.leverage ? `x${trade.leverage}` : null}
          />
          <Row label="עמלות" value={moneyOrDash(trade.fees)} />
          <Row label="אסטרטגיה" value={trade.strategy || null} />
          <Row label="טריגר" value={trade.trigger || null} />
          <Row label="טווח זמן" value={trade.timeframe || null} />
          <Row label="סשן" value={trade.session || null} />
        </Card>
      </div>

      {/* 5) Full-width details */}
      <div className="mt-4 space-y-3 text-xs">
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

      {/* 6) Footer actions */}
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
