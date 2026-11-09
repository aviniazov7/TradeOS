// AI quota bookkeeping — pure helpers (no KV / network), unit-tested in
// aiQuota.test.js.
//
// KV's free tier allows 1,000 writes a day for the WHOLE app. Every AI message
// used to cost ~4 writes (rate-limit windows, global ceiling, daily usage
// counter, daily stats) and rejected requests still wrote. Now each user has
// ONE KV document holding every per-user counter:
//
//   aiq:{uid} = {
//     date: 'YYYY-MM-DD',  // Israel date the daily counters belong to
//     u: 3,                // daily AI requests (text quota / progress bar)
//     i: 1,                // daily chart-image analyses
//     b: 1,                // daily plan-builder submissions (separate cap)
//     m: { s, c },         // rolling 1-minute window  (s = start ms, c = count)
//     h: { s, c },         // rolling 1-hour window
//     d: { s, c },         // rolling 24-hour window (premium soft cap)
//   }
//
// planAiCharge() decides — from the document alone — whether a request may
// proceed and what the document looks like after charging it. Nothing is
// written for a rejected request. The check and the write are committed
// together by the per-user AiQuotaDO (worker/aiQuotaDo.js); aiq:{uid} in KV
// is only a mirror for the admin scan and the one-time seed of that object.

export const AI_WINDOW_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

// Advance a rolling window by one hit. A window older than its length restarts.
export function rollWindow(w, now, lenMs) {
  if (w && typeof w.s === 'number' && typeof w.c === 'number' && now - w.s < lenMs) {
    return { s: w.s, c: w.c + 1 };
  }
  return { s: now, c: 1 };
}

// Normalize whatever is stored (missing, legacy, corrupt) into a doc whose
// daily counters belong to `date` — a doc from a previous day keeps its
// rolling windows but starts the daily counters at zero.
export function normalizeQuotaDoc(raw, date) {
  const doc = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const sameDay = doc.date === date;
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    date,
    u: sameDay ? n(doc.u) : 0,
    i: sameDay ? n(doc.i) : 0,
    b: sameDay ? n(doc.b) : 0,
    m: doc.m || null,
    h: doc.h || null,
    d: doc.d || null,
  };
}

/**
 * Decide a single AI request against the user's quota document.
 *
 * opts:
 *   now, date        — clock + Israel date string
 *   premium          — caller's plan
 *   chargeDaily      — count this request against the daily `u` counter
 *   image            — the request carries a chart image (premium-only)
 *   planBuilder      — count this request against the daily `b` counter
 *   limits           — { premium: {minute,hour,day}, freeBurstPerMin,
 *                        freeDaily, imageDaily, planBuilderDaily }
 *
 * Returns { deny: reason } (reason ∈ minute|hour|day|burst|imagePremium|
 * imageQuota|daily|planPremium|planBuilder) or { next } — the document to
 * persist. The check order matches the original route logic: rate windows →
 * image gate → image quota → daily quota → plan-builder quota. `b` is copied
 * onto every next document so a later chat charge does not wipe it.
 */
export function planAiCharge(raw, { now, date, premium, chargeDaily, image, planBuilder, limits }) {
  const doc = normalizeQuotaDoc(raw, date);
  const m = rollWindow(doc.m, now, AI_WINDOW_MS.minute);
  const h = rollWindow(doc.h, now, AI_WINDOW_MS.hour);
  const d = rollWindow(doc.d, now, AI_WINDOW_MS.day);

  if (premium) {
    if (m.c > limits.premium.minute) return { deny: 'minute' };
    if (h.c > limits.premium.hour) return { deny: 'hour' };
    if (d.c > limits.premium.day) return { deny: 'day' };
  } else if (m.c > limits.freeBurstPerMin) {
    return { deny: 'burst' };
  }

  let i = doc.i;
  if (image) {
    if (!premium) return { deny: 'imagePremium' };
    i += 1;
    if (i > limits.imageDaily) return { deny: 'imageQuota' };
  }

  let u = doc.u;
  if (chargeDaily) {
    u += 1;
    if (!premium && u > limits.freeDaily) return { deny: 'daily' };
  }

  let b = doc.b;
  if (planBuilder) {
    if (!premium) return { deny: 'planPremium' };
    const cap = Number(limits.planBuilderDaily);
    b += 1;
    if (!Number.isFinite(cap) || cap < 1 || b > cap) return { deny: 'planBuilder' };
  }

  return { next: { date, u, i, b, m, h, d } };
}

