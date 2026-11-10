// Prop-firm business ledger — pure, deterministic, no I/O.
//
// Cash book for running prop accounts: challenge fees, resets, subscriptions,
// and money that actually arrived (payouts and withdrawals). It is not the
// trading journal. A payout is the cash the firm sent. It is never a copy of
// a journal's profit — adding those together would count the same result
// twice. `journalId` is only a pointer to which account the row belongs to.
// Currencies are never converted or mixed. A date is a calendar day in
// Asia/Jerusalem.

export const BUSINESS_TZ = 'Asia/Jerusalem';

export const BUSINESS_KINDS = Object.freeze(['income', 'expense']);

export const BUSINESS_CATEGORIES = Object.freeze([
  'challenge_fee',
  'reset',
  'subscription',
  'payout',
  'withdrawal',
  'other',
]);

export const BUSINESS_CURRENCIES = Object.freeze(['USD', 'ILS', 'USDT']);

/** Cash the trader received. Never a share of journal profit. */
export const CASH_ONLY_CATEGORIES = Object.freeze(['payout', 'withdrawal']);

export const BUSINESS_KIND_LABELS = Object.freeze({
  income: 'הכנסה',
  expense: 'הוצאה',
});

export const BUSINESS_CATEGORY_LABELS = Object.freeze({
  challenge_fee: 'דמי אתגר',
  reset: 'איפוס',
  subscription: 'מנוי',
  payout: 'תשלום',
  withdrawal: 'משיכה',
  other: 'אחר',
});

export const BUSINESS_NOTE_MAX = 160;
export const BUSINESS_JOURNAL_ID_MAX = 128;
const MAX_AMOUNT = 1e12;

export const BUSINESS_REPORT_DISCLAIMER =
  'תשלומים ומשיכות נרשמים כסכום שנכנס בפועל, בנפרד מרווח המסחר ביומן, כדי שאותו רווח לא ייספר פעמיים.';

const MONTH_LABELS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const CURRENCY_TITLES = {
  USD: 'דולר (USD)',
  ILS: 'שקל (ILS)',
  USDT: 'USDT',
};

const MESSAGES = {
  invalid: 'רשומה לא תקינה.',
  kind: 'סוג לא תקין. מותר רק הכנסה או הוצאה.',
  category: 'קטגוריה לא תקינה.',
  currency: 'מטבע לא תקין. מותר דולר, שקל או USDT.',
  amount: 'הסכום חייב להיות מספר חיובי.',
  date: 'תאריך לא תקין.',
  note: 'ההערה ארוכה מדי.',
  journal: 'מזהה יומן לא תקין.',
  trading_profit: 'אי אפשר לקשר רשומה לרווח מסחר. תשלום ומשיכה נרשמים כסכום שהתקבל בפועל.',
};

const TRADING_PROFIT_KEYS = [
  'pnl',
  'netPnl',
  'grossPnl',
  'realizedPnl',
  'tradingProfit',
  'tradingPnl',
  'profit',
  'pnlFromExchange',
];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const LRM = '\u200E';

