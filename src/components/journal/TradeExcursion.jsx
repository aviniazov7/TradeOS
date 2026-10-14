import { useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, RefreshCw, Save } from 'lucide-react';
import { fetchCandles } from '../../services/exchangeService';
import { useTrades } from '../../hooks/useTrades';
import { canComputeExcursion, computeExcursion, excursionFields, tradeExitPrice } from '../../utils/excursion';
import { formatCurrency, formatPrice } from '../../utils/formatters';
import { isClosedTrade } from '../../utils/calculations';
import { stockSymbol } from '../../utils/stocks';

const toMs = (d) => {
  const date = d?.toDate ? d.toDate() : d ? new Date(d) : null;
  const ms = date?.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

// Which candle feed + symbol a trade's price history lives on.
function candleTarget(trade) {
  if (trade.assetClass === 'futures_cme') {
    return { asset: 'futures', symbol: String(trade.contract?.symbol || trade.pair || '').toUpperCase() };
  }
  if (trade.assetClass === 'stocks') return { asset: 'stocks', symbol: stockSymbol(trade.pair) };
  return { asset: 'crypto', symbol: String(trade.pair || '').toUpperCase() };
}

const fmtR = (v) => (v == null ? null : `${v}R`);
const fmtUsd = (v) => (v == null ? null : formatCurrency(Math.abs(v)).replace('+', ''));
const fmtDuration = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} דק׳`;
  if (m < 48 * 60) return `${Math.round(m / 60)} שע׳`;
  return `${Math.round(m / 1440)} ימים`;
};

// Price path between entry and exit with entry / exit / stop levels.
function Sparkline({ trade, candles, result }) {
  const entryMs = toMs(trade.entryDate);
  const exitMs = toMs(trade.exitDate);
  const pts = candles.filter((c) => c.t + (result.stepMs || 0) > entryMs && c.t < exitMs);
  if (pts.length < 2) return null;
  const entry = Number(trade.entryPrice);
  const exit = tradeExitPrice(trade);
  const stop = result.stop;
  const vals = [entry, exit, ...pts.flatMap((c) => [c.h, c.l])];
  if (stop) vals.push(stop);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 320;
  const H = 96;
  const pad = 6;
  const span = hi - lo || 1;
  const y = (p) => pad + (1 - (p - lo) / span) * (H - 2 * pad);
  const x = (i) => (i / (pts.length - 1)) * (W - 2 * pad) + pad;
  const line = pts.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join('');
  const band = [
    ...pts.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.h).toFixed(1)}`),
    ...pts.map((c, i) => `L${x(pts.length - 1 - i).toFixed(1)},${y(pts[pts.length - 1 - i].l).toFixed(1)}`),
    'Z',
  ].join('');
  const level = (price, cls, label) => (
    <g className={cls} key={label}>
      <line x1={pad} x2={W - pad} y1={y(price)} y2={y(price)} stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - pad} y={y(price) - 3} textAnchor="end" fontSize="12" fill="currentColor">{label}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" dir="ltr" role="img"
      aria-label="מסלול המחיר בין הכניסה ליציאה">
      <path d={band} className="text-accent-primary" fill="currentColor" fillOpacity="0.12" />
      <path d={line} className="text-accent-primary" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {level(entry, 'text-text-secondary', `כניסה ${formatPrice(entry)}`)}
      {level(exit, 'text-breakeven', `יציאה ${formatPrice(exit)}`)}
      {stop ? level(stop, 'text-loss', `סטופ ${formatPrice(stop)}`) : null}
    </svg>
  );
}

function Stat({ label, usd, r, tone }) {
  return (
    <div className="rounded-lg bg-bg-secondary/60 border border-border-primary/60 px-3 py-2 text-center">
      <div className="text-[11px] text-text-muted mb-0.5">{label}</div>
      <div className={`text-base font-bold ${tone}`} dir="ltr">{usd ?? '—'}</div>
      {r && <div className="text-[11px] text-text-secondary" dir="ltr">{r}</div>}
    </div>
  );
}

