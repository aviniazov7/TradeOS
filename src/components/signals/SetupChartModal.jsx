import { Radar } from 'lucide-react';
import Modal from '../shared/Modal';
import SetupChart from './SetupChart';

const fmt = (p) => (p == null ? '—' : p >= 1000 ? Math.round(p).toLocaleString('en-US') : p >= 1 ? p.toFixed(2) : p.toFixed(5));

// Full multi-timeframe view of a setup, laid out like the trader's own
// TradingView grid: HTF context (1D + 4h) stacked on the left, the entry
// timeframe (30m) big on the right.
export default function SetupChartModal({ isOpen, onClose, signal }) {
  if (!signal) return null;
  const { pair, direction, entryPrice, stopLoss, tps = [], notes, source, confidence } = signal;
  const isLong = direction === 'long';
  const label = isLong ? 'LPS' : 'LPSY';
  const common = { pair, entryPrice, stopLoss, tps, label };
  const isScanner = source === 'scanner';
  const conf = confidence != null ? Number(confidence) : null;
  const scannerLabel = conf != null ? `אותר אוטומטית · ביטחון ${conf}` : 'אותר אוטומטית';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${pair} · ${isLong ? 'לונג' : 'שורט'}`} maxWidth="max-w-5xl">
      <div className="space-y-3">
        {isScanner && (
          <div className="flex justify-center">
            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-primary/15 text-accent-primary">
              <Radar className="w-3 h-3" /> {scannerLabel}
            </span>
          </div>
        )}
        <p className="text-[12px] text-text-secondary bg-bg-tertiary/50 rounded-lg px-3 py-2 text-center">
          🎯 אזור כניסה סביב <span className="font-bold num-mono text-accent-primary">{fmt(entryPrice)}</span>
          {stopLoss != null && <> · סטופ <span className="font-bold num-mono text-loss">{fmt(stopLoss)}</span></>}
        </p>
        {notes && <p className="text-[11px] text-text-muted leading-relaxed text-center">{notes}</p>}

        {/* dir=ltr so the layout matches the trader's TradingView grid: HTF
            context (1D + 4h) on the LEFT, the entry timeframe (30m) big on the RIGHT. */}
        <div dir="ltr" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Left column — higher-timeframe context */}
          <div className="space-y-3">
            <div>
              <p dir="ltr" className="text-[12px] font-semibold text-text-muted mb-1 px-0.5">1D · Context</p>
              <SetupChart {...common} interval="1d" vh={190} />
            </div>
            <div>
              <p dir="ltr" className="text-[12px] font-semibold text-text-muted mb-1 px-0.5">4H · Context</p>
              <SetupChart {...common} interval="4h" vh={190} />
            </div>
          </div>
          {/* Right column — the entry timeframe, big */}
          <div>
            <p dir="ltr" className="text-[12px] font-semibold text-accent-primary mb-1 px-0.5">30M · Entry</p>
            <SetupChart {...common} interval="30m" vh={400} />
          </div>
        </div>

        <p className="text-[10px] text-text-muted text-center pt-1">
          קריאה לימודית בלבד — לא ייעוץ השקעות. ההחלטה והאחריות עליך.
        </p>
      </div>
    </Modal>
  );
}
