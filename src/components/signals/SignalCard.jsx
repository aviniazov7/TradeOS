import { Pencil, Trash2, ArrowRightLeft, CheckCircle2, Clock, Zap } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import SignalTrack from './SignalTrack';
import SetupChart from './SetupChart';

const STATUS = {
  waiting: { label: 'ממתין', icon: Clock, className: 'text-text-muted bg-bg-tertiary border-border-primary' },
  active:  { label: 'פעיל',  icon: Zap,   className: 'text-accent-primary bg-accent-primary/10 border-accent-primary/30' },
  closed:  { label: 'הושלם', icon: CheckCircle2, className: 'text-profit bg-profit/10 border-profit/30' },
};

export default function SignalCard({ signal, currentPrice, onEdit, onDelete, onTransfer, onStatusChange }) {
  const { pair, direction, timeframe, entryPrice, stopLoss, tps = [], status, notes } = signal;
  const isLong = direction === 'long';
  const statusInfo = STATUS[status] || STATUS.waiting;
  const StatusIcon = statusInfo.icon;
  const isWaiting = status === 'waiting';

  return (
    <div className={`bg-bg-secondary rounded-2xl border transition-all ${isWaiting ? 'border-border-primary opacity-80' : 'border-border-primary hover:border-accent-primary/30 hover:shadow-lg'}`}>
      <div className="p-4 space-y-3">

        {/* Top row: coin + direction + status + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CoinIcon pair={pair} className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-text-primary">{pair}</span>
                {timeframe && <span className="text-xs text-text-muted">{timeframe}</span>}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusInfo.className}`}>
              <StatusIcon className="w-3 h-3" />
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Setup chart — annotated OHLC bars with the entry/stop levels marked */}
        {pair && entryPrice != null && (
          <SetupChart pair={pair} entryPrice={entryPrice} stopLoss={stopLoss} direction={direction} interval={timeframe || '30m'} label={isLong ? 'LPS' : 'LPSY'} />
        )}

        {/* Entry zone */}
        {entryPrice != null && (
          <p className="text-[11px] text-center text-text-secondary">
            🎯 אזור כניסה סביב <span className="font-bold num-mono text-accent-primary">{formatPrice(entryPrice)}</span>
          </p>
        )}

        {/* Price info */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <PriceCell label="כניסה" value={entryPrice} color="text-accent-primary" />
          <PriceCell label="סטופ" value={stopLoss} color="text-loss" />
          <PriceCell label={`TP${tps.length > 1 ? `×${tps.length}` : '1'}`} value={tps[0] ?? null} color="text-profit" />
        </div>

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

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border-primary">
          {/* Status toggle */}
          {status === 'waiting' && (
            <button
              onClick={() => onStatusChange(signal.id, 'active')}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary text-xs font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" /> הפעל
            </button>
          )}
          {status === 'active' && (
            <button
              onClick={onTransfer}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-profit/10 text-profit text-xs font-semibold hover:bg-profit/20 transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> העבר ליומן
            </button>
          )}
          <button
            onClick={() => onEdit(signal)}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(signal.id)}
            className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceCell({ label, value, color }) {
  return (
    <div className="bg-bg-tertiary rounded-lg py-1.5">
      <div className="text-[10px] text-text-muted mb-0.5">{label}</div>
      <div className={`text-xs font-bold ${color}`}>{value != null ? formatPrice(value) : '—'}</div>
    </div>
  );
}

function formatPrice(p) {
  if (p == null) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}
