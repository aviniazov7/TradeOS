import { FREE_LIMITS } from '../../utils/constants';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_LABELS,
  BUSINESS_CURRENCIES,
  businessDayKey,
  categoryBreakdownByMonth,
  monthlyNetByCurrency,
} from '../../utils/businessLedger';
import { BUSINESS_DEMO_JOURNAL_ID, BUSINESS_DEMO_JOURNAL_NAME, shiftMonthKey } from '../../utils/businessDemo';

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const LRM = '\u200E';

export function currentBusinessMonth(now = new Date()) {
  const day = businessDayKey(now);
  return day ? day.slice(0, 7) : '';
}

export function businessMonthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) return '';
  const name = MONTHS[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : '';
}

export function displayBusinessDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Signed or plain money. Currencies keep their own symbol and are never added. */
export function formatBusinessAmount(amount, currency, { signed = false } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const body = `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
  const unit = currency === 'USD' ? `$${body}` : currency === 'ILS' ? `₪${body}` : `${body} USDT`;
  const sign = negative ? '-' : signed && value > 0 ? '+' : '';
  return `${LRM}${sign}${unit}`;
}

/** Free plan keeps the list and the monthly net, capped at FREE_LIMITS.businessEntries. */
export function businessEntryLimit(count, isPremium) {
  const used = Number.isFinite(count) && count > 0 ? count : 0;
  const cap = isPremium ? null : FREE_LIMITS.businessEntries;
  return { cap, count: used, canAdd: cap == null || used < cap };
}

export function businessMonthChoices(entries, now = new Date()) {
  const found = new Set();
  (entries || []).forEach((row) => {
    const month = row?.month || (typeof row?.date === 'string' ? row.date.slice(0, 7) : '');
    if (/^\d{4}-\d{2}$/.test(month)) found.add(month);
  });
  const current = currentBusinessMonth(now);
  if (current) found.add(current);
  return [...found].sort();
}

export function shiftBusinessMonth(month, delta) {
  return shiftMonthKey(month, delta);
}

export function journalChoices(journals, { demo = false } = {}) {
  const options = [{ value: '', label: 'בלי קישור ליומן' }];
  (journals || []).forEach((journal) => {
    if (!journal || journal.archived || !journal.id) return;
    options.push({ value: journal.id, label: journal.name || 'יומן' });
  });
  if (demo && !options.some((option) => option.value === BUSINESS_DEMO_JOURNAL_ID)) {
    options.push({ value: BUSINESS_DEMO_JOURNAL_ID, label: BUSINESS_DEMO_JOURNAL_NAME });
  }
  return options;
}

export function journalLabel(journals, journalId, { demo = false } = {}) {
  if (!journalId) return '';
  const found = (journals || []).find((journal) => journal?.id === journalId);
  if (found?.name) return found.name;
  if (demo && journalId === BUSINESS_DEMO_JOURNAL_ID) return BUSINESS_DEMO_JOURNAL_NAME;
  return 'יומן לא זמין';
}

/** Category rows for one currency. A second currency never appears in the series. */
export function categoryChartSeries(entries, month, currency) {
  if (!BUSINESS_CURRENCIES.includes(currency)) return [];
  const monthRow = categoryBreakdownByMonth(entries).find((item) => item.month === month);
  const categories = monthRow?.currencies?.[currency];
  if (!categories) return [];
  return BUSINESS_CATEGORIES.filter((key) => categories[key]).map((key) => ({
    key,
    name: BUSINESS_CATEGORY_LABELS[key],
    currency,
    net: categories[key].net,
    magnitude: categories[key].income + categories[key].expense,
    cashOnly: categories[key].cashOnly === true,
  }));
}

export function monthCurrencyNets(entries, month) {
  const row = monthlyNetByCurrency(entries).find((item) => item.month === month);
  if (!row) return [];
  return BUSINESS_CURRENCIES.filter((code) => row.currencies[code]).map((code) => ({
    currency: code,
    ...row.currencies[code],
  }));
}