// Undo the daily/image part of a charge after a provider failure (failed calls
// don't burn quota). Rate windows are deliberately NOT refunded — they exist
// to throttle hammering, failed or not. Returns the doc to persist, or null
// when there is nothing to change (other day / already zero).
export function planAiRefund(raw, { date, daily, image }) {
  if (!raw || raw.date !== date) return null;
  const doc = normalizeQuotaDoc(raw, date);
  let changed = false;
  if (daily && doc.u > 0) { doc.u -= 1; changed = true; }
  if (image && doc.i > 0) { doc.i -= 1; changed = true; }
  return changed ? doc : null;
}

// Daily usage as the progress bars / admin panel read it.
export function quotaUsage(raw, date) {
  const doc = normalizeQuotaDoc(raw, date);
  return { used: doc.u, imageUsed: doc.i };
}

// ---- Isolate-local window counters ------------------------------------------
// For limits that only need to be approximately right (the global AI circuit
// breaker, the news-translate throttles): kept in memory per isolate instead
// of KV, so they cost zero writes. Bounded so a long-lived isolate can't grow
// the map without limit.
export function createWindowCounters(maxKeys = 5000) {
  const map = new Map();
  return {
    peek(key, lenMs, now = Date.now()) {
      const w = map.get(key);
      return w && now - w.s < lenMs ? w.c : 0;
    },
    // Returns the window AFTER the hit ({ s: window start, c: count }).
    // `shared` ({ s, c }) lets a count seen elsewhere (Cache API) win — its
    // window start is kept, so the window still expires on schedule.
    get(key, lenMs, now = Date.now()) {
      const w = map.get(key);
      return w && now - w.s < lenMs ? w : null;
    },
    bump(key, lenMs, now = Date.now(), shared = null) {
      const w = map.get(key);
      let cur = w && now - w.s < lenMs ? w : { s: now, c: 0 };
      if (shared && now - shared.s < lenMs && shared.c > cur.c) cur = shared;
      const next = { s: cur.s, c: cur.c + 1 };
      map.delete(key);
      map.set(key, next);
      if (map.size > maxKeys) map.delete(map.keys().next().value);
      return next;
    },
    clear() { map.clear(); },
  };
}

// ---- Daily AI stats buffer ---------------------------------------------------
// aistat:{date} (requests + tokens, for the admin graph) used to be rewritten
// on EVERY message. Deltas now accumulate in memory and are merged into KV at
// most once per `intervalMs` per isolate (the first message of a fresh isolate
// flushes immediately, so sparse traffic is still recorded promptly).
export function createStatBuffer(intervalMs = 10 * 60_000) {
  let pending = {};
  let lastFlush = 0;
  return {
    add(date, { text = 0, image = 0, tokIn = 0, tokOut = 0 }) {
      const p = pending[date] || (pending[date] = { text: 0, image: 0, tokIn: 0, tokOut: 0 });
      p.text += text; p.image += image; p.tokIn += tokIn; p.tokOut += tokOut;
    },
    // Returns the pending deltas (and clears them) when a flush is due.
    take(now = Date.now(), force = false) {
      if (!Object.keys(pending).length) return null;
      if (!force && now - lastFlush < intervalMs) return null;
      const out = pending;
      pending = {};
      lastFlush = now;
      return out;
    },
    // Put deltas back after a failed write so the next flush retries them.
    restore(deltas) {
      for (const [date, dl] of Object.entries(deltas || {})) this.add(date, dl);
    },
  };
}

export function mergeStat(cur, delta) {
  const base = cur && typeof cur === 'object' ? cur : {};
  return {
    text: (base.text || 0) + (delta.text || 0),
    image: (base.image || 0) + (delta.image || 0),
    tokIn: (base.tokIn || 0) + (delta.tokIn || 0),
    tokOut: (base.tokOut || 0) + (delta.tokOut || 0),
  };
}
