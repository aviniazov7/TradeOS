// In-memory Firestore REST double for the public API and MCP tests.
// runQuery honors equality filters, orderBy (including entryDate + __name__),
// and an exclusive startAt cursor. Documents missing an orderBy field other
// than __name__ are omitted, matching Firestore.

import { vi } from 'vitest';
import { decodeFields } from './firestoreValues.js';

export function memoryFirestore(projectId) {
  const docs = new Map();
  let seq = 0;
  const rel = (url) => {
    const path = new URL(url).pathname;
    const marker = '/documents/';
    const at = path.indexOf(marker);
    if (at === -1) return '';
    return decodeURIComponent(path.slice(at + marker.length)).replace(/:runQuery$/, '');
  };
  const nameOf = (path) => `projects/${projectId}/databases/(default)/documents/${path}`;

  function matches(data, where) {
    if (!where) return true;
    if (where.compositeFilter) return where.compositeFilter.filters.every((f) => matches(data, f));
    const field = where.fieldFilter.field.fieldPath;
    return data[field] === where.fieldFilter.value.stringValue;
  }

  function natural(left, right) {
    if (left.kind === 'null' && right.kind === 'null') return 0;
    if (left.kind === 'null') return -1;
    if (right.kind === 'null') return 1;
    if (left.value < right.value) return -1;
    if (left.value > right.value) return 1;
    return 0;
  }

  function fieldValue(row, fieldPath) {
    if (fieldPath === '__name__') return { kind: 'ref', value: nameOf(row.key) };
    const raw = row.fields[fieldPath];
    if (!raw || 'nullValue' in raw) return { kind: 'null', value: null };
    if ('timestampValue' in raw) return { kind: 'ts', value: raw.timestampValue };
    if ('stringValue' in raw) return { kind: 'str', value: raw.stringValue };
    return { kind: 'null', value: null };
  }

  function cursorValue(value) {
    if (!value || 'nullValue' in value) return { kind: 'null', value: null };
    if ('timestampValue' in value) return { kind: 'ts', value: value.timestampValue };
    if ('referenceValue' in value) return { kind: 'ref', value: value.referenceValue };
    if ('stringValue' in value) return { kind: 'str', value: value.stringValue };
    return { kind: 'null', value: null };
  }

  function compareToCursor(row, orders, values) {
    for (let i = 0; i < orders.length; i++) {
      const dir = orders[i].direction === 'DESCENDING' ? -1 : 1;
      const cmp = natural(fieldValue(row, orders[i].field.fieldPath), cursorValue(values[i]));
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  }

  function compareRows(a, b, orders) {
    for (const order of orders) {
      const dir = order.direction === 'DESCENDING' ? -1 : 1;
      const cmp = natural(fieldValue(a, order.field.fieldPath), fieldValue(b, order.field.fieldPath));
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  }

  const fetchFn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = new URL(url);
    const path = rel(url);
    if (u.pathname.endsWith(':runQuery')) {
      const q = JSON.parse(init.body).structuredQuery;
      const collectionId = q.from[0].collectionId;
      const prefix = path ? `${path}/${collectionId}/` : `${collectionId}/`;
      const orders = q.orderBy?.length
        ? q.orderBy
        : [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }];
      let rows = [...docs.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, fields]) => ({ key, fields }))
        .filter((row) => matches(decodeFields(row.fields), q.where))
        .filter((row) => orders.every((order) => {
          if (order.field.fieldPath === '__name__') return true;
          const raw = row.fields[order.field.fieldPath];
          return raw && !('nullValue' in raw);
        }))
        .sort((a, b) => compareRows(a, b, orders));
      if (q.startAt?.values?.length) {
        const after = q.startAt.before === true;
        rows = rows.filter((row) => {
          const cmp = compareToCursor(row, orders, q.startAt.values);
          return after ? cmp >= 0 : cmp > 0;
        });
      }
      rows = rows.slice(0, q.limit || rows.length);
      return response(200, rows.map((row) => ({ document: { name: nameOf(row.key), fields: row.fields } })));
    }
    if (method === 'GET' && !docs.has(path)) {
      const children = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
      if (children.length || path.split('/').length % 2 === 1) {
        return response(200, { documents: children.map(([key, fields]) => ({ name: nameOf(key), fields })) });
      }
      return response(404, {});
    }
    if (method === 'GET') return response(200, { name: nameOf(path), fields: docs.get(path) });
    if (method === 'DELETE') {
      docs.delete(path);
      return response(200, {});
    }
    if (method === 'PATCH') {
      const prev = docs.get(path) || {};
      docs.set(path, { ...prev, ...JSON.parse(init.body).fields });
      return response(200, {});
    }
    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || `t${++seq}`;
      const docPath = `${path}/${id}`;
      if (docs.has(docPath)) return response(409, { error: { status: 'ALREADY_EXISTS' } });
      docs.set(docPath, JSON.parse(init.body).fields);
      return response(200, { name: nameOf(docPath) });
    }
    return response(500, {});
  });

  return {
    fetchFn,
    docs,
    put(path, data) { docs.set(path, data); },
  };
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
  };
}