const JERUSALEM_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function fail(code) {
  return { ok: false, code, message: MESSAGES[code] };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function linksTradingProfit(raw) {
  return TRADING_PROFIT_KEYS.some((key) => hasOwn(raw, key) && raw[key] != null && raw[key] !== '');
}

function realDay(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function asDate(value) {
  if (value && typeof value.toDate === 'function') {
    try {
      const next = value.toDate();
      if (!(next instanceof Date) || Number.isNaN(next.getTime())) return null;
      return next;
    } catch {
      return null;
    }
  }
  const d = typeof value === 'number' ? new Date(value) : value instanceof Date ? value : null;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Calendar day in Asia/Jerusalem (`YYYY-MM-DD`).
 * A date-only string is that civil day. An instant is converted. Invalid → ''.
 */
export function businessDayKey(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = DAY_RE.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return realDay(year, month, day) ? trimmed : '';
    }
    if (!/[T ]\d{2}:\d{2}/.test(trimmed)) return '';
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return JERUSALEM_DAY.format(parsed);
  }
  const instant = asDate(value);
  return instant ? JERUSALEM_DAY.format(instant) : '';
}

/** Nearest cent, half up. Non-finite input stays NaN. */
export function roundBusinessMoney(amount) {
  if (!Number.isFinite(amount)) return NaN;
  const sign = amount < 0 ? -1 : 1;
  const cents = Math.round((Math.abs(amount) + Number.EPSILON) * 100);
  return (sign * cents) / 100;
}

function parseAmount(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

/**
 * Validate one ledger row. Does not read a journal and does not keep profit
 * fields. A normalized row is safe to pass through again.
 * @returns {{ ok: true, entry: object } | { ok: false, code: string, message: string }}
 */
export function validateBusinessEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('invalid');
  if (linksTradingProfit(raw)) return fail('trading_profit');

  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  if (!BUSINESS_KINDS.includes(kind)) return fail('kind');

  const category = typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : '';
  if (!BUSINESS_CATEGORIES.includes(category)) return fail('category');

  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  if (!BUSINESS_CURRENCIES.includes(currency)) return fail('currency');

  const parsed = parseAmount(raw.amount);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_AMOUNT) return fail('amount');
  const amount = roundBusinessMoney(parsed);
  if (!(amount > 0)) return fail('amount');

  const date = businessDayKey(raw.date);
  if (!date) return fail('date');

  let note = '';
  if (raw.note != null && raw.note !== '') {
    if (typeof raw.note !== 'string') return fail('note');
    note = raw.note.trim();
    if (note.length > BUSINESS_NOTE_MAX) return fail('note');
  }

  let journalId = null;
  if (raw.journalId != null && String(raw.journalId).trim() !== '' && raw.journalId !== '') {
    if (typeof raw.journalId !== 'string') return fail('journal');
    journalId = raw.journalId.trim();
    if (!journalId) journalId = null;
    else if (journalId.length > BUSINESS_JOURNAL_ID_MAX || /[\r\n]/.test(journalId)) return fail('journal');
  }

  return {
    ok: true,
    entry: {
      kind,
      category,
      amount,
      currency,
      date,
      month: date.slice(0, 7),
      journalId,
      note,
      cashOnly: CASH_ONLY_CATEGORIES.includes(category),
    },
  };
}

function freshCurrency() {
  return { incomeCents: 0, expenseCents: 0, count: 0, categories: {} };
}

function centsOf(amount) {
  return Math.round((amount + Number.EPSILON) * 100);
}

function addCents(bucket, entry) {
  const cents = centsOf(entry.amount);
  const field = entry.kind === 'income' ? 'incomeCents' : 'expenseCents';
  bucket[field] += cents;
  bucket.count += 1;
  if (!bucket.categories[entry.category]) {
    bucket.categories[entry.category] = { incomeCents: 0, expenseCents: 0, count: 0 };
  }
  const cat = bucket.categories[entry.category];
  cat[field] += cents;
  cat.count += 1;
}

function finishCurrency(bucket) {
  const byCategory = {};
  BUSINESS_CATEGORIES.forEach((category) => {
    const cat = bucket.categories[category];
    if (!cat?.count) return;
    byCategory[category] = {
      income: cat.incomeCents / 100,
      expense: cat.expenseCents / 100,
      net: (cat.incomeCents - cat.expenseCents) / 100,
      count: cat.count,
      cashOnly: CASH_ONLY_CATEGORIES.includes(category),
    };
  });
  return {
    income: bucket.incomeCents / 100,
    expense: bucket.expenseCents / 100,
    net: (bucket.incomeCents - bucket.expenseCents) / 100,
    count: bucket.count,
    byCategory,
  };
}

function publishCurrencies(rawMap) {
  const currencies = {};
  BUSINESS_CURRENCIES.forEach((code) => {
    if (!rawMap[code]) return;
    currencies[code] = finishCurrency(rawMap[code]);
  });
  return currencies;
}

/**
 * Split rows into accepted and rejected, then total each currency on its own.
 * Invalid rows are reported and left out of the numbers. There is no
 * cross-currency sum and no rate.
 */
export function summarizeBusinessLedger(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const accepted = [];
  const rejected = [];
  const ordered = [];

  list.forEach((raw, index) => {
    const result = validateBusinessEntry(raw);
    if (!result.ok) {
      rejected.push({ index, code: result.code, message: result.message });
      return;
    }
    accepted.push(result.entry);
    ordered.push({ entry: result.entry, order: ordered.length });
  });

  const byMonth = new Map();
  const totalsRaw = {};
  ordered.forEach(({ entry }) => {
    if (!byMonth.has(entry.month)) byMonth.set(entry.month, { rows: [], currencies: {} });
    const month = byMonth.get(entry.month);
    month.rows.push({ entry, order: month.rows.length });
    if (!month.currencies[entry.currency]) month.currencies[entry.currency] = freshCurrency();
    addCents(month.currencies[entry.currency], entry);
    if (!totalsRaw[entry.currency]) totalsRaw[entry.currency] = freshCurrency();
    addCents(totalsRaw[entry.currency], entry);
  });

  const months = [...byMonth.keys()].sort().map((month) => {
    const bag = byMonth.get(month);
    const rows = [...bag.rows].sort((a, b) => (
      a.entry.date < b.entry.date ? -1 : a.entry.date > b.entry.date ? 1 : a.order - b.order
    ));
    return {
      month,
      entries: rows.map((row) => row.entry),
      currencies: publishCurrencies(bag.currencies),
    };
  });

  return {
    accepted,
    rejected,
    months,
    totals: { count: accepted.length, byCurrency: publishCurrencies(totalsRaw) },
  };
}

