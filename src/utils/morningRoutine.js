import { PRE_MARKET_CHECKLIST } from './constants';

// The morning journal's pre-market routine. The six built-in steps stay the
// seed for an account that has never edited the list. A saved list lives on
// users/{uid}/settings/morningRoutine and replaces that seed entirely, so a
// deleted default does not come back. Daily checks on a journal entry are
// still an array of these ids (`preMarketChecklist`). Ids are never reused,
// and a deleted label is kept on `retired` so an old entry can still show it.

export const MORNING_ROUTINE_SETTING = 'morningRoutine';
export const MAX_ROUTINE_ITEMS = 20;
export const ROUTINE_LABEL_MAX = 80;
export const MAX_RETIRED_ROUTINE = 40;
export const REMOVED_ROUTINE_LABEL = 'פריט שהוסר';

const ID_RE = /^[a-z][a-z0-9]{0,15}$/;
const CUSTOM_ID_RE = /^r([1-9][0-9]{0,3})$/;

export function defaultRoutineItems() {
  return PRE_MARKET_CHECKLIST.map((item) => ({ id: item.key, label: item.label }));
}

export function cleanRoutineLabel(value) {
  if (typeof value !== 'string') return '';
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label || label.length > ROUTINE_LABEL_MAX) return '';
  return label;
}

function customIdNumber(id) {
  const match = typeof id === 'string' ? CUSTOM_ID_RE.exec(id) : null;
  return match ? Number(match[1]) : 0;
}

function cleanItem(raw, usedIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!ID_RE.test(id) || usedIds.has(id)) return null;
  const label = cleanRoutineLabel(raw.label);
  if (!label) return null;
  usedIds.add(id);
  return { id, label };
}

// `null` / `undefined` is "no document yet": the built-in six. An object,
// even one with an empty `items` array, is a saved list and is not re-seeded.
export function normalizeRoutineDoc(data) {
  if (data == null) {
    return { items: defaultRoutineItems(), seq: 0, retired: [], persisted: false };
  }
  const items = [];
  const usedIds = new Set();
  const rawItems = Array.isArray(data.items) ? data.items : [];
  for (const raw of rawItems) {
    if (items.length >= MAX_ROUTINE_ITEMS) break;
    const item = cleanItem(raw, usedIds);
    if (item) items.push(item);
  }
  let seq = Number.isInteger(data.seq) && data.seq >= 0 && data.seq <= 9999 ? data.seq : 0;
  for (const item of items) seq = Math.max(seq, customIdNumber(item.id));

  const retired = [];
  const rawRetired = Array.isArray(data.retired) ? data.retired : [];
  for (const raw of rawRetired) {
    if (retired.length >= MAX_RETIRED_ROUTINE) break;
    const item = cleanItem(raw, usedIds);
    if (!item) continue;
    seq = Math.max(seq, customIdNumber(item.id));
    retired.push(item);
  }
  return { items, seq, retired, persisted: true };
}

export function storedRoutineDoc(doc) {
  const current = normalizeRoutineDoc(doc);
  return {
    items: current.items.map((item) => ({ id: item.id, label: item.label })),
    seq: current.seq,
    retired: current.retired.map((item) => ({ id: item.id, label: item.label })),
  };
}

// Catalog passed into stats. Omitted means the built-in six. An array is the
// trader's list, including an empty one.
export function routineCatalog(routineItems) {
  if (!Array.isArray(routineItems)) return defaultRoutineItems();
  return normalizeRoutineDoc({ items: routineItems, seq: 0, retired: [] }).items;
}

function nextCustomId(items, retired, seq) {
  const used = new Set([...items.map((item) => item.id), ...retired.map((item) => item.id)]);
  let n = Math.max(Number.isInteger(seq) ? seq : 0, 0);
  for (const id of used) n = Math.max(n, customIdNumber(id));
  n += 1;
  if (n > 9999) return null;
  const id = `r${n}`;
  if (used.has(id) || !ID_RE.test(id)) return null;
  return { id, seq: n };
}

