import { isClosedTrade, safePnl, winRateOf } from './calculations';

// Optional per-trade answers. The field list lives on
// users/{uid}/settings/customTradeFields. A trade stores only
// `{ [fieldId]: string | number }` and may omit `custom` entirely.
// Trades written before the field existed stay unchanged.

export const CUSTOM_FIELDS_SETTING = 'customTradeFields';
export const MAX_CUSTOM_FIELDS = 12;
export const MAX_CUSTOM_OPTIONS = 12;
export const CUSTOM_NAME_MAX = 40;
export const CUSTOM_TEXT_MAX = 80;
export const CUSTOM_OPTION_MAX = 40;
export const CUSTOM_SEQ_MAX = 999;

const FIELD_TYPES = ['text', 'number', 'select'];
const ID_RE = /^f[1-9][0-9]{0,2}$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export const CUSTOM_TYPE_LABELS = {
  text: 'טקסט',
  number: 'מספר',
  select: 'בחירה',
};

function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  if (!name || name.length > CUSTOM_NAME_MAX) return '';
  return name;
}

function cleanOptions(raw) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[\n,]/);
  const out = [];
  const seen = new Set();
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const option = item.trim();
    if (!option || option.length > CUSTOM_OPTION_MAX || seen.has(option)) continue;
    seen.add(option);
    out.push(option);
    if (out.length >= MAX_CUSTOM_OPTIONS) break;
  }
  return out;
}

function fieldIdNumber(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return 0;
  return Number(id.slice(1));
}

function normalizeField(raw, usedIds, usedNames) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!ID_RE.test(id) || usedIds.has(id)) return null;
  const name = cleanName(raw.name);
  if (!name || usedNames.has(name)) return null;
  if (!FIELD_TYPES.includes(raw.type)) return null;
  const field = { id, name, type: raw.type };
  if (raw.type === 'select') {
    const options = cleanOptions(raw.options);
    if (!options.length) return null;
    field.options = options;
  }
  usedIds.add(id);
  usedNames.add(name);
  return field;
}

/** `{ fields, seq }` from a settings document. A missing doc is an empty list. */
export function normalizeCustomFieldsDoc(data) {
  const list = Array.isArray(data?.fields) ? data.fields : [];
  const fields = [];
  const usedIds = new Set();
  const usedNames = new Set();
  for (const raw of list) {
    if (fields.length >= MAX_CUSTOM_FIELDS) break;
    const field = normalizeField(raw, usedIds, usedNames);
    if (field) fields.push(field);
  }
  let seq = Number.isInteger(data?.seq) ? data.seq : 0;
  for (const field of fields) seq = Math.max(seq, fieldIdNumber(field.id));
  if (seq < 0) seq = 0;
  if (seq > CUSTOM_SEQ_MAX) seq = CUSTOM_SEQ_MAX;
  return { fields, seq };
}

export function normalizeCustomFieldDefs(data) {
  return normalizeCustomFieldsDoc(data).fields;
}

function nextFieldId(fields, seq) {
  const used = new Set(fields.map((field) => field.id));
  let n = Math.max(Number.isInteger(seq) ? seq : 0, 0);
  for (const field of fields) n = Math.max(n, fieldIdNumber(field.id));
  n += 1;
  if (n > CUSTOM_SEQ_MAX) return null;
  const id = `f${n}`;
  if (used.has(id) || !ID_RE.test(id)) return null;
  return { id, seq: n };
}

/**
 * Add one field definition. New ids are Premium-only. The returned list is
 * what settings/customTradeFields stores.
 */
export function addCustomField(doc, draft, { isPremium = false } = {}) {
  const current = normalizeCustomFieldsDoc(doc);
  if (!isPremium) return { ok: false, error: 'הגדרת שדה חדש זמינה ב-Premium' };
  if (current.fields.length >= MAX_CUSTOM_FIELDS) {
    return { ok: false, error: `אפשר עד ${MAX_CUSTOM_FIELDS} שדות` };
  }
  const name = cleanName(draft?.name);
  if (!name) return { ok: false, error: 'צריך שם עד 40 תווים' };
  if (current.fields.some((field) => field.name === name)) {
    return { ok: false, error: 'כבר יש שדה בשם הזה' };
  }
  if (!FIELD_TYPES.includes(draft?.type)) return { ok: false, error: 'סוג לא מוכר' };
  const field = { id: '', name, type: draft.type };
  if (draft.type === 'select') {
    const options = cleanOptions(draft.options);
    if (!options.length) return { ok: false, error: 'לבחירה צריך לפחות אפשרות אחת' };
    field.options = options;
  }
  const allocated = nextFieldId(current.fields, current.seq);
  if (!allocated) return { ok: false, error: `אפשר עד ${MAX_CUSTOM_FIELDS} שדות` };
  field.id = allocated.id;
  return {
    ok: true,
    fields: [...current.fields, field],
    seq: allocated.seq,
  };
}

