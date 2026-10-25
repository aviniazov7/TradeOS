import { useEffect, useMemo, useState } from 'react';
import { Trophy, Settings, AlertOctagon, CheckCircle2, CalendarDays, TrendingDown, ShieldAlert, Scale } from 'lucide-react';
import FitText from '../shared/FitText';
import { evaluatePropFirm } from '../../utils/propFirm';
import { formatCurrency, formatPercent, LRM } from '../../utils/formatters';
import { PROP_FIRM_DD_TYPE_LABELS } from '../../utils/constants';

// Unsigned money ("$4,250" / "$12.50").
const money = (v) => {
  const abs = Math.abs(Number(v) || 0);
  return `${LRM}$${abs.toLocaleString('en-US', { maximumFractionDigits: abs >= 1000 ? 0 : 2 })}`;
};
const sizeLabel = (s) => (s >= 1000 && s % 1000 === 0 ? `$${s / 1000}K` : money(s));
const dayLabel = (key) => (key ? key.split('-').reverse().slice(0, 2).join('/') : '');
const tone = (v) => (v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary');

const STATUS = {
  on_track: { label: 'במסלול', cls: 'bg-profit/12 text-profit border-profit/30', ring: 'border-border-primary' },
  warning: { label: 'אזהרה', cls: 'bg-breakeven/12 text-breakeven border-breakeven/30', ring: 'border-breakeven/35' },
  breached: { label: 'חריגה מהכללים', cls: 'bg-loss/12 text-loss border-loss/30', ring: 'border-loss/45' },
  passed: { label: 'האתגר הושלם', cls: 'bg-profit/15 text-profit border-profit/40', ring: 'border-profit/40' },
};
// 'pending' = a requirement not met yet (minimum days) — not a danger.
const STATE_TEXT = { ok: 'text-profit', warning: 'text-breakeven', breached: 'text-loss', pending: 'text-text-primary' };
const STATE_BAR = { ok: 'bg-profit', warning: 'bg-breakeven', breached: 'bg-loss', pending: 'bg-accent-primary' };
const STATE_TAG = { warning: 'קרוב לגבול', breached: 'חריגה' };

const BREACH_TEXT = {
  daily: 'החשבון חרג מכלל ההפסד היומי',
  drawdown: 'החשבון חרג מכלל ההפסד המקסימלי (דראודאון)',
};

// Day rollover: re-evaluate once a minute so "today" moves at midnight.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Bar({ pct, cls }) {
  const w = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden" dir="rtl">
      <div className={`h-full rounded-full transition-[width] duration-500 ${cls}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// One limit meter: what's left (big), how much of the limit is used (bar).
function Meter({ icon, label, state, caption, value, sub, pct, empty }) {
  return (
    <div className="min-w-0 rounded-xl border border-border-primary bg-bg-tertiary/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted min-w-0">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {!empty && STATE_TAG[state] && (
          <span className={`text-[10px] font-bold shrink-0 ${STATE_TEXT[state]}`}>{STATE_TAG[state]}</span>
        )}
      </div>
      {empty ? (
        <p className="mt-1.5 text-sm text-text-muted">אין כלל</p>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-1.5 min-w-0">
            {caption && <span className="text-[11px] text-text-muted shrink-0">{caption}</span>}
            <div className="min-w-0 flex-1">
              <FitText as="div" dir="ltr" className={`num-mono text-base font-bold ${STATE_TEXT[state]}`} style={{ textAlign: 'right' }}>
                {value}
              </FitText>
            </div>
          </div>
          <div className="mt-1.5"><Bar pct={pct} cls={STATE_BAR[state]} /></div>
          <p className="mt-1 text-[11px] text-text-muted truncate">{sub}</p>
        </>
      )}
    </div>
  );
}

/**
 * The prop-challenge strip on the journal's trades tab: firm + phase, the
 * road to the profit target, the three limits that can end the account
 * (daily loss, max drawdown) or hold it back (minimum days), the consistency
 * rule, and a loud banner when a rule has been broken.
 */
export default function PropFirmPanel({ propFirm, trades, onEdit }) {
  const now = useMinuteClock();
  const ev = useMemo(() => evaluatePropFirm(trades, propFirm, { now }), [trades, propFirm, now]);
  if (!ev) return null;

  const st = STATUS[ev.status] || STATUS.on_track;
  const pnlPct = ev.accountSize > 0 ? (ev.totalPnl / ev.accountSize) * 100 : 0;
  const { daily, drawdown, days, target, consistency } = ev;
  const firstBreach = ev.breaches[0];

  return (
    <section aria-label="מעקב אתגר פרופ" className={`mb-4 rounded-2xl border ${st.ring} bg-bg-secondary overflow-hidden`}>
      <div aria-hidden className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.55), rgba(250,204,21,0.45), transparent)' }} />

      {/* Header — firm, phase, size, status */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pt-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-accent-primary/10 border border-accent-primary/25">
            <Trophy className="w-[18px] h-[18px] text-accent-hover" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary truncate"><bdi>{ev.firmName}</bdi></p>
            <p className="text-[11px] text-text-muted truncate">
              {ev.phaseLabel && <><bdi className="text-text-secondary">{ev.phaseLabel}</bdi> · </>}
              <bdi className="num-mono">{sizeLabel(ev.accountSize)}</bdi>
              {ev.startDate && <span className="hidden sm:inline"> · מ־<bdi className="num-mono">{dayLabel(ev.startDate)}</bdi></span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg border text-[11px] font-bold ${st.cls}`}>
            {ev.status === 'passed' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {st.label}
          </span>
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label="הגדרות חשבון פרופ" title="הגדרות חשבון פרופ"
              className="w-7 h-7 grid place-items-center rounded-lg border border-border-primary text-text-muted hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer">
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Breach banner — the one thing that must not be missed */}
      {firstBreach && (
        <div role="alert" className="mx-3 sm:mx-4 mt-3 flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/12 px-3 py-2.5">
          <AlertOctagon className="w-4 h-4 text-loss shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-loss">{BREACH_TEXT[firstBreach.rule]}</p>
            <p className="text-[11px] text-loss/80">
              {firstBreach.live ? 'כולל הפוזיציות הפתוחות כרגע' : `ב־${dayLabel(firstBreach.day)}`}
              {ev.breaches.length > 1 && ` · וגם ${BREACH_TEXT[ev.breaches[1].rule].replace('החשבון חרג מ', '')}`}
              {' · '}בחשבון אמיתי זה בדרך כלל סוף האתגר.
            </p>
          </div>
        </div>
      )}

      {/* Balance + the road to the target */}
      <div className="px-3 sm:px-4 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">יתרה</p>
            <FitText as="div" dir="ltr" className="num-mono text-xl font-extrabold text-text-primary" style={{ textAlign: 'right' }}>
              {money(ev.balance)}
            </FitText>
          </div>
          <div className="text-left shrink-0">
            <p dir="ltr" className={`num-mono text-sm font-bold ${tone(ev.totalPnl)}`}>{formatCurrency(ev.totalPnl)}</p>
            <p dir="ltr" className={`num-mono text-[11px] ${tone(ev.totalPnl)}`}>{formatPercent(pnlPct)}</p>
          </div>
        </div>
        {target ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
              <span className="text-text-muted">
                יעד רווח <span className="num-mono text-text-secondary" dir="ltr">{money(target.amountUsd)}</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 ${target.reached ? 'text-profit font-semibold' : 'text-text-muted'}`}>
                {target.reached
                  ? <span>היעד הושג</span>
                  : <span>נותרו <bdi className="num-mono text-text-secondary">{money(target.remainingUsd)}</bdi></span>}
                <span aria-hidden>·</span>
                <bdi className="num-mono">{Math.round(target.progressPct)}%</bdi>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-tertiary overflow-hidden" dir="rtl">
              <div className={`h-full rounded-full transition-[width] duration-500 ${target.reached ? 'bg-profit' : 'bg-accent-primary'}`}
                style={{ width: `${target.progressPct}%` }} />
            </div>
            {target.reached && ev.pending.length > 0 && (
              <p className="mt-1 text-[11px] text-breakeven">
                {ev.pending.includes('days') && `חסרים עוד ${days.remaining} ימי מסחר`}
                {ev.pending.length > 1 && ' · '}
                {ev.pending.includes('consistency') && 'כלל העקביות עדיין לא מתקיים'}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-text-muted">חשבון ללא יעד רווח — שומרים על הכללים.</p>
        )}
      </div>

      {/* The three limits */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2 px-3 sm:px-4 pt-3">
        <Meter
          icon={<TrendingDown className="w-3.5 h-3.5 shrink-0" />}
          label="הפסד יומי"
          empty={!daily}
          state={daily?.state}
          pct={daily?.breached ? 100 : daily?.usedPct}
          // After a breach the meter shows the breaching loss, not today's room.
          caption={daily?.breached ? 'הפסד' : 'נותר'}
          value={daily && money(daily.breached ? daily.breachAmount : daily.remainingUsd)}
          sub={daily && (daily.breached
            ? `ב־${dayLabel(daily.breachDay)} · מגבלה ${money(daily.limitUsd)}`
            : `היום ${money(daily.usedUsd)} מתוך ${money(daily.limitUsd)}`)}
        />
        <Meter
          icon={<ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
          label={drawdown ? `דראודאון · ${PROP_FIRM_DD_TYPE_LABELS[drawdown.type]}` : 'דראודאון'}
          empty={!drawdown}
          state={drawdown?.state}
          pct={drawdown?.breached ? 100 : drawdown?.usedPct}
          caption="נותר"
          value={drawdown && money(drawdown.remainingUsd)}
          sub={drawdown && `רצפה ${money(drawdown.floor)} · מגבלה ${money(drawdown.limitUsd)}${drawdown.locked ? ' · ננעלה' : ''}`}
        />
        <Meter
          icon={<CalendarDays className="w-3.5 h-3.5 shrink-0" />}
          label="ימי מסחר"
          empty={!days.required}
          state={days.met ? 'ok' : 'pending'}
          pct={days.pct}
          value={`${days.count} / ${days.required}`}
          sub={days.met ? 'המינימום הושג' : days.remaining === 1 ? 'נותר יום אחד' : `נותרו ${days.remaining} ימים`}
        />
      </div>

      {/* Consistency + footnotes */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 sm:px-4 pt-2.5 pb-3">
        {consistency && (
          <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-semibold ${
            consistency.ok === false ? 'bg-breakeven/12 text-breakeven border-breakeven/30'
              : consistency.ok ? 'bg-profit/10 text-profit border-profit/25'
                : 'bg-bg-tertiary text-text-muted border-border-primary'
          }`}>
            <Scale className="w-3.5 h-3.5" />
            {consistency.ok == null
              ? `עקביות ≤${consistency.limitPct}% · אין רווח עדיין`
              : <>יום שיא <span className="num-mono" dir="ltr">{Math.round(consistency.sharePct)}%</span> מהרווח (מקס׳ {consistency.limitPct}%)</>}
          </span>
        )}
        {consistency?.ok === false && (
          <span className="text-[11px] text-text-muted">
            נדרש רווח כולל של <span className="num-mono" dir="ltr">{money(consistency.requiredTotalUsd)}</span>
          </span>
        )}
        <span className="text-[10px] text-text-muted ms-auto">
          {!ev.verified && 'ערכי ברירת מחדל — בדקו מול תנאי החברה · '}
          לפי עסקאות סגורות, ימים בשעון ישראל
        </span>
      </div>
    </section>
  );
}
