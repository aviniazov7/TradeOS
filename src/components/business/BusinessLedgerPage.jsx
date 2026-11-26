import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { ChevronLeft, ChevronRight, Copy, Crown, Landmark, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../shared/PageHeader';
import Card from '../shared/Card';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import FitText from '../shared/FitText';
import DateField from '../shared/DateField';
import SelectDropdown from '../shared/SelectDropdown';
import BusinessCharts from './BusinessCharts';
import { headerPrimaryBtn } from '../shared/headerStyles';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { pageTransition, pageVariants } from '../../utils/animations';
import { FREE_LIMITS } from '../../utils/constants';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_LABELS,
  BUSINESS_CURRENCIES,
  BUSINESS_KIND_LABELS,
  BUSINESS_KINDS,
  BUSINESS_NOTE_MAX,
  BUSINESS_REPORT_DISCLAIMER,
  businessDayKey,
  formatBusinessMonthReport,
} from '../../utils/businessLedger';
import { buildBusinessDemoEntries } from '../../utils/businessDemo';
import {
  BUSINESS_LEDGER_FIRESTORE_ENABLED,
  BUSINESS_LEDGER_STORAGE_MODE,
  createBusinessLedgerStore,
} from '../../services/businessLedgerStore';
import {
  businessEntryLimit,
  businessMonthChoices,
  businessMonthLabel,
  categoryChartSeries,
  currentBusinessMonth,
  displayBusinessDay,
  formatBusinessAmount,
  journalChoices,
  journalLabel,
  monthCurrencyNets,
  shiftBusinessMonth,
} from './businessView';

const MotionDiv = m.div;

const PAGE_TITLE = 'הכנסות והוצאות';
const EMPTY_EXPLANATION = 'כאן עוקבים אחרי ההכנסות וההוצאות של אתגרי פרופ: דמי אתגר, איפוסים, מנויים, תשלומים ומשיכות. זה פנקס המזומן של העסק, בנפרד מרווח המסחר ביומן.';
const SAVING_OFF = 'השמירה לחשבון עדיין לא מופעלת.';

const fieldClass = 'w-full min-h-11 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
const quietBtn = 'h-10 px-3 inline-flex items-center justify-center rounded-lg border border-border-primary bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer';
const chipBtn = 'h-8 px-2 inline-flex items-center justify-center gap-1 rounded-lg border border-border-primary bg-bg-tertiary text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer disabled:opacity-50';
const chipOn = `${chipBtn} border-accent-primary/40 bg-accent-primary/10 text-accent-hover`;

// Desktop columns match the header and the rows. Below 640px the row folds
// into a label line and an actions line so iPhone Safari does not scroll sideways.
const LEDGER_ROW_CSS = `
.biz-head { display: none; }
.biz-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "meta amount" "details actions";
  column-gap: 0.5rem;
  row-gap: 0.125rem;
  align-items: center;
}
.biz-meta { grid-area: meta; display: flex; align-items: center; gap: 0.375rem; min-width: 0; }
.biz-date, .biz-kind { flex: none; }
.biz-category { min-width: 0; }
.biz-details { grid-area: details; min-width: 0; }
.biz-amount { grid-area: amount; text-align: right; }
.biz-actions { grid-area: actions; display: flex; align-items: center; justify-content: flex-start; gap: 0.25rem; }
@media (min-width: 640px) {
  .biz-head, .biz-row {
    display: grid;
    grid-template-columns: 4.75rem 4.6rem 7.5rem minmax(0, 1fr) 8.75rem 10.75rem;
    column-gap: 0.5rem;
    align-items: center;
  }
  .biz-head { grid-template-areas: none; }
  .biz-row { grid-template-areas: none; row-gap: 0; }
  .biz-meta { display: contents; }
  .biz-date, .biz-kind, .biz-category, .biz-details, .biz-amount, .biz-actions { grid-area: auto; }
  .biz-kind { justify-self: start; }
  .biz-amount { justify-self: stretch; }
}
`;

function moneyTone(value) {
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-text-secondary';
}

function displayEntryAmount(entry) {
  const magnitude = Number(entry.amount);
  const signed = entry.kind === 'expense' ? -magnitude : magnitude;
  return formatBusinessAmount(signed, entry.currency, { signed: true });
}

function MoneyKpi({ label, value, tone, emphasize = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium leading-none text-text-muted">{label}</div>
      <FitText
        dir="ltr"
        min={10}
        className={`num-mono mt-1 font-bold leading-none ${emphasize ? 'text-sm sm:text-[15px]' : 'text-[13px]'} ${tone}`}
        style={{ textAlign: 'right' }}
      >
        {value}
      </FitText>
    </div>
  );
}

