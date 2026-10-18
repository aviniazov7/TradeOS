// Pure helpers for the plaintext-exchange-key scan (no I/O, so they're tested).
//
// Before API keys moved to the encrypted Worker store, they sat in Firestore at
// users/{uid}/settings/exchanges as { <exchangeId>: { apiKey, apiSecret, … } }.
// The app migrates and strips them on sign-in (and again when the exchange
// screen opens); this finds users who still have a copy. The scan only COUNTS
// — it never returns, prints, or stores a key value, and it never writes.

const filled = (v) => typeof v === 'string' && v.trim().length > 0;

/** Exchange ids in a settings/exchanges document that still hold both a key and a secret. */
export function plaintextExchanges(doc) {
  if (!doc || typeof doc !== 'object') return [];
  return Object.entries(doc)
    .filter(([, conf]) => conf && typeof conf === 'object' && filled(conf.apiKey) && filled(conf.apiSecret))
    .map(([id]) => id);
}

/** Folds per-user results into the summary that gets printed. */
export function summarize(perUser) {
  const byExchange = {};
  let withDoc = 0;
  let withPlaintext = 0;
  for (const exchanges of perUser) {
    if (exchanges === null) continue; // user has no settings/exchanges doc
    withDoc += 1;
    if (exchanges.length) withPlaintext += 1;
    for (const id of exchanges) byExchange[id] = (byExchange[id] || 0) + 1;
  }
  return { users: perUser.length, withExchangesDoc: withDoc, withPlaintextKeys: withPlaintext, byExchange };
}
