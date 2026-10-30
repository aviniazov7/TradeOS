// What survives a user's own data wipe, and removes it. The client deletes the
// user's subcollections, profile and Auth account; the Worker deletes the KV
// records (purgeUserKv). These are the rest — all things only an admin (the
// Worker's service account) can touch:
//   • adminNotes/{uid}        — the admin's private note about the user: deleted
//   • payments where uid==…   — kept for bookkeeping but ANONYMISED (the uid and
//                               the free-text note are removed; amount/date stay)
//   • coupon-redeemed:*:{uid} — "this user redeemed code X" markers: deleted
// Network and KV are injected so the logic is unit-tested without either.

/** Keys (from a KV list) that belong to `uid`: coupon-redeemed:{CODE}:{uid}. */
export function couponMarkerKeysFor(keys, uid) {
  if (!uid) return [];
  return keys.filter((k) => k.startsWith('coupon-redeemed:') && k.endsWith(`:${uid}`));
}

/** Firestore runQuery body: API-key hash index rows for this uid. */
export function apiKeyIndexByUidQuery(uid) {
  return {
    structuredQuery: {
      from: [{ collectionId: 'apiKeyIndex' }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: 50,
    },
  };
}

/** Firestore runQuery body: payments recorded for this uid. */
export function paymentsByUidQuery(uid) {
  return {
    structuredQuery: {
      from: [{ collectionId: 'payments' }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: 500,
    },
  };
}

/**
 * @param {object} o
 * @param {Function} o.fetchFn   fetch
 * @param {string}   o.base      https://firestore.googleapis.com/v1/projects/…/databases/(default)
 * @param {object}   o.headers   admin Authorization + JSON content type
 * @param {string}   o.uid
 * @param {object}   o.kv        KV namespace (list/delete)
 * @returns {Promise<{ adminNote: boolean, paymentsAnonymized: number, couponMarkers: number, apiKeysRevoked: number, errors: string[] }>}
 */
export async function purgeUserResidue({ fetchFn, base, headers, uid, kv }) {
  const out = { adminNote: false, paymentsAnonymized: 0, couponMarkers: 0, apiKeysRevoked: 0, errors: [] };
  if (!uid) return out;

  try {
    const r = await fetchFn(`${base}/documents/adminNotes/${uid}`, { method: 'DELETE', headers });
    out.adminNote = r.ok || r.status === 404;
    if (!out.adminNote) out.errors.push(`adminNotes ${r.status}`);
  } catch (e) { out.errors.push(`adminNotes ${e.message}`); }

  try {
    const q = await fetchFn(`${base}/documents:runQuery`, { method: 'POST', headers, body: JSON.stringify(paymentsByUidQuery(uid)) });
    if (!q.ok) throw new Error(`query ${q.status}`);
    const rows = await q.json();
    const names = (Array.isArray(rows) ? rows : []).map((row) => row?.document?.name).filter(Boolean);
    for (const name of names) {
      const mask = 'updateMask.fieldPaths=uid&updateMask.fieldPaths=note';
      const p = await fetchFn(`https://firestore.googleapis.com/v1/${name}?${mask}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ fields: { uid: { nullValue: null }, note: { nullValue: null } } }),
      });
      if (p.ok) out.paymentsAnonymized += 1; else out.errors.push(`payment ${p.status}`);
    }
  } catch (e) { out.errors.push(`payments ${e.message}`); }

  // Hash-index rows are not under users/{uid}, so the client's subcollection
  // wipe never sees them. Without this, a deleted account's API key still
  // resolves to that uid.
  try {
    const q = await fetchFn(`${base}/documents:runQuery`, {
      method: 'POST', headers, body: JSON.stringify(apiKeyIndexByUidQuery(uid)),
    });
    if (!q.ok) throw new Error(`query ${q.status}`);
    const rows = await q.json();
    const names = (Array.isArray(rows) ? rows : []).map((row) => row?.document?.name).filter(Boolean);
    for (const name of names) {
      const d = await fetchFn(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers });
      if (d.ok || d.status === 404) out.apiKeysRevoked += 1;
      else out.errors.push(`apiKey ${d.status}`);
    }
  } catch (e) { out.errors.push(`apiKeys ${e.message}`); }

  try {
    let cursor;
    do {
      const page = await kv.list({ prefix: 'coupon-redeemed:', cursor });
      for (const key of couponMarkerKeysFor(page.keys.map((k) => k.name), uid)) {
        await kv.delete(key);
        out.couponMarkers += 1;
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  } catch (e) { out.errors.push(`coupons ${e.message}`); }

  return out;
}
