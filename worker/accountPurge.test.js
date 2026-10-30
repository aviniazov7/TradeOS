import { describe, it, expect, vi } from 'vitest';
import { purgeUserResidue, couponMarkerKeysFor, paymentsByUidQuery, apiKeyIndexByUidQuery } from './accountPurge';

const BASE = 'https://firestore.googleapis.com/v1/projects/p/databases/(default)';
const UID = 'AbC123xyz987QWERTY';

function makeKv(names, pageSize = 2) {
  const deleted = [];
  return {
    deleted,
    async list({ prefix, cursor }) {
      const all = names.filter((n) => n.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + pageSize);
      const end = start + pageSize >= all.length;
      return { keys: slice.map((name) => ({ name })), list_complete: end, cursor: String(start + pageSize) };
    },
    async delete(k) { deleted.push(k); },
  };
}

describe('couponMarkerKeysFor', () => {
  it('matches only this uid, not a different uid that merely shares a suffix', () => {
    const keys = ['coupon-redeemed:SAVE10:' + UID, 'coupon-redeemed:SAVE10:Z' + UID, 'coupon-redeemed:VIP:' + UID, 'coupon:SAVE10', 'push:' + UID];
    expect(couponMarkerKeysFor(keys, UID)).toEqual(['coupon-redeemed:SAVE10:' + UID, 'coupon-redeemed:VIP:' + UID]);
    expect(couponMarkerKeysFor(keys, '')).toEqual([]);
  });
});

describe('paymentsByUidQuery', () => {
  it('filters the payments collection by uid', () => {
    const q = paymentsByUidQuery(UID).structuredQuery;
    expect(q.from).toEqual([{ collectionId: 'payments' }]);
    expect(q.where.fieldFilter.value).toEqual({ stringValue: UID });
  });
});

describe('apiKeyIndexByUidQuery', () => {
  it('filters the hash index by uid', () => {
    const q = apiKeyIndexByUidQuery(UID).structuredQuery;
    expect(q.from).toEqual([{ collectionId: 'apiKeyIndex' }]);
    expect(q.where.fieldFilter.value).toEqual({ stringValue: UID });
  });
});

describe('purgeUserResidue', () => {
  it('deletes the admin note, anonymises payments, removes coupon markers and API key hashes', async () => {
    const calls = [];
    const fetchFn = vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method, body: init.body });
      if (init.method === 'DELETE') return { ok: true, status: 200 };
      if (url.endsWith(':runQuery')) {
        const col = JSON.parse(init.body).structuredQuery.from[0].collectionId;
        if (col === 'apiKeyIndex') {
          return { ok: true, status: 200, json: async () => [
            { document: { name: 'projects/p/databases/(default)/documents/apiKeyIndex/abc' } },
          ] };
        }
        return { ok: true, status: 200, json: async () => [
          { document: { name: 'projects/p/databases/(default)/documents/payments/pay1' } },
          { document: { name: 'projects/p/databases/(default)/documents/payments/pay2' } },
          { readTime: 'x' }, // a query result row without a document
        ] };
      }
      return { ok: true, status: 200 };
    });
    const kv = makeKv(['coupon-redeemed:A:' + UID, 'coupon-redeemed:B:someoneelse1', 'coupon-redeemed:C:' + UID, 'coupon-redeemed:D:other22222']);
    const r = await purgeUserResidue({ fetchFn, base: BASE, headers: {}, uid: UID, kv });

    expect(r).toEqual({ adminNote: true, paymentsAnonymized: 2, couponMarkers: 2, apiKeysRevoked: 1, errors: [] });
    expect(calls[0]).toMatchObject({ url: `${BASE}/documents/adminNotes/${UID}`, method: 'DELETE' });
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(2);
    expect(patches[0].url).toContain('/payments/pay1?updateMask.fieldPaths=uid&updateMask.fieldPaths=note');
    expect(JSON.parse(patches[0].body)).toEqual({ fields: { uid: { nullValue: null }, note: { nullValue: null } } });
    expect(kv.deleted.sort()).toEqual(['coupon-redeemed:A:' + UID, 'coupon-redeemed:C:' + UID]);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/apiKeyIndex/abc'))).toBe(true);
  });

  it('treats a missing admin note (404) as done', async () => {
    const fetchFn = vi.fn(async (url, init = {}) => {
      if (init.method === 'DELETE') return { ok: false, status: 404 };
      return { ok: true, status: 200, json: async () => [] };
    });
    const r = await purgeUserResidue({ fetchFn, base: BASE, headers: {}, uid: UID, kv: makeKv([]) });
    expect(r.adminNote).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('keeps going and reports each failure instead of throwing', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('network down'); });
    const kv = { list: async () => { throw new Error('kv down'); }, delete: async () => {} };
    const r = await purgeUserResidue({ fetchFn, base: BASE, headers: {}, uid: UID, kv });
    expect(r.adminNote).toBe(false);
    expect(r.errors).toHaveLength(4);
  });

  it('does nothing without a uid', async () => {
    const fetchFn = vi.fn();
    const r = await purgeUserResidue({ fetchFn, base: BASE, headers: {}, uid: '', kv: makeKv([]) });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r.errors).toEqual([]);
  });
});
