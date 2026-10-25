import { useState } from 'react';
import { Pencil, Trash2, CheckCircle2, Clock, Zap, Maximize2, Radar, ThumbsUp, ThumbsDown, TrendingUp, TrendingDown } from 'lucide-react';
import { safeDate, formatRelativeTime, formatDateTime } from '../../utils/formatters';
import CoinIcon from '../shared/CoinIcon';
import SignalTrack from './SignalTrack';
import SetupChart from './SetupChart';
import SetupChartModal from './SetupChartModal';

const STATUS = {
  waiting: { label: 'ממתין', icon: Clock, className: 'text-text-muted bg-bg-tertiary border-border-primary' },
  active:  { label: 'פעיל',  icon: Zap,   className: 'text-accent-primary bg-accent-primary/10 border-accent-primary/30' },
  closed:  { label: 'הושלם', icon: CheckCircle2, className: 'text-profit bg-profit/10 border-profit/30' },
};

export default function SignalCard({ signal, currentPrice, onEdit, onDelete, onStatusChange, onLabel }) {
  const [chartOpen, setChartOpen] = useState(false);
  const { pair, direction, timeframe, entryPrice, stopLoss, tps = [], status, notes, source, confidence, labeled } = signal;
  const isLong = direction === 'long';
  const isScanner = source === 'scanner';
  const conf = confidence != null ? Number(confidence) : null;
  const scannerTitle = conf != null
    ? `אותר אוטומטית על ידי המנוע · ציון ביטחון ${conf}`
    : 'אותר אוטומטית על ידי המנוע';
  const statusInfo = STATUS[status] || STATUS.waiting;
  const StatusIcon = statusInfo.icon;
  const isWaiting = status === 'waiting';

  const found = safeDate(signal.createdAt);

  return (
    <div className={`h-full bg-bg-secondary rounded-2xl border border-border-primary transition-colors ${isWaiting ? '' : 'hover:border-accent-primary/30'}`}>
      <div className="h-full p-4 flex flex-col gap-3">

        {/* Top row: coin + direction + timeframe · status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <CoinIcon pair={pair} className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-text-primary" dir="ltr">{pair}</span>
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isLong ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                  {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
                {timeframe && <span className="text-[10px] font-semibold num-mono px-1.5 py-0.5 rounded-md bg-bg-tertiary border border-border-primary text-text-secondary">{timeframe}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-text-muted min-w-0">
                {found && <time dateTime={found.toISOString()} title={formatDateTime(found)} className="truncate">{formatRelativeTime(found)}</time>}
                {isScanner ? (
                  <span className="inline-flex items-center gap-1 text-accent-primary shrink-0" title={scannerTitle}>
                    {found && <span className="text-text-muted">·</span>}
                    <Radar className="w-3 h-3" /> מנוע{conf != null && <span className="num-mono font-bold">{conf}</span>}
                  </span>
                ) : (
                  <span className="shrink-0">{found && '· '}ידני</span>
                )}
              </div>
            </div>
          </div>
          <span className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.className}`}>
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </span>
        </div>

        {/* Setup chart — click to open the full 3-timeframe view */}
        {pair && entryPrice != null && (
          <button onClick={() => setChartOpen(true)} className="relative block w-full group/chart cursor-pointer" title="פתח תצוגת 3 מימדי זמן">
            <SetupChart pair={pair} entryPrice={entryPrice} stopLoss={stopLoss} direction={direction} interval={timeframe || '30m'} label={isLong ? 'LPS' : 'LPSY'} tps={tps} />
            <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] text-text-secondary bg-bg-primary/70 backdrop-blur px-1.5 py-0.5 rounded-md opacity-0 group-hover/chart:opacity-100 transition-opacity">
              <Maximize2 className="w-2.5 h-2.5" /> 3 מימדי זמן
            </span>
          </button>
        )}

        {/* Price info */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <PriceCell label="כניסה" value={entryPrice} color="text-accent-primary" />
          <PriceCell label="סטופ" value={stopLoss} color="text-loss" />
          <PriceCell label={`TP${tps.length > 1 ? `×${tps.length}` : '1'}`} value={tps[0] ?? null} color="text-profit" />
        </div>

        {/* Scanner confidence bar */}
        {isScanner && conf != null && (
          <div>
            <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
              <span>ביטחון המנוע</span>
              <span className="num-mono font-bold text-accent-primary">{conf}</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${conf}%`, background: 'linear-gradient(90deg,#005e80,#007ba7)' }} />
            </div>
          </div>
        )}

        {/* Track */}
        <SignalTrack signal={signal} currentPrice={currentPrice} />

        {/* TP list if more than 1 */}
        {tps.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {tps.map((tp, i) => (
              <span key={i} className="text-[11px] bg-profit/10 text-profit border border-profit/20 px-2 py-0.5 rounded-full">
                TP{i + 1}: {formatPrice(tp)}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {notes && (
          <p className="text-xs text-text-muted leading-relaxed line-clamp-2">{notes}</p>
        )}

        {/* Feedback loop → ground-truth DB: one click labels this setup into the
            training DB (no retyping). The active verdict stays highlighted and
            is changeable. */}
        {onLabel && entryPrice != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted shrink-0">לאימון:</span>
            <button
              onClick={() => onLabel(signal, 'valid')}
              title="הסטאפ תקין — שמור לאימון המנוע"
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                labeled === 'valid' ? 'bg-profit/15 text-profit border-profit/40' : 'text-text-muted border-border-primary hover:text-profit hover:border-profit/30'
              }`}
            >
              <ThumbsUp className="w-3 h-3" /> תקין
            </button>
            <button
              onClick={() => onLabel(signal, 'invalid')}
              title="לא תקין — שמור לאימון המנוע"
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                labeled === 'invalid' ? 'bg-loss/15 text-loss border-loss/40' : 'text-text-muted border-border-primary hover:text-loss hover:border-loss/30'
              }`}
            >
              <ThumbsDown className="w-3 h-3" /> לא תקין
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-1.5 pt-2 border-t border-border-primary">
          {/* Status toggle */}
          {status === 'waiting' && (
            <button
              onClick={() => onStatusChange(signal.id, 'active')}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary text-xs font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" /> הפעל
            </button>
          )}
          <button
            onClick={() => onEdit(signal)}
            title="עריכה"
            aria-label="עריכה"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(signal.id)}
            title="מחיקה"
            aria-label="מחיקה"
            className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <SetupChartModal isOpen={chartOpen} onClose={() => setChartOpen(false)} signal={signal} />
      </div>
    </div>
  );
}

function PriceCell({ label, value, color }) {
  return (
    <div className="bg-bg-tertiary rounded-lg py-1.5">
      <div className="text-[10px] text-text-muted mb-0.5">{label}</div>
      <div dir="ltr" className={`text-xs font-bold num-mono ${color}`}>{value != null ? formatPrice(value) : '—'}</div>
    </div>
  );
}

function formatPrice(p) {
  if (p == null) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}
