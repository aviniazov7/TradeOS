import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
import {
  Receipt, FileSpreadsheet, Printer, TriangleAlert, Info, RefreshCw, Check,
  TrendingUp, TrendingDown, Scale, Landmark, Coins, Hash, ChevronDown,
} from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import Card from '../shared/Card';
import StatTile from '../shared/StatTile';
import FitText from '../shared/FitText';
import SelectDropdown from '../shared/SelectDropdown';
import LoadingSpinner from '../shared/LoadingSpinner';
import { headerIconBtn, headerPrimaryBtn } from '../shared/headerStyles';
import TaxPrintView from './TaxPrintView';
import { useTrades } from '../../hooks/useTrades';
import { useJournalContext } from '../../contexts/JournalContext';
import { fetchUsdIlsRates } from '../../services/fxService';
import { isClosedTrade } from '../../utils/calculations';
import {
  buildTaxReport, taxCsvRows, fxRangeForYear, tradeCloseDay,
  ASSET_CLASS_LABELS, ASSET_CLASS_ORDER, MONTH_LABELS, TAX_RATE,
} from '../../utils/taxReport';
import { downloadCsv } from '../../utils/csv';
import { pageVariants, pageTransition } from '../../utils/animations';
import { formatIls, formatUsd, formatRate, formatDay, pnlTone, DIRECTION_LABELS } from './taxFormat';

const MotionDiv = m.div;
const NO_RATES = {};
const NO_DAYS = [];
const FX_LOADING = { status: 'loading', rates: NO_RATES, fallback: NO_DAYS, source: null, error: null };

const DISCLAIMER = 'הדוח הוא כלי עזר בלבד ואינו ייעוץ מס. יש לבדוק מול רואה חשבון.';
const TRADES_PREVIEW = 30;

const SOURCE_LABELS = {
  boi: 'שער יציג — בנק ישראל',
  yahoo: 'שער חלופי (Yahoo)',
  'boi+yahoo': 'בנק ישראל + שער חלופי',
};

// Journal picker: one chip per journal + "all". Empty selection is allowed
// (the report then says to pick one) so un-ticking the last chip isn't a trap.
function JournalChips({ journals, selected, onChange }) {
  const all = selected === null;
  const isOn = (id) => all || selected.includes(id);
  const toggle = (id) => {
    const base = all ? journals.map((j) => j.id) : selected;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(next.length === journals.length ? null : next);
  };
  const chip = (on) => `inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
    on ? 'border-accent-primary/40 bg-accent-primary/12 text-accent-hover' : 'border-border-primary bg-bg-tertiary text-text-muted hover:text-text-primary'
  }`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="בחירת יומנים">
      <button type="button" aria-pressed={all} onClick={() => onChange(all ? [] : null)} className={chip(all)}>
        {all && <Check className="w-3.5 h-3.5" />}כל היומנים
      </button>
      {journals.map((j) => (
        <button key={j.id} type="button" aria-pressed={!all && isOn(j.id)} onClick={() => toggle(j.id)} className={chip(!all && isOn(j.id))}>
          {!all && isOn(j.id) && <Check className="w-3.5 h-3.5" />}
          <span className="truncate max-w-[10rem]">{j.name}</span>
          <span className="text-[10px] opacity-70">{ASSET_CLASS_LABELS[j.assetClass || 'crypto']}</span>
        </button>
      ))}
    </div>
  );
}

function Notice({ tone = 'warn', icon = Info, children }) {
  const Icon = icon;
  const cls = tone === 'warn'
    ? 'border-breakeven/30 bg-breakeven/8 text-text-secondary'
    : tone === 'error'
      ? 'border-loss/30 bg-loss/8 text-text-secondary'
      : 'border-border-primary bg-bg-tertiary text-text-secondary';
  const iconCls = tone === 'warn' ? 'text-breakeven' : tone === 'error' ? 'text-loss' : 'text-accent-primary';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs sm:text-sm leading-relaxed ${cls}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconCls}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Signed ₪ in a table cell — dir=ltr so the sign stays left of the digits.