export function addRoutineItem(doc, label) {
  const current = normalizeRoutineDoc(doc);
  if (current.items.length >= MAX_ROUTINE_ITEMS) {
    return { ok: false, error: `אפשר עד ${MAX_ROUTINE_ITEMS} פריטים` };
  }
  const text = cleanRoutineLabel(label);
  if (!text) return { ok: false, error: `צריך ניסוח עד ${ROUTINE_LABEL_MAX} תווים` };
  if (current.items.some((item) => item.label === text)) {
    return { ok: false, error: 'הפריט כבר ברשימה' };
  }
  const allocated = nextCustomId(current.items, current.retired, current.seq);
  if (!allocated) return { ok: false, error: `אפשר עד ${MAX_ROUTINE_ITEMS} פריטים` };
  return {
    ok: true,
    doc: storedRoutineDoc({
      items: [...current.items, { id: allocated.id, label: text }],
      seq: allocated.seq,
      retired: current.retired,
    }),
  };
}

export function updateRoutineItem(doc, id, label) {
  const current = normalizeRoutineDoc(doc);
  const index = current.items.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'הפריט לא נמצא' };
  const text = cleanRoutineLabel(label);
  if (!text) return { ok: false, error: `צריך ניסוח עד ${ROUTINE_LABEL_MAX} תווים` };
  if (current.items.some((item, i) => i !== index && item.label === text)) {
    return { ok: false, error: 'הפריט כבר ברשימה' };
  }
  if (current.items[index].label === text) {
    return { ok: true, changed: false, doc: storedRoutineDoc(current) };
  }
  const items = current.items.slice();
  items[index] = { id, label: text };
  return { ok: true, changed: true, doc: storedRoutineDoc({ ...current, items }) };
}

export function removeRoutineItem(doc, id) {
  const current = normalizeRoutineDoc(doc);
  const item = current.items.find((row) => row.id === id);
  if (!item) return { ok: false, error: 'הפריט לא נמצא' };
  const retired = [
    { id: item.id, label: item.label },
    ...current.retired.filter((row) => row.id !== item.id),
  ].slice(0, MAX_RETIRED_ROUTINE);
  return {
    ok: true,
    doc: storedRoutineDoc({
      items: current.items.filter((row) => row.id !== id),
      seq: Math.max(current.seq, customIdNumber(id)),
      retired,
    }),
  };
}

// direction -1 moves the row up (earlier), +1 moves it down.
export function moveRoutineItem(doc, id, direction) {
  const current = normalizeRoutineDoc(doc);
  const index = current.items.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'הפריט לא נמצא' };
  const target = index + (direction < 0 ? -1 : 1);
  if (target < 0 || target >= current.items.length) {
    return { ok: true, changed: false, doc: storedRoutineDoc(current) };
  }
  const items = current.items.slice();
  const [row] = items.splice(index, 1);
  items.splice(target, 0, row);
  return { ok: true, changed: true, doc: storedRoutineDoc({ ...current, items }) };
}

// Current label, then the label kept at delete time, then a built-in step
// that was never saved on this account, then a fixed Hebrew fallback.
// Never returns the raw id and never throws.
export function resolveRoutineLabel(id, { items, retired } = {}) {
  if (typeof id !== 'string' || !id) return REMOVED_ROUTINE_LABEL;
  const live = (Array.isArray(items) ? items : []).find((item) => item && item.id === id);
  if (live && cleanRoutineLabel(live.label)) return cleanRoutineLabel(live.label);
  const gone = (Array.isArray(retired) ? retired : []).find((item) => item && item.id === id);
  if (gone && cleanRoutineLabel(gone.label)) return cleanRoutineLabel(gone.label);
  const preset = PRE_MARKET_CHECKLIST.find((item) => item.key === id);
  if (preset) return preset.label;
  return REMOVED_ROUTINE_LABEL;
}

// "3/6". A missing catalog uses the built-in six. Checks for ids that are no
// longer on the list do not inflate the numerator.
export function routineProgress(checked, items) {
  const list = Array.isArray(items) ? routineCatalog(items) : defaultRoutineItems();
  const ids = Array.isArray(checked) ? checked.filter((id) => typeof id === 'string') : [];
  if (!list.length) return ids.length ? String(ids.length) : '';
  const known = new Set(list.map((item) => item.id));
  const done = ids.filter((id) => known.has(id)).length;
  return `${done}/${list.length}`;
}