const CURRENCY_NAME = { USD: 'דולר', ILS: 'שקל', USDT: 'USDT' };

function blankDraft(now) {
  return {
    kind: 'expense',
    category: 'challenge_fee',
    amount: '',
    currency: 'USD',
    date: businessDayKey(now) || '',
    journalId: '',
    note: '',
  };
}

function draftFromEntry(entry) {
  return {
    kind: entry.kind,
    category: entry.category,
    amount: String(entry.amount),
    currency: entry.currency,
    date: entry.date,
    journalId: entry.journalId || '',
    note: entry.note || '',
  };
}

function openStore({ demo, journals, now }) {
  if (demo) return createBusinessLedgerStore('memory', buildBusinessDemoEntries({ journals, now }));
  return createBusinessLedgerStore(BUSINESS_LEDGER_STORAGE_MODE);
}

export default function BusinessLedgerPage({
  store: storeProp = null,
  demo: demoProp = null,
  journals: journalsProp = null,
  isPremium: premiumProp = null,
  now = null,
  onEnterDemo = null,
} = {}) {
  const auth = useAuth();
  const liveDemo = useDemoMode();
  const journalCtx = useJournalContext();
  const premium = premiumProp == null ? !!auth.isPremium : premiumProp;
  // Page demo is local. The shell demo flag turns itself off as soon as the
  // account has a real trade, which made "צפה בדוגמה" a no-op for Premium.
  const [pageDemo, setPageDemo] = useState(false);
  const demo = demoProp == null ? (pageDemo || liveDemo.active) : demoProp;
  const journals = journalsProp == null ? (journalCtx.journals || []) : journalsProp;
  const clock = now || new Date();
  const journalKey = journals.map((journal) => journal?.id || '').join('|');
  const storeKey = storeProp ? 'injected' : demo ? `demo:${currentBusinessMonth(clock)}:${journalKey}` : 'off';

  const [bag, setBag] = useState(() => ({
    key: storeKey,
    store: storeProp || openStore({ demo, journals, now: clock }),
    entries: [],
    ready: false,
  }));
  if (bag.key !== storeKey) {
    setBag({
      key: storeKey,
      store: storeProp || openStore({ demo, journals, now: clock }),
      entries: [],
      ready: false,
    });
  }

  useEffect(() => {
    const prev = document.title;
    document.title = `${PAGE_TITLE} · TradeOS`;
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    let live = true;
    bag.store.list().then((rows) => {
      if (!live) return;
      setBag((current) => (
        current.store === bag.store
          ? { ...current, entries: Array.isArray(rows) ? rows : [], ready: true }
          : current
      ));
    });
    return () => { live = false; };
  }, [bag.store]);

  const entries = bag.entries;
  const store = bag.store;
  const limit = businessEntryLimit(entries.length, premium);
  const months = businessMonthChoices(entries, clock);
  const [month, setMonth] = useState(() => currentBusinessMonth(clock));
  const selected = months.includes(month) ? month : (months[months.length - 1] || month);
  const nets = monthCurrencyNets(entries, selected);
  const [chartCurrency, setChartCurrency] = useState('USD');
  const present = nets.map((row) => row.currency);
  const activeCurrency = present.includes(chartCurrency) ? chartCurrency : (present[0] || 'USD');
  const series = categoryChartSeries(entries, selected, activeCurrency);
  const report = formatBusinessMonthReport(entries, selected);
  const visible = entries
    .filter((entry) => (entry.month || entry.date?.slice(0, 7)) === selected)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const [formOpen, setFormOpen] = useState(false);
  const enterDemo = () => {
    setFormOpen(false);
    if (onEnterDemo) onEnterDemo();
    if (demoProp == null) setPageDemo(true);
  };
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(() => blankDraft(clock));
  const [formError, setFormError] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const openNew = () => {
    if (!limit.canAdd) return;
    setEditing(null);
    setDraft(blankDraft(clock));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    setEditing(entry);
    setDraft(draftFromEntry(entry));
    setFormError('');
    setFormOpen(true);
  };

  const refresh = async () => {
    const rows = await store.list();
    setBag((current) => (current.store === store ? { ...current, entries: rows, ready: true } : current));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editing && !limit.canAdd) {
      setFormError(`במסלול החינמי אפשר עד ${FREE_LIMITS.businessEntries} רשומות. שדרג ל-Premium לרשומות בלי הגבלה.`);
      return;
    }
    const result = await store.save({
      ...draft,
      journalId: draft.journalId || null,
      ...(editing ? { id: editing.id } : {}),
      ...(demo || editing?.demo ? { demo: true } : {}),
    });
    if (!result.ok) {
      setFormError(result.message || 'הרשומה לא נשמרה.');
      return;
    }
    await refresh();
    setFormOpen(false);
    toast.success(editing ? 'הרשומה עודכנה' : 'הרשומה נוספה');
  };

  const remove = async (id) => {
    const result = await store.remove(id);
    if (!result.ok) {
      toast.error(result.message || 'הרשומה לא נמחקה.');
      return;
    }
    setConfirmId(null);
    await refresh();
    toast.success('הרשומה נמחקה');
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast.success('הדוח הועתק');
    } catch {
      toast.error('לא הצלחנו להעתיק');
    }
  };

  const choices = journalChoices(journals, { demo });
  const storageOff = store.enabled === false && entries.length === 0;
  const savingOff = !BUSINESS_LEDGER_FIRESTORE_ENABLED && (demo || store.enabled === false);

  return (
    <MotionDiv
      data-testid="business-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      <PageHeader
        icon={Landmark}
        title={PAGE_TITLE}
        subtitle="הכנסות והוצאות של אתגרי פרופ. כל מטבע בנפרד, בלי קשר לרווח המסחר."
        meta={!premium ? (
          <p className="text-xs text-text-muted">
            <span className="num-mono">{entries.length}</span>
            {` מתוך ${FREE_LIMITS.businessEntries} רשומות במסלול החינמי. הגרף והדוח ב-Premium.`}
          </p>
        ) : null}
        actions={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!limit.canAdd && (
              <Link to="/premium" className="h-11 px-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-bold text-accent-hover">
                <Crown className="w-4 h-4" /> שדרג ל-Premium
              </Link>
            )}
            <button type="button" onClick={openNew} disabled={!limit.canAdd} data-testid="business-add" className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
              <Plus className="w-4 h-4" /> רשומה חדשה
            </button>
          </div>
        )}
      />

      {savingOff && (
        <p data-testid="business-storage-note" role="status" className="mb-3 rounded-xl border border-border-primary bg-bg-secondary px-3 py-2 text-[13px] text-text-secondary leading-snug">
          {SAVING_OFF}
        </p>
      )}

      {demo && (
        <p data-testid="business-demo-flag" role="status" className="mb-3 rounded-xl border border-breakeven/30 bg-breakeven/10 px-3 py-2 text-[13px] text-text-primary leading-snug">
          מצב דמו. אלה רשומות לדוגמה על המסך בלבד — הן לא נשמרות בחשבון.
        </p>
      )}

      {!bag.ready ? (
        <p className="text-sm text-text-muted">טוען…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="אין רשומות עדיין"
          description={storageOff
            ? `${EMPTY_EXPLANATION} ${SAVING_OFF} אפשר לראות דוגמה מסומנת על המסך.`
            : EMPTY_EXPLANATION}
          actionLabel={storageOff ? 'צפה בדוגמה' : 'רשומה חדשה'}
          onAction={storageOff ? enterDemo : openNew}
        />
      ) : (
        <div className="space-y-3">
          <section aria-label="סיכום חודשי" className="overflow-hidden rounded-2xl border border-border-primary bg-bg-secondary">
            <div aria-hidden className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), rgba(139,92,246,0.65), transparent)' }} />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button type="button" className={chipBtn} onClick={() => setMonth(shiftBusinessMonth(selected, -1))} aria-label="חודש קודם">
                <ChevronRight className="w-3.5 h-3.5" /> הקודם
              </button>
              <div className="min-w-0 text-center">
                <h2 className="truncate text-sm font-bold leading-tight text-text-primary">{businessMonthLabel(selected)}</h2>
                <p className="text-[10px] leading-tight text-text-muted">כל מטבע בנפרד, בלי המרה</p>
              </div>
              <button type="button" className={chipBtn} onClick={() => setMonth(shiftBusinessMonth(selected, 1))} aria-label="חודש הבא">
                הבא <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {nets.length === 0 ? (
              <p className="px-3 pb-3 text-[13px] text-text-muted">אין תנועות בחודש הזה.</p>
            ) : (
              <div className={nets.length >= 3 ? 'grid grid-cols-1 gap-2 px-3 pb-3 lg:grid-cols-3' : nets.length === 2 ? 'grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-2 px-3 pb-3'}>
                {nets.map((row) => (
                  <div
                    key={row.currency}
                    data-testid="business-net"
                    data-currency={row.currency}
                    data-net={String(row.net)}
                    className="min-w-0 rounded-xl border border-border-primary bg-bg-tertiary/45 px-2.5 py-2"
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-text-secondary">{CURRENCY_NAME[row.currency]}</span>
                      {CURRENCY_NAME[row.currency] !== row.currency && (
                        <span dir="ltr" className="num-mono text-[10px] font-medium text-text-muted">{row.currency}</span>
                      )}
                    </div>
                    <div dir="rtl" className="grid grid-cols-3 gap-1.5">
                      <MoneyKpi label="הכנסות" value={formatBusinessAmount(row.income, row.currency)} tone={row.income > 0 ? 'text-profit' : 'text-text-secondary'} />
                      <div className="min-w-0 border-s border-border-primary ps-1.5">
                        <MoneyKpi label="הוצאות" value={formatBusinessAmount(row.expense, row.currency)} tone={row.expense > 0 ? 'text-loss' : 'text-text-secondary'} />
                      </div>
                      <div className="min-w-0 border-s border-border-primary ps-1.5">
                        <MoneyKpi label="נטו" value={formatBusinessAmount(row.net, row.currency, { signed: true })} tone={moneyTone(row.net)} emphasize />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-label="רשומות החודש" className="overflow-hidden rounded-2xl border border-border-primary bg-bg-secondary">
            <style>{LEDGER_ROW_CSS}</style>
            <div className="flex items-center justify-between gap-2 border-b border-border-primary px-3 py-2">
              <h2 className="text-[13px] font-semibold text-text-primary">רשומות</h2>
              <span className="num-mono text-[11px] text-text-muted">{visible.length}</span>
            </div>
            {visible.length === 0 ? (
              <p className="px-3 py-2.5 text-[13px] text-text-muted">אין תנועות בחודש הזה.</p>
            ) : (
              <>
                <div className="biz-head border-b border-border-primary px-3 py-1 text-[10px] font-medium text-text-muted">
                  <span>תאריך</span>
                  <span>סוג</span>
                  <span>קטגוריה</span>
                  <span>פרטים</span>
                  <span dir="ltr" className="text-right">סכום</span>
                  <span>פעולות</span>
                </div>
                {visible.map((entry) => {
                  const income = entry.kind === 'income';
                  const linked = entry.journalId ? journalLabel(journals, entry.journalId, { demo }) : '';
                  const details = [linked, entry.note].filter(Boolean).join(' · ');
                  return (
                    <div key={entry.id} data-testid={`business-entry-${entry.id}`} className="biz-row border-b border-border-primary/80 px-3 py-1.5 last:border-b-0">
                      <div className="biz-meta">
                        <span dir="ltr" className="biz-date num-mono text-[11px] text-text-muted">{displayBusinessDay(entry.date)}</span>
                        <span className={`biz-kind inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-bold ${income ? 'border-profit/25 bg-profit/10 text-profit' : 'border-loss/30 bg-loss/10 text-loss'}`}>
                          {BUSINESS_KIND_LABELS[entry.kind]}
                        </span>
                        <span className="biz-category truncate text-[13px] font-semibold text-text-primary">
                          {BUSINESS_CATEGORY_LABELS[entry.category]}
                          {entry.demo && <span className="ms-1 text-[10px] font-bold text-breakeven">דוגמה</span>}
                        </span>
                      </div>
                      <p className={`biz-details truncate text-[11px] text-text-muted ${details ? '' : 'hidden sm:block'}`}>{details}</p>
                      <span dir="ltr" className={`biz-amount num-mono text-[13px] font-bold ${income ? 'text-profit' : 'text-loss'}`}>
                        {displayEntryAmount(entry)}
                      </span>
                      <div className="biz-actions">
                        {confirmId === entry.id ? (
                          <>
                            <button type="button" onClick={() => remove(entry.id)} className={`${chipBtn} border-loss/40 text-loss`}>אישור מחיקה</button>
                            <button type="button" onClick={() => setConfirmId(null)} className={chipBtn}>ביטול</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEdit(entry)} className={chipBtn}>עריכה</button>
                            <button type="button" onClick={() => setConfirmId(entry.id)} className={chipBtn}>מחיקה</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>

          {(premium || demo) ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-text-muted">הגרף של מטבע אחד. אין המרה ואין חיבור בין מטבעות.</p>
                {present.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="מטבע לגרף">
                    {present.map((code) => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={code === activeCurrency}
                        onClick={() => setChartCurrency(code)}
                        className={code === activeCurrency ? chipOn : chipBtn}
                      >
                        {CURRENCY_NAME[code]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {series.length > 0 ? <BusinessCharts series={series} currency={activeCurrency} /> : (
                <p className="text-[13px] text-text-muted">אין תנועות לגרף בחודש הזה.</p>
              )}
              <Card className="p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-semibold text-text-primary">דוח חודשי להעתקה</h2>
                  <button type="button" onClick={copyReport} className={chipBtn}>
                    <Copy className="w-3.5 h-3.5" /> העתקת הדוח
                  </button>
                </div>
                <pre data-testid="business-report" className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-[12px] leading-snug text-text-primary">{report}</pre>
              </Card>
            </div>
          ) : (
            <Card data-testid="business-premium-lock" className="p-3">
              <div className="flex items-start gap-2.5">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-accent-hover" />
                <div className="min-w-0">
                  <h2 className="text-[13px] font-bold text-text-primary">גרף ודוח חודשי</h2>
                  <p className="mt-1 text-[13px] leading-snug text-text-secondary">
                    {`במסלול החינמי רואים עד ${FREE_LIMITS.businessEntries} רשומות ואת הנטו החודשי. הגרף לפי קטגוריה, הדוח להעתקה ורשומות בלי הגבלה נפתחים ב-Premium.`}
                  </p>
                  <Link to="/premium" className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-muted px-3 text-[13px] font-bold text-white hover:bg-accent-primary">
                    שדרג ל-Premium
                  </Link>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'עריכת רשומה' : 'רשומה חדשה'}
        footer={(
          <div className="flex items-center gap-2">
            <button type="submit" form="business-entry-form" className={headerPrimaryBtn}>שמירה</button>
            <button type="button" onClick={() => setFormOpen(false)} className={quietBtn}>ביטול</button>
          </div>
        )}
      >
        <form id="business-entry-form" onSubmit={save} className="space-y-3">
          <div>
            <span className={labelClass}>סוג</span>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.kind === kind}
                  onClick={() => setField('kind', kind)}
                  className={draft.kind === kind ? `${quietBtn} border-accent-primary/40 text-accent-hover` : quietBtn}
                >
                  {BUSINESS_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
          <SelectDropdown
            label="קטגוריה"
            value={draft.category}
            onChange={(value) => setField('category', value)}
            options={BUSINESS_CATEGORIES.map((category) => ({ value: category, label: BUSINESS_CATEGORY_LABELS[category] }))}
          />
          <label className="block" htmlFor="biz-amount">
            <span className={labelClass}>סכום</span>
            <input id="biz-amount" inputMode="decimal" dir="ltr" className={`${fieldClass} text-left`} value={draft.amount} onChange={(event) => setField('amount', event.target.value)} />
          </label>
          <div>
            <span className={labelClass}>מטבע</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="מטבע">
              {BUSINESS_CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={draft.currency === code}
                  onClick={() => setField('currency', code)}
                  className={draft.currency === code ? `${quietBtn} border-accent-primary/40 text-accent-hover` : quietBtn}
                >
                  {CURRENCY_NAME[code]}
                </button>
              ))}
            </div>
          </div>
          <DateField id="biz-date" size="field" label="תאריך" value={draft.date} onChange={(value) => setField('date', value)} />
          <SelectDropdown
            label="קישור ליומן"
            value={draft.journalId}
            onChange={(value) => setField('journalId', value)}
            options={choices}
          />
          <p className="text-xs text-text-muted leading-relaxed">לפי שם היומן. זה מצביע בלבד, בלי רווח המסחר.</p>
          <label className="block" htmlFor="biz-note">
            <span className={labelClass}>הערה</span>
            <input id="biz-note" maxLength={BUSINESS_NOTE_MAX} className={fieldClass} value={draft.note} onChange={(event) => setField('note', event.target.value)} />
          </label>
          {formError && <p role="alert" className="text-sm text-loss">{formError}</p>}
          {!store.enabled && (
            <button type="button" onClick={enterDemo} className="text-sm font-bold text-accent-hover">צפה בדוגמה</button>
          )}
          <p className="text-[11px] text-text-muted leading-relaxed">{BUSINESS_REPORT_DISCLAIMER}</p>
        </form>
      </Modal>
    </MotionDiv>
  );
}
