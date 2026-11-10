import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { ChevronLeft, ChevronRight, Copy, Crown, Landmark, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../shared/PageHeader';
import Card from '../shared/Card';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import StatCard from '../dashboard/StatCard';
import DateField from '../shared/DateField';
import SelectDropdown from '../shared/SelectDropdown';
import BusinessCharts from './BusinessCharts';
import { headerPrimaryBtn } from '../shared/headerStyles';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { pageTransition, pageVariants, staggerContainer } from '../../utils/animations';
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

const EMPTY_EXPLANATION = 'כאן עוקבים אחרי ההכנסות וההוצאות של אתגרי פרופ: דמי אתגר, איפוסים, מנויים, תשלומים ומשיכות. זה פנקס המזומן של העסק, בנפרד מרווח המסחר ביומן.';
const SAVING_OFF = 'השמירה לחשבון עדיין לא מופעלת.';

const fieldClass = 'w-full min-h-11 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
const quietBtn = 'h-10 px-3 inline-flex items-center justify-center rounded-lg border border-border-primary bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer';

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
        title="ניהול עסק"
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
        <p data-testid="business-storage-note" role="status" className="mb-4 rounded-xl border border-border-primary bg-bg-secondary px-3.5 py-3 text-sm text-text-secondary leading-relaxed">
          {SAVING_OFF}
        </p>
      )}

      {demo && (
        <p data-testid="business-demo-flag" role="status" className="mb-4 rounded-xl border border-breakeven/30 bg-breakeven/10 px-3.5 py-3 text-sm text-text-primary leading-relaxed">
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
        <div className="space-y-4 md:space-y-5">
          <Card className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className={quietBtn} onClick={() => setMonth(shiftBusinessMonth(selected, -1))} aria-label="חודש קודם">
                <ChevronRight className="w-4 h-4" /> הקודם
              </button>
              <h2 className="text-sm md:text-base font-bold text-text-primary text-center">{businessMonthLabel(selected)}</h2>
              <button type="button" className={quietBtn} onClick={() => setMonth(shiftBusinessMonth(selected, 1))} aria-label="חודש הבא">
                הבא <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted text-center">נטו חודשי. המטבעות לא מחוברים זה לזה.</p>
          </Card>

          {nets.length === 0 ? (
            <p className="text-sm text-text-muted">אין תנועות בחודש הזה.</p>
          ) : (
            <MotionDiv className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" variants={staggerContainer} initial="initial" animate="animate">
              {nets.map((row) => (
                <div key={row.currency} data-testid="business-net" data-currency={row.currency} data-net={String(row.net)}>
                  <StatCard
                    label={`נטו ${CURRENCY_NAME[row.currency]}`}
                    value={formatBusinessAmount(row.net, row.currency, { signed: true })}
                    subtitle={`הכנסות ${formatBusinessAmount(row.income, row.currency)} · הוצאות ${formatBusinessAmount(row.expense, row.currency)}`}
                    color={row.net >= 0 ? 'text-profit' : 'text-loss'}
                    gradient={row.net >= 0 ? 'profit' : 'loss'}
                    icon={row.net >= 0 ? TrendingUp : TrendingDown}
                  />
                </div>
              ))}
            </MotionDiv>
          )}

          {(premium || demo) ? (
            <div className="space-y-3">
              {present.length > 1 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="מטבע לגרף">
                  {present.map((code) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={code === activeCurrency}
                      onClick={() => setChartCurrency(code)}
                      className={code === activeCurrency ? `${quietBtn} border-accent-primary/40 text-accent-hover` : quietBtn}
                    >
                      {CURRENCY_NAME[code]}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">הגרף של מטבע אחד. אין המרה ואין חיבור בין מטבעות.</p>
              {series.length > 0 ? <BusinessCharts series={series} currency={activeCurrency} /> : (
                <p className="text-sm text-text-muted">אין תנועות לגרף בחודש הזה.</p>
              )}
              <Card className="p-4 md:p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-text-primary">דוח חודשי להעתקה</h2>
                  <button type="button" onClick={copyReport} className={quietBtn}>
                    <Copy className="w-3.5 h-3.5" /> העתקת הדוח
                  </button>
                </div>
                <pre data-testid="business-report" className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-sans">{report}</pre>
              </Card>
            </div>
          ) : (
            <Card data-testid="business-premium-lock" className="p-4 md:p-5">
              <div className="flex items-start gap-3">
                <Crown className="w-5 h-5 text-accent-hover shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-text-primary">גרף ודוח חודשי</h2>
                  <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                    {`במסלול החינמי רואים עד ${FREE_LIMITS.businessEntries} רשומות ואת הנטו החודשי. הגרף לפי קטגוריה, הדוח להעתקה ורשומות בלי הגבלה נפתחים ב-Premium.`}
                  </p>
                  <Link to="/premium" className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl bg-accent-muted px-4 text-sm font-bold text-white hover:bg-accent-primary">
                    שדרג ל-Premium
                  </Link>
                </div>
              </div>
            </Card>
          )}

          <section aria-label="רשומות החודש" className="space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">רשומות</h2>
            {visible.length === 0 ? (
              <p className="text-sm text-text-muted">אין תנועות בחודש הזה.</p>
            ) : visible.map((entry) => (
              <Card key={entry.id} data-testid={`business-entry-${entry.id}`} className="p-3 md:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="num-mono text-text-muted" dir="ltr">{displayBusinessDay(entry.date)}</span>
                      <span className="text-text-secondary">{BUSINESS_KIND_LABELS[entry.kind]}</span>
                      <span className="font-semibold text-text-primary">{BUSINESS_CATEGORY_LABELS[entry.category]}</span>
                      {entry.demo && <span className="text-[10px] font-bold text-breakeven">דוגמה</span>}
                    </div>
                    <p className={`mt-1 text-base font-bold num-mono ${entry.kind === 'income' ? 'text-profit' : 'text-loss'}`} dir="ltr">
                      {formatBusinessAmount(entry.amount, entry.currency)}
                    </p>
                    {(entry.journalId || entry.note) && (
                      <p className="mt-1 text-xs text-text-muted leading-relaxed">
                        {entry.journalId ? journalLabel(journals, entry.journalId, { demo }) : ''}
                        {entry.journalId && entry.note ? ' · ' : ''}
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {confirmId === entry.id ? (
                      <>
                        <button type="button" onClick={() => remove(entry.id)} className={`${quietBtn} border-loss/40 text-loss`}>אישור מחיקה</button>
                        <button type="button" onClick={() => setConfirmId(null)} className={quietBtn}>ביטול</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => openEdit(entry)} className={quietBtn}>עריכה</button>
                        <button type="button" onClick={() => setConfirmId(entry.id)} className={quietBtn}>מחיקה</button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </section>
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