const IlsCell = ({ value, signed = true, className = '' }) => (
  <span dir="ltr" className={`inline-block num-mono ${signed ? pnlTone(value) : 'text-text-secondary'} ${className}`}>
    {formatIls(value, { signed })}
  </span>
);

const th = 'text-right pb-2 ps-3 font-medium whitespace-nowrap';
const td = 'py-2 ps-3 whitespace-nowrap';

function MonthlyTable({ months, totals }) {
  return (
    <Card className="p-4 md:p-5 min-w-0">
      <h2 className="text-sm font-semibold text-text-primary mb-3">פירוט חודשי (₪)</h2>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted border-b border-border-primary">
              <th className={th}>חודש</th>
              <th className={th}>נטו</th>
              <th className={th}>רווחים</th>
              <th className={th}>הפסדים</th>
              <th className={`${th} pe-1`}>עסקאות</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className={`border-b border-border-primary/50 ${m.count ? '' : 'opacity-45'}`}>
                <td className={`${td} text-text-primary font-medium`}>{MONTH_LABELS[m.month - 1]}</td>
                <td className={`${td} font-semibold`}><IlsCell value={m.net} /></td>
                <td className={td}><IlsCell value={m.gains} /></td>
                <td className={td}><IlsCell value={m.losses} /></td>
                <td className={`${td} pe-1 text-text-secondary num-mono`}>{m.count}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className={`${td} text-text-primary`}>סה״כ</td>
              <td className={td}><IlsCell value={totals.netIls} /></td>
              <td className={td}><IlsCell value={totals.gainsIls} /></td>
              <td className={td}><IlsCell value={totals.lossesIls} /></td>
              <td className={`${td} pe-1 text-text-primary num-mono`}>{totals.tradeCount}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AssetSplit({ byAsset, totals }) {
  const classes = ASSET_CLASS_ORDER.filter((c) => byAsset[c].count > 0);
  const scale = Math.max(1, ...classes.map((c) => Math.abs(byAsset[c].net)));
  return (
    <Card className="p-4 md:p-5 min-w-0">
      <h2 className="text-sm font-semibold text-text-primary mb-3">לפי סוג נכס</h2>
      {classes.length === 0 ? (
        <p className="text-sm text-text-muted">אין עסקאות סגורות בשנה זו.</p>
      ) : (
        <ul className="space-y-3.5">
          {classes.map((c) => {
            const a = byAsset[c];
            const share = totals.tradeCount ? Math.round((a.count / totals.tradeCount) * 100) : 0;
            return (
              <li key={c} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary">{ASSET_CLASS_LABELS[c]}</span>
                  <IlsCell value={a.net} className="text-sm font-bold" />
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-bg-tertiary overflow-hidden" aria-hidden>
                  <div
                    className={`h-full rounded-full ${a.net >= 0 ? 'bg-profit/70' : 'bg-loss/70'}`}
                    style={{ width: `${Math.max(3, (Math.abs(a.net) / scale) * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                  <span>{a.count} עסקאות · {share}%</span>
                  <span>רווחים <IlsCell value={a.gains} /></span>
                  <span>הפסדים <IlsCell value={a.losses} /></span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TradesTable({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, TRADES_PREVIEW);
  return (
    <Card className="p-4 md:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-text-primary">פירוט עסקאות</h2>
        <span className="text-xs text-text-muted">{rows.length} עסקאות</span>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-text-muted border-b border-border-primary">
              <th className={th}>תאריך סגירה</th>
              <th className={th}>נכס</th>
              <th className={th}>רווח/הפסד ₪</th>
              <th className={th}>רווח/הפסד $</th>
              <th className={th}>שער</th>
              <th className={th}>כיוון</th>
              <th className={`${th} pe-1`}>עמלות ₪</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-border-primary/50">
                <td className={`${td} text-text-secondary num-mono`}>{formatDay(r.day)}</td>
                <td className={`${td} text-text-primary font-medium`}>{r.symbol}</td>
                <td className={`${td} font-semibold`}>
                  {r.missingRate ? <span className="text-[11px] text-loss">חסר שער</span> : <IlsCell value={r.pnlIls} />}
                </td>
                <td className={td}>
                  {r.currency === 'USD'
                    ? <span dir="ltr" className={`inline-block num-mono ${pnlTone(r.pnl)}`}>{formatUsd(r.pnl)}</span>
                    : <span className="text-[11px] text-text-muted">בשקלים</span>}
                </td>
                <td className={`${td} num-mono text-text-secondary`}>
                  {r.currency === 'USD' ? (
                    <span title={r.rateDay && r.rateDay !== r.day ? `שער מיום ${formatDay(r.rateDay)}` : undefined}>
                      {formatRate(r.rate)}
                      {r.fallback && <span className="text-breakeven" title="שער חלופי (Yahoo)">*</span>}
                    </span>
                  ) : '—'}
                </td>
                <td className={td}>
                  {r.direction ? (
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${r.direction === 'long' ? 'bg-long/10 text-long' : 'bg-short/10 text-short'}`}>
                      {DIRECTION_LABELS[r.direction]}
                    </span>
                  ) : <span className="text-text-muted">—</span>}
                </td>
                <td className={`${td} pe-1`}><IlsCell value={r.feesIls} signed={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > TRADES_PREVIEW && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
          {showAll ? 'הצג פחות' : `הצג את כל ${rows.length} העסקאות`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
      )}
    </Card>
  );
}

export default function TaxReportPage() {
  const { trades, loading: tradesLoading } = useTrades();
  const { journals, loading: journalsLoading } = useJournalContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState(null); // null = all journals
  const [retry, setRetry] = useState(0);
  // Rates are tagged with the request they answer; until the answer for the
  // current year arrives the page is "loading" (no setState inside the effect).
  const [fxState, setFxState] = useState({ key: null });

  // Years with closed trades (by Israel-time close day) + the current year.
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years = new Set([currentYear]);
    for (const t of trades) {
      if (!isClosedTrade(t)) continue;
      const y = Number(tradeCloseDay(t).slice(0, 4));
      if (y >= 2000 && y <= currentYear) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [trades, currentYear]);

  const yearParam = Number(searchParams.get('year'));
  const year = yearOptions.includes(yearParam) ? yearParam : currentYear;
  const setYear = (y) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (Number(y) === currentYear) next.delete('year'); else next.set('year', String(y));
    return next;
  }, { replace: true });

  const fxKey = `${year}:${retry}`;
  useEffect(() => {
    const ctrl = new AbortController();
    const { from, to } = fxRangeForYear(year);
    fetchUsdIlsRates(from, to, { signal: ctrl.signal })
      .then((d) => setFxState({ key: fxKey, status: 'ok', rates: d.rates, fallback: d.fallback, source: d.source, error: null }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setFxState({ key: fxKey, status: 'error', rates: NO_RATES, fallback: NO_DAYS, source: null, error: err?.message || 'שגיאה בטעינת שערים' });
      });
    return () => ctrl.abort();
  }, [year, fxKey]);
  const fx = fxState.key === fxKey ? fxState : FX_LOADING;

  // Drop ids of journals that no longer exist from the selection.
  const journalIds = useMemo(() => {
    if (selected === null) return null;
    const live = new Set(journals.map((j) => j.id));
    return selected.filter((id) => live.has(id));
  }, [selected, journals]);

  const report = useMemo(() => buildTaxReport({
    trades, journals, year, journalIds, rates: fx.rates, fallbackDays: fx.fallback,
  }), [trades, journals, year, journalIds, fx.rates, fx.fallback]);

  const t = report.totals;
  const loading = tradesLoading || journalsLoading;
  const ratesReady = fx.status === 'ok';
  const noneSelected = Array.isArray(journalIds) && journalIds.length === 0;
  const hasRows = report.rows.length > 0;
  const usdRows = report.rows.some((r) => r.currency === 'USD');

  const journalLabel = journalIds === null
    ? 'כל היומנים'
    : journals.filter((j) => journalIds.includes(j.id)).map((j) => j.name).join(', ') || '—';
  const sourceLabel = SOURCE_LABELS[fx.source] || 'בנק ישראל';

  const exportCsv = () => {
    const { headers, rows } = taxCsvRows(report);
    downloadCsv(`tax-report-${year}.csv`, headers, rows);
  };

  const canExport = hasRows && (ratesReady || !usdRows);

  if (loading) return <LoadingSpinner />;

  return (
    <MotionDiv variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <PageHeader
        icon={Receipt}
        title="דוח מס"
        titleAside={(
          <SelectDropdown
            compact
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={yearOptions.map((y) => ({ value: String(y), label: `שנת ${y}` }))}
            className="w-28"
          />
        )}
        subtitle="רווחי הון ממומשים בשקלים — סיכום שנתי לרואה החשבון"
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={!canExport} className={headerIconBtn}
              title="ייצוא CSV (Excel)" aria-label="ייצוא CSV">
              <FileSpreadsheet className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => window.print()} disabled={!canExport} className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
              <Printer className="w-4 h-4" />
              הדפסה / PDF
            </button>
          </>
        )}
      />

      <div className="space-y-4 md:space-y-5">
        <Notice tone="warn" icon={TriangleAlert}>
          <b className="text-text-primary">{DISCLAIMER}</b>
          {' '}החישוב מניח מס רווחי הון של {TAX_RATE * 100}% על הרווח הנטו, ואינו כולל התאמות אינפלציה, מס יסף, דיבידנדים, הוצאות מוכרות או הפסדים משנים קודמות.
        </Notice>

        <Card className="p-4 md:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">יומנים בדוח</h2>
            <span className="text-[11px] text-text-muted inline-flex items-center gap-1.5">
              {fx.status === 'loading' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {fx.status === 'loading' ? 'טוען שערי דולר...' : ratesReady ? `שערי המרה: ${sourceLabel}` : 'שערי המרה לא זמינים'}
            </span>
          </div>
          {journals.length > 0
            ? <JournalChips journals={journals} selected={journalIds} onChange={setSelected} />
            : <p className="text-sm text-text-muted">אין יומנים עדיין.</p>}
        </Card>

        {fx.status === 'error' && usdRows && (
          <Notice tone="error" icon={TriangleAlert}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>לא הצלחנו לטעון את שערי הדולר ({fx.error}). עסקאות בדולר לא הומרו.</span>
              <button type="button" onClick={() => setRetry((n) => n + 1)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-primary bg-bg-tertiary text-xs font-medium text-text-primary hover:border-border-hover cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />נסה שוב
              </button>
            </div>
          </Notice>
        )}

        {noneSelected ? (
          <Card className="p-8 text-center text-sm text-text-muted">בחר לפחות יומן אחד כדי להפיק דוח.</Card>
        ) : !hasRows ? (
          <Card className="p-8 md:p-10 flex flex-col items-center text-center gap-2">
            <Receipt className="w-10 h-10 text-text-muted mb-1" />
            <h2 className="text-base font-semibold text-text-primary">אין עסקאות סגורות בשנת {year}</h2>
            <p className="text-sm text-text-muted max-w-sm">
              הדוח כולל רק עסקאות שנסגרו במהלך השנה. בחר שנה אחרת או יומנים נוספים.
            </p>
            {report.partial.count > 0 && (
              <p className="text-xs text-text-muted mt-1">{report.partial.count} עסקאות פתוחות עם סגירה חלקית אינן נכללות עד שייסגרו.</p>
            )}
          </Card>
        ) : fx.status === 'loading' && usdRows ? (
          <Card className="p-8 flex flex-col items-center gap-3 text-sm text-text-muted">
            <RefreshCw className="w-5 h-5 animate-spin text-accent-primary" />
            טוען שערים יציגים מבנק ישראל...
          </Card>
        ) : (
          <>
            {/* Headline: net + estimated tax, large */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <Card className="p-4 md:p-5 min-w-0">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>רווח/הפסד הון נטו</span><Scale className="w-4 h-4" />
                </div>
                <FitText as="div" dir="ltr" style={{ textAlign: 'right' }}
                  className={`num-mono text-2xl md:text-3xl font-extrabold mt-1.5 ${ratesReady || !usdRows ? pnlTone(t.netIls) : 'text-text-muted'}`}>
                  {formatIls(t.netIls)}
                </FitText>
                <div className="text-xs text-text-muted mt-1 flex flex-wrap gap-x-2">
                  <span>שווה ערך</span>
                  <span dir="ltr" className="num-mono">{formatUsd(t.netUsd)}</span>
                </div>
              </Card>
              <Card className="p-4 md:p-5 min-w-0 relative overflow-hidden">
                <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(90% 120% at 0% 0%, rgba(37,99,235,0.12) 0%, transparent 60%)' }} />
                <div className="relative flex items-center justify-between text-xs text-text-muted">
                  <span>מס משוער ({TAX_RATE * 100}%)</span><Landmark className="w-4 h-4" />
                </div>
                <FitText as="div" dir="ltr" style={{ textAlign: 'right' }} className="relative num-mono text-2xl md:text-3xl font-extrabold mt-1.5 text-text-primary">
                  {formatIls(t.estimatedTaxIls, { signed: false })}
                </FitText>
                <div className="relative text-xs text-text-muted mt-1">
                  {t.carryForwardLossIls > 0 ? (
                    <>אין מס — הפסד להעברה לשנים הבאות: <span dir="ltr" className="num-mono text-text-secondary">{formatIls(t.carryForwardLossIls, { signed: false })}</span></>
                  ) : 'על הרווח הנטו החיובי, אחרי קיזוז הפסדים'}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <StatTile icon={TrendingUp} label="סה״כ רווחים" value={formatIls(t.gainsIls)} tone="text-profit" />
              <StatTile icon={TrendingDown} label="סה״כ הפסדים" value={formatIls(t.lossesIls)} tone="text-loss" />
              <StatTile icon={Scale} label="הפסדים שקוזזו" value={formatIls(t.lossesOffsetIls, { signed: false })} sub="מול רווחי השנה" />
              <StatTile icon={Coins} label="עמלות" value={formatIls(t.feesIls, { signed: false })}
                sub={<span dir="ltr" className="num-mono">{formatUsd(t.feesUsd, { signed: false })}</span>} />
              <StatTile icon={Hash} label="עסקאות סגורות" value={String(t.tradeCount)} className="col-span-2 lg:col-span-4"
                sub={journalLabel} />
            </div>

            {(report.missingRate.length > 0 || report.fallbackDays.length > 0 || report.partial.count > 0) && (
              <div className="space-y-2">
                {report.missingRate.length > 0 && ratesReady && (
                  <Notice tone="error" icon={TriangleAlert}>
                    {report.missingRate.length} עסקאות ללא שער המרה ולכן לא נכללו בסיכום:{' '}
                    {report.missingRate.slice(0, 6).map((r) => `${r.symbol} (${formatDay(r.day)})`).join(', ')}
                    {report.missingRate.length > 6 ? '…' : ''}
                  </Notice>
                )}
                {report.fallbackDays.length > 0 && (
                  <Notice tone="warn">
                    בימים הבאים שער בנק ישראל לא היה זמין ונעשה שימוש בשער חלופי (Yahoo, מסומן ב-*):{' '}
                    <span className="num-mono">{report.fallbackDays.map(formatDay).join(', ')}</span>
                  </Notice>
                )}
                {report.partial.count > 0 && (
                  <Notice tone="info">
                    {report.partial.count} עסקאות פתוחות עם סגירה חלקית לא נכללו — לסגירות חלקיות אין תאריך, ולכן הן ייכללו בשנה שבה העסקה תיסגר.
                  </Notice>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              <div className="lg:col-span-2 min-w-0"><MonthlyTable months={report.months} totals={t} /></div>
              <AssetSplit byAsset={report.byAsset} totals={t} />
            </div>

            <TradesTable rows={report.rows} />

            <p className="text-[11px] text-text-muted leading-relaxed px-1">
              המרה לפי השער היציג של בנק ישראל ביום הסגירה (שעון ישראל), ואם אין שער לאותו יום — יום העסקים הקודם הקרוב.
              עסקאות בבורסת ת״א (.TA) כבר בשקלים ואינן מומרות. הסכומים הם רווח/הפסד נטו אחרי עמלות כפי שנרשמו ביומן.
            </p>
          </>
        )}
      </div>

      {hasRows && !noneSelected && (
        <TaxPrintView report={report} journalLabel={journalLabel} sourceLabel={sourceLabel} />
      )}
    </MotionDiv>
  );
}
