// News-translation cache layout — pure helpers, unit-tested in
// newsTranslateCache.test.js.
//
// Translations used to be one KV key per headline (news:tr:{hash}): a feed
// load with 12 new headlines cost 12 KV writes. They now live in ONE KV
// document per Israel day (news:trb:{date} = { [titleHash]: { title, desc } }),
// so a translate call that produces new entries costs a single write, and a
// fully-cached call costs none. Lookups check today's and yesterday's bucket.

export const TR_BUCKET_MAX = 1500;      // entries kept per daily bucket
export const TR_BUCKET_TTL = 60 * 60 * 24 * 3;

export const trBucketKey = (date) => `news:trb:${date}`;

// Cache identity is the exact title AND description the model saw. A title-only
// key let the first writer of a headline replace the Hebrew line everyone else
// reads. Slices match the translate route's caps.
export function translationSource(title, desc) {
  return `${String(title || '').slice(0, 300)}\n${String(desc || '').slice(0, 200)}`;
}

// Sources the Worker fetched itself (RSS feed, digest headlines, calendar
// titles). A translation of anything else is returned to the caller and not
// written into the shared bucket.
export function trustedTranslationSources({ feedItems = [], headlines = [], calendarTitles = [] } = {}) {
  const out = new Set();
  for (const item of feedItems) {
    if (!item?.title) continue;
    out.add(translationSource(item.title, item.description || item.desc || ''));
  }
  for (const title of headlines) {
    if (title) out.add(translationSource(title, ''));
  }
  for (const title of calendarTitles) {
    if (title) out.add(translationSource(title, ''));
  }
  return out;
}

// Merge new translations into a bucket, keeping at most `max` entries (the
// oldest insertions are dropped first). Returns a new object.
export function mergeTrBucket(bucket, additions, max = TR_BUCKET_MAX) {
  const out = {};
  const base = bucket && typeof bucket === 'object' && !Array.isArray(bucket) ? bucket : {};
  for (const [k, v] of Object.entries(base)) {
    if (!Object.prototype.hasOwnProperty.call(additions || {}, k)) out[k] = v;
  }
  for (const [k, v] of Object.entries(additions || {})) out[k] = v;
  const keys = Object.keys(out);
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) delete out[k];
  }
  return out;
}

// Look a hash up across buckets (newest first). Own properties only.
export function lookupTr(buckets, hash) {
  for (const b of buckets) {
    if (b && Object.prototype.hasOwnProperty.call(b, hash)) return b[hash];
  }
  return null;
}
