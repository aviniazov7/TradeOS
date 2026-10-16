import CoinIcon from '../shared/CoinIcon';
import { Chip, ExchangeTag, Num } from './terminalUi';
import { fmtPx, fmtQty, ORDER_KIND_LABELS } from '../../utils/terminal';

// Resting orders (limit / market / TP / SL / trigger / trailing) across the
// connected venues — table from md up, cards on phones. Clicking an order
// puts its symbol on the charts.
//   rows: [{ key, o (normalized order), journalName }]

const KIND_TONE = {
  stop_loss: 'text-breakeven border-breakeven/30 bg-breakeven/10',
  take_profit: 'text-accent-hover border-accent-primary/30 bg-accent-primary/10',
};

function KindChip({ o }) {
  return (
    <Chip className={KIND_TONE[o.kind] || ''} title={o.orderType || undefined}>
      {ORDER_KIND_LABELS[o.kind] || o.kind}
    </Chip>
  );
}

// Buy/sell is direction, so it may use the long/short tokens.
function SideCell({ o }) {
  const buy = o.side === 'buy';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`font-bold ${buy ? 'text-long' : 'text-short'}`}>{buy ? 'קנייה' : 'מכירה'}</span>
      <span className="text-[10px] text-text-muted">
        {o.effect === 'close' ? 'סגירה' : 'פתיחה'}{o.positionSide ? ` ${o.positionSide === 'long' ? 'לונג' : 'שורט'}` : ''}
      </span>
    </span>
  );
}

// Numbers in the tabular face; the Hebrew words stay in the text face.
const PriceVal = ({ o }) => (o.price > 0 ? <Num className="text-text-primary">{fmtPx(o.price)}</Num> : <span className="text-text-secondary">מרקט</span>);
const QtyVal = ({ o }) => (o.wholePosition ? <span className="text-text-secondary whitespace-nowrap">כל הפוזיציה</span> : <Num className="text-text-primary">{fmtQty(o.qty)}</Num>);
const timeText = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
function Attached({ o }) {
  if (!(o.attachedTp > 0) && !(o.attachedSl > 0)) return <Num className="text-text-muted">—</Num>;
  return (
    <span dir="ltr" className="inline-flex flex-col items-end leading-tight text-[11px]">
      {o.attachedTp > 0 && <span className="text-text-secondary">TP <Num>{fmtPx(o.attachedTp)}</Num></span>}
      {o.attachedSl > 0 && <span className="text-text-secondary">SL <Num>{fmtPx(o.attachedSl)}</Num></span>}
    </span>
  );
}

const TH = 'px-2 py-2 text-start text-[11px] font-medium text-text-muted whitespace-nowrap';
const TD = 'px-2 py-2.5 text-start align-middle';

function OrdersTable({ rows, onSelect }) {
  return (
    <div className="overflow-x-auto -mx-px">
      <table className="w-full min-w-[1080px] text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-border-primary">
            <th className={TH}>סימבול</th>
            <th className={TH}>חשבון</th>
            <th className={TH}>צד</th>
            <th className={TH}>סוג</th>
            <th className={TH}>מחיר</th>
            <th className={TH}>טריגר</th>
            <th className={TH}>כמות</th>
            <th className={TH}>מולא</th>
            <th className={TH}>Reduce-only</th>
            <th className={TH}>TP/SL מצורף</th>
            <th className={TH}>נוצרה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, o, journalName }) => (
            <tr key={key} onClick={onSelect ? () => onSelect(o) : undefined} className={`border-b border-border-primary/60 last:border-0 transition-colors ${onSelect ? 'cursor-pointer hover:bg-bg-tertiary' : ''}`}>
              <td className={TD}>
                <span className="inline-flex items-center gap-2">
                  <CoinIcon pair={o.pair} className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-text-primary" dir="ltr">{o.pair}</span>
                </span>
              </td>
              <td className={TD}><ExchangeTag exchange={o.exchange} journal={journalName} /></td>
              <td className={TD}><SideCell o={o} /></td>
              <td className={TD}><KindChip o={o} /></td>
              <td className={TD}><PriceVal o={o} /></td>
              <td className={TD}><Num className="text-text-primary">{o.triggerPrice > 0 ? fmtPx(o.triggerPrice) : '—'}</Num></td>
              <td className={TD}><QtyVal o={o} /></td>
              <td className={TD}><Num className="text-text-secondary">{o.filledQty > 0 ? fmtQty(o.filledQty) : '—'}</Num></td>
              <td className={TD}>{o.reduceOnly ? <Chip>כן</Chip> : <span className="text-text-muted">—</span>}</td>
              <td className={TD}><Attached o={o} /></td>
              <td className={TD}><Num className="text-text-secondary">{timeText(o.createdAt)}</Num></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-text-muted truncate">{label}</div>
      <div className="text-[12px] truncate">{children}</div>
    </div>
  );
}

function OrderCard({ row, onSelect }) {
  const { o, journalName } = row;
  const Tag = onSelect ? 'button' : 'div';
  return (
    <Tag type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(o) : undefined} className={`w-full text-start rounded-2xl border border-border-primary bg-bg-tertiary p-3 transition-colors ${onSelect ? 'cursor-pointer hover:border-border-hover' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CoinIcon pair={o.pair} className="w-5 h-5 shrink-0" />
            <span className="font-bold text-sm text-text-primary" dir="ltr">{o.pair}</span>
            <KindChip o={o} />
            {o.reduceOnly && <Chip>Reduce-only</Chip>}
          </div>
          <div className="text-[11px]"><ExchangeTag exchange={o.exchange} journal={journalName} /></div>
        </div>
        <div className="text-[12px] shrink-0"><SideCell o={o} /></div>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-border-primary/70">
        <Stat label="מחיר"><PriceVal o={o} /></Stat>
        <Stat label="טריגר"><Num className="text-text-primary">{o.triggerPrice > 0 ? fmtPx(o.triggerPrice) : '—'}</Num></Stat>
        <Stat label="כמות"><QtyVal o={o} /></Stat>
        <Stat label="מולא"><Num className="text-text-secondary">{o.filledQty > 0 ? fmtQty(o.filledQty) : '—'}</Num></Stat>
        <Stat label="TP/SL מצורף"><Attached o={o} /></Stat>
        <Stat label="נוצרה"><Num className="text-text-secondary">{timeText(o.createdAt)}</Num></Stat>
      </div>
    </Tag>
  );
}

export default function TerminalOrders({ rows, onSelect, mobile }) {
  if (mobile) {
    return <div className="space-y-2">{rows.map((r) => <OrderCard key={r.key} row={r} onSelect={onSelect} />)}</div>;
  }
  return <OrdersTable rows={rows} onSelect={onSelect} />;
}
