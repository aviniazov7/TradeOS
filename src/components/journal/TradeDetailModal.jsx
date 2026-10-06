import { useState } from 'react';
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
import { isClosedTrade } from '../../utils/calculations';
import { safeHttpUrl } from '../../utils/urls';
import {
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Share2,
  ExternalLink,
  ImageOff,
  Copy,
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
  { key: 'focusRating', label: 'ריכוז' },
  { key: 'confidenceRating', label: 'ביטחון' },
  { key: 'stressRating', label: 'לחץ', invert: true },
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
  onDuplicate,
  onShare,
}) {
  // Track WHICH trade's image failed (not a boolean) so switching to another
  // trade naturally resets the fallback without an effect.
  const [imgFailedKey, setImgFailedKey] = useState(null);

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

  // ── Duration ──────────────────────────────────────────────────────
  const entryDt = toDate(trade.entryDate);
  const exitDt = toDate(trade.exitDate || trade.createdAt);
  let durationHours = null;
  if (entryDt && exitDt && !isNaN(entryDt) && !isNaN(exitDt)) {
    const h = (exitDt.getTime() - entryDt.getTime()) / 3_600_000;
    if (h > 0) durationHours = h;
  }

  // Compact money formatter; returns null for non-numbers so the Strip board
  // simply drops the row (it used to be called moneyOrDash — it never dashed).
  const formatMoney = (v) => {
    const n = num(v);
    if (n === null) return null;
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  // ── TradingView snapshot preview ──────────────────────────────────
  // User-typed URL — sanitize once here; every href/img below derives from it.
  const tvUrl = safeHttpUrl(trade.tradingViewUrl) || '';
  const tvImg = tvImageUrl(tvUrl);
  // Latch failures by URL (not trade.id): editing the trade with a fixed link
  // retries immediately instead of showing "אין תצוגה מקדימה" until page leave.
  const imgKey = tvUrl;
  const imgFailed = imgFailedKey === imgKey;

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
  const handleDuplicate = () => {
    onClose?.();
    onDuplicate?.(trade);
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
      {/* 1) Header strip — badges on the right, actions on the left (RTL) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
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

        <div className="ms-auto flex items-center gap-1">
          {status !== 'open' && onShare && (
            <button
              type="button"
              onClick={handleShare}
              title="שיתוף"
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
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={handleDuplicate}
              title="שכפול — עסקה חדשה עם אותם פרטים"
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              title="מחיקה"
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

      {/* 6) TradingView snapshot — at the very bottom, when the trade has a link */}
      {tvUrl && (
        <div className="rounded-2xl border border-border-primary bg-bg-tertiary overflow-hidden mt-3">
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
                onError={() => setImgFailedKey(imgKey)}
                className="w-full max-h-[280px] object-contain bg-black/30"
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
    </Modal>
  );
}
