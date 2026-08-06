import Modal from '../shared/Modal';
import SetupChart from './SetupChart';

const fmt = (p) => (p == null ? '—' : p >= 1000 ? Math.round(p).toLocaleString('en-US') : p >= 1 ? p.toFixed(2) : p.toFixed(5));

// The three timeframes the method reads — HTF context (1D + 4h) down to the
// entry timeframe (30m), each drawn as bars with the position tool overlaid.
const TFS = [
  { interval: '1d', label: 'יומי · 1D — הקשר' },
  { interval: '4h', label: '4 שעות · 4H — הקשר' },
  { interval: '30m', label: '30 דקות · 30M — הכניסה' },
];

// Full multi-timeframe view of a setup: click the mini chart on a card to open.
export default function SetupChartModal({ isOpen, onClose, signal }) {
  if (!signal) return null;
  const { pair, direction, entryPrice, stopLoss, tps = [], notes } = signal;
  const isLong = direction === 'long';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${pair} · ${isLong ? 'לונג' : 'שורט'}`} maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-[12px] text-text-secondary bg-bg-tertiary/50 rounded-lg px-3 py-2 text-center">
          🎯 אזור כניסה סביב <span className="font-bold num-mono text-accent-primary">{fmt(entryPrice)}</span>
          {stopLoss != null && <> · סטופ <span className="font-bold num-mono text-loss">{fmt(stopLoss)}</span></>}
        </p>
        {notes && <p className="text-[11px] text-text-muted leading-relaxed text-center">{notes}</p>}

        {TFS.map((tf) => (
          <div key={tf.interval}>
            <p className="text-[11px] font-semibold text-text-muted mb-1 px-0.5">{tf.label}</p>
            <SetupChart
              pair={pair}
              entryPrice={entryPrice}
              stopLoss={stopLoss}
              direction={direction}
              interval={tf.interval}
              tps={tps}
              label={isLong ? 'LPS' : 'LPSY'}
            />
          </div>
        ))}

        <p className="text-[10px] text-text-muted text-center pt-1">
          קריאה לימודית בלבד — לא ייעוץ השקעות. ההחלטה והאחריות עליך.
        </p>
      </div>
    </Modal>
  );
}
