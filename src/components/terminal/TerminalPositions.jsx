import { BookOpen, Radio } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import { DirBadge, Chip, ExchangeTag, Num } from './terminalUi';
import { fmtPx, fmtQty, fmtUsd, fmtPct, fmtR, pnlTone } from '../../utils/terminal';

// Open positions: a dense table from md up (scrolls sideways inside its
// panel, never the page), cards on phones. Clicking a position puts its
// symbol on the charts.
//   rows: [{ key, p (position), m (positionMetrics), journalName, inJournal, live }]

const MARGIN_LABEL = { cross: 'קרוס', isolated: 'מבודד' };

function StopCell({ m }) {
  if (!(m.stop > 0)) return <span className="text-[11px] font-semibold text-breakeven">ללא סטופ</span>;
  return (
    <Num className="text-text-primary" title={m.stopSource === 'order' ? 'מפקודת סטופ פתוחה' : 'סטופ על הפוזיציה'}>
      {fmtPx(m.stop)}
    </Num>
  );
}

function RiskCell({ m }) {
  if (m.riskUsd == null) return <Num className="text-text-muted">—</Num>;
  if (m.riskUsd <= 0) return <span className="text-[11px] text-text-secondary whitespace-nowrap" title="הסטופ מעבר למחיר הכניסה">נעול <Num>{fmtUsd(-m.riskUsd)}</Num></span>;
  return <Num className="text-text-primary">{fmtUsd(m.riskUsd)}</Num>;
}

function FeesCell({ p }) {
  const main = p.feesPaid != null ? fmtUsd(p.feesPaid) : p.realizedPnl != null ? fmtUsd(p.realizedPnl, { signed: true }) : '—';
  const title = p.feesPaid != null ? 'עמלות מסחר ששולמו על הפוזיציה' : p.realizedPnl != null ? 'ממומש על הפוזיציה הפתוחה (עמלות + מימון + סגירות חלקיות)' : undefined;
  return (
    <div className="leading-tight" title={title}>
      <Num className="text-text-secondary">{main}</Num>
      {p.funding != null && p.funding !== 0 && (
        <div className="text-[10px] text-text-muted">מימון <Num>{fmtUsd(p.funding, { signed: true })}</Num></div>
      )}
    </div>
  );
}

function PnlCell({ m, align = '' }) {
  return (
    <div className={`leading-tight ${align}`}>
      <Num className={`font-bold ${pnlTone(m.upnl)}`}>{fmtUsd(m.upnl, { signed: true })}</Num>
      <div><Num className={`text-[10px] ${pnlTone(m.upnl)}`}>{fmtPct(m.upnlPct)}</Num></div>
    </div>
  );
}

function SymbolCell({ p, inJournal }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <CoinIcon pair={p.pair} className="w-5 h-5 shrink-0" />
      <span className="font-bold text-text-primary whitespace-nowrap" dir="ltr">{p.pair}</span>
      <DirBadge direction={p.direction} />
      <Chip><Num>{`${+(Number(p.leverage) || 1).toFixed(2)}x`}</Num></Chip>
      {p.marginMode && <Chip>{MARGIN_LABEL[p.marginMode] || p.marginMode}</Chip>}
      {inJournal && <BookOpen className="w-3.5 h-3.5 text-accent-primary shrink-0" aria-label="מתועד ביומן" />}
    </div>
  );
}

const TH = 'px-2 py-2 text-start text-[11px] font-medium text-text-muted whitespace-nowrap';
const TD = 'px-2 py-2.5 text-start align-middle';

