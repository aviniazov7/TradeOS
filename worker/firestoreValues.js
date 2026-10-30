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

/** Equality filters plus document-id order. No composite index required. */
export function buildTradesQuery({ journalId, status, pair, direction, limit, startAfterName }) {
  const eq = (field, value) => ({
    fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
  });
  const filters = [];
  if (journalId) filters.push(eq('journalId', journalId));
  if (status) filters.push(eq('status', status));
  if (pair) filters.push(eq('pair', pair));
  if (direction) filters.push(eq('direction', direction));
  const q = {
    from: [{ collectionId: 'trades' }],
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit,
  };
  if (filters.length === 1) q.where = filters[0];
  else if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters } };
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