/** Net per currency for each month that has rows. Currencies stay separate. */
export function monthlyNetByCurrency(entries) {
  return summarizeBusinessLedger(entries).months.map((month) => ({
    month: month.month,
    currencies: Object.fromEntries(Object.entries(month.currencies).map(([code, bucket]) => [code, {
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.net,
      count: bucket.count,
    }])),
  }));
}

/** Category totals inside each month, still split by currency. */
export function categoryBreakdownByMonth(entries) {
  return summarizeBusinessLedger(entries).months.map((month) => ({
    month: month.month,
    currencies: Object.fromEntries(Object.entries(month.currencies).map(([code, bucket]) => [
      code,
      bucket.byCategory,
    ])),
  }));
}

/** All-time totals. `byCurrency` never folds USD, ILS, and USDT into one number. */
export function businessTotals(entries) {
  return summarizeBusinessLedger(entries).totals;
}

function isMonthKey(month) {
  return typeof month === 'string' && MONTH_RE.test(month);
}

function monthTitle(month) {
  return `${MONTH_LABELS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

function grouped(amount) {
  const cents = Math.round((Math.abs(amount) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const withCommas = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withCommas}.${frac}`;
}

function moneyToken(amount, currency, signed) {
  const body = grouped(amount);
  const unit = currency === 'USD' ? `$${body}` : currency === 'ILS' ? `₪${body}` : `${body} USDT`;
  let sign = '';
  if (amount < 0) sign = '-';
  else if (signed && amount > 0) sign = '+';
  return `${LRM}${sign}${unit}`;
}

function displayDay(day) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

function sectionLines(code, bucket, entries) {
  const lines = [
    CURRENCY_TITLES[code],
    `הכנסות: ${moneyToken(bucket.income, code, false)}`,
    `הוצאות: ${moneyToken(bucket.expense, code, false)}`,
    `נטו: ${moneyToken(bucket.net, code, true)}`,
  ];
  BUSINESS_CATEGORIES.forEach((category) => {
    const cat = bucket.byCategory[category];
    if (!cat) return;
    const suffix = CASH_ONLY_CATEGORIES.includes(category) ? ' · מזומן, לא רווח מסחר' : '';
    lines.push(`${BUSINESS_CATEGORY_LABELS[category]}: ${moneyToken(cat.net, code, true)}${suffix}`);
  });
  lines.push('תנועות');
  entries.forEach((entry) => {
    if (entry.currency !== code) return;
    const parts = [
      displayDay(entry.date),
      BUSINESS_KIND_LABELS[entry.kind],
      BUSINESS_CATEGORY_LABELS[entry.category],
      moneyToken(entry.amount, code, false),
    ];
    if (entry.note) parts.push(entry.note);
    lines.push(parts.join(' · '));
  });
  return lines;
}

/**
 * Plain Hebrew text for one month, ready to copy. `month` is `YYYY-MM`.
 * Payout and withdrawal lines are marked as cash, not trading profit.
 */
export function formatBusinessMonthReport(entries, month) {
  if (!isMonthKey(month)) return 'חודש לא תקין.';
  const found = summarizeBusinessLedger(entries).months.find((item) => item.month === month) || null;
  const lines = [
    `הכנסות והוצאות — ${monthTitle(month)}`,
    'ימים לפי שעון ירושלים. כל מטבע בנפרד, בלי המרה ובלי ערבוב.',
    '',
  ];
  if (!found) {
    lines.push('אין תנועות בחודש הזה.', '');
  } else {
    let first = true;
    BUSINESS_CURRENCIES.forEach((code) => {
      const bucket = found.currencies[code];
      if (!bucket) return;
      if (!first) lines.push('');
      first = false;
      lines.push(...sectionLines(code, bucket, found.entries));
    });
    lines.push('');
  }
  lines.push(`סה״כ תנועות בחודש: ${found ? found.entries.length : 0}`);
  lines.push('');
  lines.push(BUSINESS_REPORT_DISCLAIMER);
  return lines.join('\n');
}
