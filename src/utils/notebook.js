// Trader notebook (מחברת) — pure, deterministic, no I/O.
//
// Free-form notes for a trading day, a week, an idea, or a lesson. This is
// not the note on a trade, not the structured morning/evening mental journal,
// and not the unused spec shape users/{uid}/notes (type/mood/market summary).
// Stage 1 has no Firestore and no UI. A later stage stores owner-only docs,
// the same privacy idea as morningJournals / eveningJournals.
//
// Body and title are plain text or a small markdown subset. HTML in the
// source is stored as characters and escaped on render. There is no rich-text
// editor in the app (markdown today is the AI chat sanitizer); this module
// does not import it, so a note never picks up chat sentiment colors.

export const NOTEBOOK_TZ = 'Asia/Jerusalem';

export const NOTEBOOK_LIMITS = Object.freeze({
  id: 128,
  title: 120,
  body: 20000,
  tag: 40,
  tags: 12,
  journalName: 80,
});

const MONTH_LABELS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const MESSAGES = {
  invalid: 'רשומה לא תקינה.',
  id: 'מזהה לא תקין.',
  title: 'כותרת חסרה או ארוכה מדי.',
  body: 'הטקסט ארוך מדי.',
  tags: 'תגית לא תקינה.',
  date: 'תאריך לא תקין.',
  journal: 'שם היומן לא תקין.',
  timestamps: 'זמן יצירה או עדכון לא תקין.',
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const JERUSALEM_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: NOTEBOOK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function fail(code) {
  return { ok: false, code, message: MESSAGES[code] };
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

function realDay(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * Calendar day in Asia/Jerusalem (`YYYY-MM-DD`).
 * A date-only string is that civil day. An instant is converted. Invalid → ''.
 */
export function notebookDayKey(value) {
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

function fold(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('en');
}

function isKeptControl(code) {
  return code === 9 || code === 10 || code === 13;
}

function stripControls(value) {
  let out = '';
  for (const ch of String(value)) {
    const code = ch.charCodeAt(0);
    if (code === 127 || (code < 32 && !isKeptControl(code))) continue;
    out += ch;
  }
  return out;
}

function plainLine(value) {
  return stripControls(value).replace(/\s+/g, ' ').trim();
}

function instantIso(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/[T ]\d{2}:\d{2}/.test(trimmed)) return '';
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  }
  const instant = asDate(value);
  return instant ? instant.toISOString() : '';
}

function nowIso(now) {
  const instant = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return instant.toISOString();
}

/** Id for a new entry. The caller may pass one instead. */
export function createNotebookId(now = new Date()) {
  const time = (now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now()).toString(36);
  const rand = globalThis.crypto?.randomUUID?.() || `${time}${Math.random().toString(36).slice(2)}`;
  const clean = String(rand).replace(/[^A-Za-z0-9]/g, '');
  return `nb_${time}_${clean}`.slice(0, NOTEBOOK_LIMITS.id);
}

function resolveStamps(raw, now) {
  const hasCreated = raw.createdAt != null && raw.createdAt !== '';
  const hasUpdated = raw.updatedAt != null && raw.updatedAt !== '';
  let createdAt = hasCreated ? instantIso(raw.createdAt) : '';
  let updatedAt = hasUpdated ? instantIso(raw.updatedAt) : '';
  if (hasCreated && !createdAt) return null;
  if (hasUpdated && !updatedAt) return null;
  if (!createdAt && !updatedAt) {
    const stamp = nowIso(now);
    createdAt = stamp;
    updatedAt = stamp;
  } else if (!createdAt) {
    createdAt = updatedAt;
  } else if (!updatedAt) {
    updatedAt = createdAt;
  }
  if (updatedAt < createdAt) return null;
  return { createdAt, updatedAt };
}

function normalizeTags(raw) {
  if (raw == null || raw === '') return { ok: true, tags: [] };
  if (!Array.isArray(raw) || raw.length > NOTEBOOK_LIMITS.tags) return { ok: false };
  const tags = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string') return { ok: false };
    const tag = plainLine(item);
    if (!tag || tag.length > NOTEBOOK_LIMITS.tag || /[<>]/.test(tag)) return { ok: false };
    const key = fold(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return { ok: true, tags };
}

function normalizeJournalName(raw) {
  if (raw == null || raw === '') return { ok: true, journalName: null };
  if (typeof raw !== 'string') return { ok: false };
  const journalName = plainLine(raw);
  if (!journalName) return { ok: true, journalName: null };
  if (journalName.length > NOTEBOOK_LIMITS.journalName) return { ok: false };
  return { ok: true, journalName };
}

/**
 * Validate one notebook entry. Drops unknown fields. A normalized entry is
 * safe to pass through again. `date` is optional; when set it is a civil day
 * in Asia/Jerusalem. `journalName` is a label, not a lookup.
 * @returns {{ ok: true, entry: object } | { ok: false, code: string, message: string }}
 */
export function validateNotebookEntry(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('invalid');

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!ID_RE.test(id)) return fail('id');

  if (typeof raw.title !== 'string') return fail('title');
  const title = plainLine(raw.title);
  if (!title || title.length > NOTEBOOK_LIMITS.title) return fail('title');

  let body = '';
  if (raw.body != null && raw.body !== '') {
    if (typeof raw.body !== 'string') return fail('body');
    body = stripControls(raw.body).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (body.length > NOTEBOOK_LIMITS.body) return fail('body');
  }

  const tags = normalizeTags(raw.tags);
  if (!tags.ok) return fail('tags');

  let date = null;
  if (raw.date != null && raw.date !== '') {
    date = notebookDayKey(raw.date);
    if (!date) return fail('date');
  }

  const journal = normalizeJournalName(raw.journalName);
  if (!journal.ok) return fail('journal');

  const stamps = resolveStamps(raw, now);
  if (!stamps) return fail('timestamps');

  return {
    ok: true,
    entry: {
      id,
      title,
      body,
      tags: tags.tags,
      date,
      month: date ? date.slice(0, 7) : null,
      journalName: journal.journalName,
      createdAt: stamps.createdAt,
      updatedAt: stamps.updatedAt,
    },
  };
}

/** Fill a missing id and timestamps, then validate. */
export function createNotebookEntry(input, now = new Date()) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return validateNotebookEntry({
    ...raw,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createNotebookId(now),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  }, now);
}

function entryDay(entry) {
  return entry.date || notebookDayKey(entry.updatedAt);
}

function compareEntries(a, b) {
  const dayA = entryDay(a);
  const dayB = entryDay(b);
  if (dayA !== dayB) return dayA < dayB ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function sortNormalized(entries) {
  return [...entries].sort(compareEntries);
}

/** Validate a list. Invalid rows are reported and left out. Order is newest day first. */
export function collectNotebook(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const accepted = [];
  const rejected = [];
  list.forEach((raw, index) => {
    const result = validateNotebookEntry(raw);
    if (!result.ok) {
      rejected.push({ index, code: result.code, message: result.message });
      return;
    }
    accepted.push(result.entry);
  });
  return { entries: sortNormalized(accepted), rejected };
}

function queryOf(query) {
  if (typeof query === 'string') return { text: fold(query.trim()), tag: '' };
  if (!query || typeof query !== 'object') return { text: '', tag: '' };
  const text = typeof query.text === 'string' ? fold(query.text.trim()) : '';
  const tag = typeof query.tag === 'string' ? fold(plainLine(query.tag)) : '';
  return { text, tag };
}

function matches(entry, query) {
  if (query.tag && !entry.tags.some((tag) => fold(tag) === query.tag)) return false;
  if (!query.text) return true;
  const haystack = fold([
    entry.title,
    entry.body,
    entry.journalName || '',
    entry.tags.join('\n'),
  ].join('\n'));
  return haystack.includes(query.text);
}

/**
 * Search normalized or raw entries. `query` is a string, or `{ text, tag }`.
 * Text matches title, body, journal name, and tags. Tag is an exact label.
 * An empty query returns every valid entry, newest day first.
 */
export function searchNotebook(entries, query = '') {
  const { entries: list } = collectNotebook(entries);
  const filter = queryOf(query);
  if (!filter.text && !filter.tag) return list;
  return list.filter((entry) => matches(entry, filter));
}

/** Newest day first. Same day: newest update, then id. */
export function sortNotebookEntries(entries) {
  return collectNotebook(entries).entries;
}

function monthLabel(month) {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_LABELS[index]} ${month.slice(0, 4)}`;
}

/**
 * Group by calendar month in Asia/Jerusalem. A dated entry uses its day.
 * An entry without a date uses the Jerusalem month of `updatedAt`.
 * Months and rows inside them are newest first.
 */
export function groupNotebookByMonth(entries) {
  const { entries: list } = collectNotebook(entries);
  const groups = new Map();
  list.forEach((entry) => {
    const month = entryDay(entry).slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(entry);
  });
  return [...groups.keys()].sort((a, b) => (a < b ? 1 : -1)).map((month) => ({
    month,
    label: monthLabel(month),
    entries: groups.get(month),
  }));
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Title is plain text. Markup is escaped, never interpreted. */
export function renderNotebookTitle(title) {
  return esc(typeof title === 'string' ? title : '');
}

function hasForbiddenUrlChar(url) {
  for (let i = 0; i < url.length; i += 1) {
    const code = url.charCodeAt(i);
    if (code <= 32 || code === 34 || code === 39 || code === 60 || code === 62 || code === 92 || code === 96) {
      return true;
    }
  }
  return false;
}

function isSafeHttp(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  if (hasForbiddenUrlChar(url)) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

function takeEmphasis(source, index) {
  if (source[index] !== '*') return null;
  let marker = 1;
  if (source[index + 1] === '*') marker = 2;
  if (source[index + 2] === '*') marker = 3;
  const token = '*'.repeat(marker);
  const rest = source.slice(index + marker);
  const closeAt = rest.indexOf(token);
  if (closeAt <= 0) return null;
  const content = rest.slice(0, closeAt);
  if (content.startsWith(' ') || content.endsWith(' ') || content.includes('`')) return null;
  const inner = renderInline(content);
  const html = marker === 3
    ? `<strong><em>${inner}</em></strong>`
    : marker === 2
      ? `<strong>${inner}</strong>`
      : `<em>${inner}</em>`;
  return { html, next: index + marker + closeAt + marker };
}

function takeCode(source, index) {
  if (source[index] !== '`') return null;
  const end = source.indexOf('`', index + 1);
  if (end <= index + 1) return null;
  return {
    html: `<code>${esc(source.slice(index + 1, end))}</code>`,
    next: end + 1,
  };
}

function takeLink(source, index) {
  if (source[index] !== '[') return null;
  const labelEnd = source.indexOf(']', index + 1);
  if (labelEnd <= index + 1 || source[labelEnd + 1] !== '(') return null;
  const urlEnd = source.indexOf(')', labelEnd + 2);
  if (urlEnd <= labelEnd + 2) return null;
  const label = source.slice(index + 1, labelEnd);
  const url = source.slice(labelEnd + 2, urlEnd).trim();
  if (!label || /[[\]]/.test(label) || !isSafeHttp(url)) return null;
  return {
    html: `<a href="${esc(url)}" rel="noopener noreferrer">${renderInline(label)}</a>`,
    next: urlEnd + 1,
  };
}

function renderInline(source) {
  let html = '';
  let index = 0;
  const text = String(source);
  while (index < text.length) {
    const code = text[index] === '`' ? takeCode(text, index) : null;
    if (code) {
      html += code.html;
      index = code.next;
      continue;
    }
    const link = text[index] === '[' ? takeLink(text, index) : null;
    if (link) {
      html += link.html;
      index = link.next;
      continue;
    }
    const emphasis = text[index] === '*' ? takeEmphasis(text, index) : null;
    if (emphasis) {
      html += emphasis.html;
      index = emphasis.next;
      continue;
    }
    let next = index + 1;
    while (next < text.length && text[next] !== '`' && text[next] !== '[' && text[next] !== '*') next += 1;
    html += esc(text.slice(index, next));
    index = next;
  }
  return html;
}

function isFence(line) {
  return /^\s{0,3}```/.test(line);
}

function isHeading(line) {
  return /^(#{1,3})\s+\S/.test(line);
}

function isQuote(line) {
  return /^>\s?/.test(line);
}

function isList(line) {
  return /^\s*[-*]\s+\S/.test(line);
}

function isBlockStart(line) {
  return isFence(line) || isHeading(line) || isQuote(line) || isList(line);
}

/**
 * Render markdown to a small HTML subset. The source is escaped first, so a
 * `<script>`, an event handler, or a `javascript:` link stays text.
 * Allowed tags: p, br, h1–h3, ul, li, blockquote, pre, code, strong, em, a.
 */
export function renderNotebookBody(body) {
  if (typeof body !== 'string' || body === '') return '';
  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isFence(line)) {
      const buf = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index])) {
        buf.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }
    if (isQuote(line)) {
      const buf = [];
      while (index < lines.length && isQuote(lines[index])) {
        buf.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${buf.map((item) => renderInline(item)).join('<br>')}</blockquote>`);
      continue;
    }
    if (isList(line)) {
      const items = [];
      while (index < lines.length && isList(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }
    const para = [];
    while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines[index])) {
      para.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${para.map((item) => renderInline(item)).join('<br>')}</p>`);
  }
  return blocks.join('');
}