// The save button lives in its own component so the trades listener is only
// mounted once there is a result to persist.
function SaveButton({ trade, result, onSaved }) {
  const { updateTrade } = useTrades();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      // updateTrade recomputes P&L from what it is given, so it needs the whole trade.
      const full = { ...trade };
      delete full.id;
      await updateTrade(trade.id, { ...full, ...excursionFields(result) });
      toast.success('MAE/MFE נשמרו בעסקה');
      onSaved();
    } catch {
      toast.error('השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };
  return (
    <button type="button" onClick={save} disabled={saving}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-accent-primary/15 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/25 transition-colors cursor-pointer disabled:opacity-50">
      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      שמור בעסקה
    </button>
  );
}

/**
 * MAE / MFE card for a closed trade, computed on demand from price candles.
 * Rendered inside TradeDetailModal (keyed by trade id).
 */
export default function TradeExcursion({ trade }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // { result, candles }
  const [saved, setSaved] = useState(false);

  if (!trade || !isClosedTrade(trade) || !canComputeExcursion(trade)) return null;

  const hasSaved = trade.excursionAt != null && (trade.mae != null || trade.maeR != null);

  const run = async () => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const target = candleTarget(trade);
      const res = await fetchCandles({ ...target, from: toMs(trade.entryDate), to: toMs(trade.exitDate) });
      const stepMs = (res.interval || 0) * 60000;
      const result = computeExcursion(trade, res.candles, { stepMs });
      if (!result) throw new Error('לא נמצאו נרות לטווח העסקה');
      setData({ result, candles: res.candles, source: res.source });
    } catch (e) {
      setData(null);
      setError(e?.message || 'החישוב נכשל');
    } finally {
      setLoading(false);
    }
  };

  const r = data?.result;
  const eff = r?.efficiency;

  return (
    <div className="mt-3 rounded-xl border border-border-primary/60 bg-bg-tertiary/60 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
          <Activity className="w-3.5 h-3.5" />MAE / MFE
          <span className="font-normal" title="MAE: הירידה הגדולה ביותר נגד העסקה. MFE: הרווח הצף הגדול ביותר.">· תנועה נגד / בעד</span>
        </span>
        <button type="button" onClick={run} disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-bg-secondary border border-border-primary text-text-primary hover:border-accent-primary/50 transition-colors cursor-pointer disabled:opacity-50">
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {hasSaved || r ? 'חשב מחדש' : 'חשב MAE/MFE'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-loss" role="alert">{error}</p>}

      {!r && hasSaved && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="MAE (נגד)" usd={fmtUsd(trade.mae)} r={fmtR(trade.maeR)} tone="text-loss" />
          <Stat label="MFE (בעד)" usd={fmtUsd(trade.mfe)} r={fmtR(trade.mfeR)} tone="text-profit" />
        </div>
      )}

      {r && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="MAE (נגד)" usd={fmtUsd(r.maeUsd)} r={fmtR(r.maeR) || `${formatPrice(r.maePrice)} (${r.maePct}%)`} tone="text-loss" />
            <Stat label="MFE (בעד)" usd={fmtUsd(r.mfeUsd)} r={fmtR(r.mfeR) || `${formatPrice(r.mfePrice)} (${r.mfePct}%)`} tone="text-profit" />
            <Stat label="ניצול ה-MFE"
              usd={eff == null ? '—' : `${Math.round(eff * 100)}%`}
              r={r.capturedUsd == null ? null : `נתפס ${formatCurrency(r.capturedUsd)}`}
              tone={eff == null ? 'text-text-primary' : eff >= 0.6 ? 'text-profit' : eff >= 0 ? 'text-breakeven' : 'text-loss'} />
          </div>
          <div className="mt-2"><Sparkline trade={trade} candles={data.candles} result={r} /></div>
          {r.stopTouched && (
            <p className="mt-1 text-[11px] text-loss">המחיר הגיע לסטופ המקורי במהלך העסקה.</p>
          )}
          {r.coarse && (
            <p className="mt-1 text-[11px] text-breakeven">
              הנרות ארוכים ({fmtDuration(r.stepMs)}) יחסית למשך העסקה — המספרים משוערים ועשויים לכלול תנועה מחוץ לעסקה.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-text-muted">{data.source === 'bybit' ? 'Bybit' : 'Yahoo'} · {r.candles} נרות · ברוטו, לפני עמלות</span>
            {saved ? <span className="text-[11px] text-profit">נשמר ✓</span> : <SaveButton trade={trade} result={r} onSaved={() => setSaved(true)} />}
          </div>
        </>
      )}
    </div>
  );
}
