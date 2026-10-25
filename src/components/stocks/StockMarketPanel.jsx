import { useMemo, useState, useEffect } from 'react';
import { Clock, Briefcase } from 'lucide-react';
import StockLogo from './StockLogo';
import FitText from '../shared/FitText';
import { isClosedTrade } from '../../utils/calculations';
import { formatCurrency, LRM } from '../../utils/formatters';
import { stockSymbol, usMarketSession, SESSION_LABELS } from '../../utils/stocks';

const TONE_CLS = {
  profit: 'bg-profit/12 text-profit border-profit/30',
  breakeven: 'bg-breakeven/12 text-breakeven border-breakeven/30',
  muted: 'bg-bg-tertiary text-text-secondary border-border-primary',
};

const CUR = { USD: '$', ILS: '₪', EUR: '€', GBP: '£', CAD: 'C$' };
const pct = (v) => `${LRM}${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const tone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary');

// New York clock, refreshed each minute, for the session chip.
function useNyClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// The stocks journal's own strip: is the US market open, and the open
// holdings — logo, shares, average price, live price, today's move and the
// open P&L on each. Crypto journals never show it.
export default function StockMarketPanel({ trades, quotes, hidden = false }) {
  const now = useNyClock();
  const session = usMarketSession(now);
  const sess = SESSION_LABELS[session];
  const nyTime = new Intl.DateTimeFormat('he-IL', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(now);

  // One row per ticker: open positions in the same stock are merged
  // (share-weighted average entry), longs and shorts netted by direction sign.
  const holdings = useMemo(() => {
    const map = {};
    trades.filter((t) => !isClosedTrade(t) && !(t.orderType === 'limit' && !t.limitTriggered)).forEach((t) => {
      const sym = stockSymbol(t.pair);
      const shares = Number(t.quantity) || 0;
      const entry = Number(t.entryPrice) || 0;
      if (!sym || !(shares > 0) || !(entry > 0)) return;
      const remaining = t.status === 'partial' && Array.isArray(t.exits)
        ? shares * Math.max(0, 1 - t.exits.reduce((s, e) => s + (Number(e.percent) || 0), 0) / 100)
        : shares;
      const sign = t.direction === 'short' ? -1 : 1;
      const row = map[sym] || (map[sym] = { sym, shares: 0, cost: 0, sign });
      row.shares += remaining * sign;
      row.cost += remaining * entry * sign;
    });
    return Object.values(map).filter((r) => r.shares !== 0).map((r) => {
      const q = quotes[r.sym];
      const avg = r.cost / r.shares;
      const price = q?.price;
      const pnl = price ? (price - avg) * r.shares : null;
      return { ...r, avg, price, cur: CUR[q?.currency] || '$', change: q?.change24h ?? null, name: q?.name, pnl, value: price ? Math.abs(price * r.shares) : null };
    }).sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [trades, quotes]);

  const totalPnl = holdings.reduce((s, h) => s + (h.pnl || 0), 0);
  const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);
  const m = (v) => (hidden ? '••••' : v);

  return (
    <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-bg-secondary overflow-hidden">
      <div aria-hidden className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.55), rgba(0,123,167,0.55), transparent)' }} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-emerald-500/12 border border-emerald-400/25">
            <Briefcase className="w-[18px] h-[18px] text-emerald-300" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">החזקות פתוחות</p>
            <p className="text-xs text-text-muted">
              {holdings.length ? `${holdings.length} מניות · שווי ${m(formatCurrency(totalValue).replace('+', ''))}` : 'אין כרגע פוזיציות פתוחות'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {holdings.length > 0 && (
            <span dir="ltr" className={`num-mono text-sm font-bold ${tone(totalPnl)}`}>{m(formatCurrency(totalPnl))}</span>
          )}
          <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-semibold ${TONE_CLS[sess.tone]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${session === 'REGULAR' ? 'bg-profit animate-pulse' : session === 'CLOSED' ? 'bg-text-muted' : 'bg-breakeven'}`} />
            {sess.label}
            <span className="inline-flex items-center gap-1 text-text-muted font-normal"><Clock className="w-3 h-3" /> ניו יורק {nyTime}</span>
          </span>
        </div>
      </div>

      {holdings.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto px-4 pb-4 snap-x">
          {holdings.map((h) => (
            <div key={h.sym} className="snap-start shrink-0 w-[13.5rem] rounded-xl border border-border-primary bg-bg-tertiary p-3">
              <div className="flex items-center gap-2.5">
                <StockLogo symbol={h.sym} className="w-9 h-9" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-text-primary" dir="ltr">{h.sym}</span>
                    {h.shares < 0 && <span className="text-[9px] font-bold px-1 rounded bg-loss/15 text-loss">SHORT</span>}
                  </div>
                  <p className="text-[11px] text-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>{h.name || '—'}</p>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <FitText as="div" dir="ltr" className="num-mono text-base font-bold text-text-primary" style={{ textAlign: 'right' }}>
                    {h.price ? `${h.cur}${h.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
                  </FitText>
                  {h.change != null && (
                    <div className="text-[11px] mt-0.5 text-right">
                      <span className="text-text-muted">היום </span>
                      <span dir="ltr" className={`num-mono font-semibold ${tone(h.change)}`}>{pct(h.change)}</span>
                    </div>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <div className="text-[10px] text-text-muted">רווח פתוח</div>
                  <div dir="ltr" className={`num-mono text-sm font-bold ${h.pnl == null ? 'text-text-muted' : tone(h.pnl)}`}>{h.pnl == null ? '—' : m(formatCurrency(h.pnl))}</div>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-border-primary flex justify-between text-[11px] text-text-muted" dir="ltr">
                <span>{m(`${+Math.abs(h.shares).toFixed(4)} sh`)}</span>
                <span>avg {h.cur}{h.avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
