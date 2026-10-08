// Single source of truth for converting between the two Wyckoff shapes.
//
// `signals` (scanner output / manual) and `wyckoffSetups` (ground-truth DB)
// describe the same idea with different field names — signals use
// entryPrice/stopLoss/tps[]/createdAt, setups use entry/stop/target/at.
// Rather than migrate live Firestore fields, we own the mapping here so the
// feedback loop, the modal prefill, and the stats all agree.

/**
 * Map a detected/manual `signal` into a `wyckoffSetups` payload, tagging it
 * with the owner's verdict. Copies the confidence + a back-reference so the
 * ground-truth row can be measured (precision by confidence) and de-duped.
 *
 * @param {object} signal - a signals doc (must include id)
 * @param {'valid'|'invalid'} label - the owner's verdict
 * @returns {object} a wyckoffSetups payload (no createdAt — the hook stamps it)
 */
export function signalToSetup(signal, label) {
  const tps = Array.isArray(signal.tps) ? signal.tps : [];
  return {
    pair: signal.pair,
    direction: signal.direction,
    timeframe: signal.timeframe || '30m',
    entry: signal.entryPrice ?? null,
    stop: signal.stopLoss ?? null,
    target: tps[0] ?? null,
    at: signal.createdAt ?? null,          // detection moment ≈ the break
    label,
    source: signal.source === 'scanner' ? 'scanner' : 'manual',
    confidence: signal.confidence ?? null, // enables precision-by-confidence
    signalId: signal.id,                   // back-ref + idempotency key
    notes: signal.notes || '',
  };
}

/** Confidence bucket label for a scanner setup (for precision breakdown). */
export function confidenceBucket(conf) {
  const c = Number(conf);
  if (!Number.isFinite(c)) return null;
  if (c >= 90) return '90–95';
  if (c >= 75) return '75–89';
  return '60–74';
}

/**
 * Cap on scanned (long/short-tagged) coins per user, so the scanner stays
 * within the free Cloudflare/Firestore budget — applies to Premium too, on
 * purpose. The worker enforces the same cap server-side.
 */
export const MAX_SCAN_TAGS = 15;