/** Drop a field. Saved trade values stay on the trade until the next edit. */
export function removeCustomField(doc, id) {
  const current = normalizeCustomFieldsDoc(doc);
  return {
    fields: current.fields.filter((field) => field.id !== id),
    seq: current.seq,
  };
}

function parseCustomNumber(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(',', '.');
  if (!NUMBER_RE.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null;
  return n;
}

function coerceValue(value, field) {
  if (!field) return null;
  if (field.type === 'number') return parseCustomNumber(value);
  const max = field.type === 'select' ? CUSTOM_OPTION_MAX : CUSTOM_TEXT_MAX;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = String(value);
    return text.length <= max ? text : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

/**
 * Map safe to store on a trade. Empty, missing, or junk input returns null
 * so the caller can omit the field. With defs, only those ids are kept.
 * Without defs, a string/number map with valid ids is still cleaned.
 */
export function sanitizeCustomMap(raw, defs) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fields = Array.isArray(defs) ? defs : null;
  const out = {};
  if (fields) {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(raw, field.id)) continue;
      const value = coerceValue(raw[field.id], field);
      if (value == null || value === '') continue;
      out[field.id] = value;
    }
  } else {
    for (const [key, value] of Object.entries(raw)) {
      if (!ID_RE.test(key)) continue;
      if (typeof value === 'number') {
        const n = parseCustomNumber(value);
        if (n == null) continue;
        out[key] = n;
      } else if (typeof value === 'string') {
        const text = value.trim();
        if (!text || text.length > CUSTOM_TEXT_MAX) continue;
        out[key] = text;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Controlled input strings for the trade form. Missing answers are ''. */
export function customFormState(raw, defs) {
  const cleaned = sanitizeCustomMap(raw, defs) || {};
  const out = {};
  for (const field of defs || []) {
    const value = cleaned[field.id];
    out[field.id] = value == null ? '' : String(value);
  }
  return out;
}

export function customSaveProblem(formCustom, defs) {
  for (const field of defs || []) {
    const text = String(formCustom?.[field.id] ?? '').trim();
    if (!text) continue;
    if (field.type === 'number' && parseCustomNumber(text) == null) {
      return `«${field.name}» צריך להיות מספר`;
    }
  }
  return '';
}

export function customPayload(formCustom, defs) {
  return sanitizeCustomMap(formCustom, defs);
}

export function readCustomValue(trade, field) {
  const custom = trade?.custom;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom) || !field) return null;
  if (!Object.prototype.hasOwnProperty.call(custom, field.id)) return null;
  return coerceValue(custom[field.id], field);
}

export function tradeHasCustom(trade) {
  const custom = trade?.custom;
  return !!custom && typeof custom === 'object' && !Array.isArray(custom) && Object.keys(custom).length > 0;
}

/** True when this trade's stored answer equals the filter value. No `custom` is never a match. */
export function tradeMatchesCustom(trade, fieldId, rawValue) {
  const id = typeof fieldId === 'string' ? fieldId : '';
  if (!id || rawValue == null || rawValue === '') return false;
  const custom = trade?.custom;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return false;
  if (!Object.prototype.hasOwnProperty.call(custom, id)) return false;
  const value = custom[id];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value) === String(rawValue);
  if (typeof value === 'string') return value.trim() === String(rawValue).trim();
  return false;
}

function bucketValue(value) {
  if (typeof value === 'number') return { key: `n:${value}`, label: String(value) };
  return { key: `s:${value}`, label: String(value) };
}

/**
 * Per-field stats over closed trades. Open trades and trades without `custom`
 * add nothing. One group per defined field that has at least one answer.
 */
export function computeCustomFieldStats(trades, defs) {
  const fields = Array.isArray(defs) ? defs : [];
  const groups = [];
  for (const field of fields) {
    const buckets = new Map();
    for (const trade of trades || []) {
      if (!isClosedTrade(trade)) continue;
      const value = readCustomValue(trade, field);
      if (value == null || value === '') continue;
      const bucket = bucketValue(value);
      let row = buckets.get(bucket.key);
      if (!row) {
        row = { key: bucket.key, label: bucket.label, value, wins: 0, losses: 0, count: 0, pnl: 0 };
        buckets.set(bucket.key, row);
      }
      row.count += 1;
      if (trade.result === 'win') row.wins += 1;
      else if (trade.result === 'loss') row.losses += 1;
      row.pnl += safePnl(trade);
    }
    if (!buckets.size) continue;
    const rows = [...buckets.values()].map((row) => ({
      key: row.key,
      value: row.value,
      label: row.label,
      count: row.count,
      wins: row.wins,
      losses: row.losses,
      winRate: winRateOf(row.wins, row.losses),
      pnl: row.pnl,
    })).sort((a, b) => b.pnl - a.pnl || b.count - a.count || a.label.localeCompare(b.label, 'he'));
    groups.push({ id: field.id, name: field.name, type: field.type, rows });
  }
  return groups;
}
