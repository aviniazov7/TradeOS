// Firestore REST value codec. Dates become timestamps; everything else is the
// JSON type the security rules already accept (number / string / bool / list / map).

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) {
    return { timestampValue: Number.isNaN(value.getTime()) ? null : value.toISOString() };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { doubleValue: value } : { nullValue: null };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.filter((v) => v !== undefined).map(encodeValue) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { nullValue: null };
}

export function encodeFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const encoded = encodeValue(value);
    if (encoded.timestampValue === null) continue;
    fields[key] = encoded;
  }
  return fields;
}

export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  if ('referenceValue' in value) return value.referenceValue;
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = decodeValue(value);
  return out;
}

export function fsBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
}

export function docIdFromName(name) {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Equality filters plus a stable order.
 *
 * `sort: 'entryDate'` (the public list) is entryDate, then document id, both
 * in `order` (`desc` newest first, `asc` oldest first). A missing entryDate
 * is not in that index, so those trades are omitted. Each equality field
 * needs a composite index with entryDate (see firestore.indexes.json);
 * Firestore merges those indexes when several equalities are combined. A
 * list with no equality filter uses the automatic single-field entryDate index.
 * `__name__` is the same direction as entryDate, so it does not need its own
 * index field.
 *
 * `sort: 'name'` (the stats scan) is document id only, so every trade is
 * included and no composite index is required.
 */
export function buildTradesQuery({
  journalId, status, pair, direction, limit,
  sort = 'entryDate', order = 'desc', startAfterName, startAfter,
}) {
  const eq = (field, value) => ({
    fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
  });
  const filters = [];
  if (journalId) filters.push(eq('journalId', journalId));
  if (status) filters.push(eq('status', status));
  if (pair) filters.push(eq('pair', pair));
  if (direction) filters.push(eq('direction', direction));
  const q = { from: [{ collectionId: 'trades' }], limit };
  if (filters.length === 1) q.where = filters[0];
  else if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters } };

  if (sort === 'name') {
    q.orderBy = [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }];
    if (startAfterName) q.startAt = { values: [{ referenceValue: startAfterName }], before: false };
    return q;
  }

  const dir = order === 'asc' ? 'ASCENDING' : 'DESCENDING';
  q.orderBy = [
    { field: { fieldPath: 'entryDate' }, direction: dir },
    { field: { fieldPath: '__name__' }, direction: dir },
  ];
  if (startAfter?.name) {
    const stamp = startAfter.entryDate ? String(startAfter.entryDate) : '';
    q.startAt = {
      values: [
        stamp ? { timestampValue: stamp } : { nullValue: null },
        { referenceValue: startAfter.name },
      ],
      before: false,
    };
  }
  return q;
}

/**
 * One equality filter and document-id order.
 *
 * Same shape as `buildTradesQuery` with `sort: 'name'` (the stats scan):
 * ordering by `__name__` does not add a composite index. Used to page
 * `backtests` by `backtestJournalId` under the caller's user document.
 * Omit `field` to walk the whole subcollection.
 */
export function buildIdOrderedQuery({ collectionId, field, value, limit, startAfterName }) {
  const q = {
    from: [{ collectionId }],
    limit,
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
  };
  if (field && value) {
    q.where = {
      fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
    };
  }
  if (startAfterName) q.startAt = { values: [{ referenceValue: startAfterName }], before: false };
  return q;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toPublicTrade(trade) {
  return JSON.parse(JSON.stringify(trade, (_key, value) => (
    value instanceof Date ? value.toISOString() : value
  )));
}