function PositionsTable({ rows, selectedKey, onSelect }) {
  return (
    <div className="overflow-x-auto -mx-px">
      <table className="w-full min-w-[1180px] text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-border-primary">
            <th className={TH}>סימבול</th>
            <th className={TH}>חשבון</th>
            <th className={TH}>כמות</th>
            <th className={TH}>כניסה</th>
            <th className={TH}>מארק</th>
            <th className={TH}>שווי</th>
            <th className={TH}>רווח/הפסד פתוח</th>
            <th className={TH} title="רווח פתוח ÷ הסיכון ההתחלתי (הסטופ המקורי מהיומן כשיש)">R</th>
            <th className={TH}>סטופ</th>
            <th className={TH}>סיכון לסטופ</th>
            <th className={TH}>יעד</th>
            <th className={TH}>ליקווידציה</th>
            <th className={TH}>מרג׳ין</th>
            <th className={TH}>עמלות / מימון</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, p, m, journalName, inJournal, live }) => {
            const active = key === selectedKey;
            return (
              <tr
                key={key}
                onClick={() => onSelect(p)}
                className={`border-b border-border-primary/60 last:border-0 cursor-pointer transition-colors ${active ? 'bg-accent-primary/[0.07]' : 'hover:bg-bg-tertiary'}`}
                aria-selected={active}
              >
                <td className={`${TD} relative`}>
                  {active && <span className="absolute right-0 top-2 bottom-2 w-0.5 rounded-full bg-accent-primary" />}
                  <SymbolCell p={p} inJournal={inJournal} />
                </td>
                <td className={TD}><ExchangeTag exchange={p.source} journal={journalName} /></td>
                <td className={TD}><Num className="text-text-primary">{fmtQty(p.quantity)}</Num></td>
                <td className={TD}><Num className="text-text-primary">{fmtPx(p.entryPrice)}</Num></td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-1">
                    <Num className="text-text-primary">{fmtPx(m.mark)}</Num>
                    {live && <Radio className="w-3 h-3 text-accent-primary/80" aria-label="מחיר חי" />}
                  </span>
                </td>
                <td className={TD}><Num className="text-text-primary">{fmtUsd(m.value)}</Num></td>
                <td className={TD}><PnlCell m={m} /></td>
                <td className={TD}><Num className={`font-semibold ${pnlTone(m.rMultiple)}`}>{fmtR(m.rMultiple)}</Num></td>
                <td className={TD}><StopCell m={m} /></td>
                <td className={TD}><RiskCell m={m} /></td>
                <td className={TD}><Num className="text-text-secondary">{fmtPx(m.tp)}</Num></td>
                <td className={TD}>
                  <div className="leading-tight">
                    <Num className="text-text-secondary">{fmtPx(p.liquidationPrice)}</Num>
                    {m.liqDistancePct != null && <div><Num className="text-[10px] text-text-muted">{`${m.liqDistancePct.toFixed(1)}%`}</Num></div>}
                  </div>
                </td>
                <td className={TD}><Num className="text-text-secondary">{fmtUsd(m.margin)}</Num></td>
                <td className={TD}><FeesCell p={p} /></td>
              </tr>
            );
          })}
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

function PositionCard({ row, active, onSelect }) {
  const { p, m, journalName, inJournal } = row;
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className={`w-full text-start rounded-2xl border p-3 transition-colors cursor-pointer ${
        active ? 'border-accent-primary/40 bg-accent-primary/[0.06]' : 'border-border-primary bg-bg-tertiary hover:border-border-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CoinIcon pair={p.pair} className="w-5 h-5 shrink-0" />
            <span className="font-bold text-sm text-text-primary" dir="ltr">{p.pair}</span>
            <DirBadge direction={p.direction} />
            <Chip><Num>{`${+(Number(p.leverage) || 1).toFixed(2)}x`}</Num></Chip>
            {p.marginMode && <Chip>{MARGIN_LABEL[p.marginMode] || p.marginMode}</Chip>}
            {inJournal && <BookOpen className="w-3.5 h-3.5 text-accent-primary shrink-0" aria-label="מתועד ביומן" />}
          </div>
          <div className="text-[11px]"><ExchangeTag exchange={p.source} journal={journalName} /></div>
        </div>
        <PnlCell m={m} align="text-end shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-border-primary/70">
        <Stat label="כמות"><Num className="text-text-primary">{fmtQty(p.quantity)}</Num></Stat>
        <Stat label="כניסה"><Num className="text-text-primary">{fmtPx(p.entryPrice)}</Num></Stat>
        <Stat label="מארק"><Num className="text-text-primary">{fmtPx(m.mark)}</Num></Stat>
        <Stat label="שווי"><Num className="text-text-primary">{fmtUsd(m.value, { compact: true })}</Num></Stat>
        <Stat label="מרג׳ין"><Num className="text-text-secondary">{fmtUsd(m.margin, { compact: true })}</Num></Stat>
        <Stat label="ליקווידציה"><Num className="text-text-secondary">{fmtPx(p.liquidationPrice)}</Num></Stat>
        <Stat label="סטופ"><StopCell m={m} /></Stat>
        <Stat label="סיכון לסטופ"><RiskCell m={m} /></Stat>
        <Stat label="R בעסקה"><Num className={`font-semibold ${pnlTone(m.rMultiple)}`}>{fmtR(m.rMultiple)}</Num></Stat>
      </div>
      {(p.feesPaid != null || p.realizedPnl != null || (p.funding != null && p.funding !== 0)) && (
        <div className="mt-2 text-[10px] text-text-muted flex flex-wrap gap-x-3">
          {p.feesPaid != null && <span>עמלות <Num>{fmtUsd(p.feesPaid)}</Num></span>}
          {p.feesPaid == null && p.realizedPnl != null && <span>ממומש <Num>{fmtUsd(p.realizedPnl, { signed: true })}</Num></span>}
          {p.funding != null && p.funding !== 0 && <span>מימון <Num>{fmtUsd(p.funding, { signed: true })}</Num></span>}
        </div>
      )}
    </button>
  );
}

export default function TerminalPositions({ rows, selectedKey, onSelect, mobile }) {
  if (mobile) {
    return (
      <div className="space-y-2">
        {rows.map((r) => <PositionCard key={r.key} row={r} active={r.key === selectedKey} onSelect={onSelect} />)}
      </div>
    );
  }
  return <PositionsTable rows={rows} selectedKey={selectedKey} onSelect={onSelect} />;
}
