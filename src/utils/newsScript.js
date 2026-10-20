// Hebrew news copy may use Hebrew, Latin, digits, and shared punctuation.
// A foreign script (Gujarati, Devanagari, Cyrillic, Han, Arabic, …) means the
// model glued the wrong alphabet onto a name — "જેપી" instead of JPMorgan —
// and that string must not be shown or cached.

// Common + Inherited cover digits, currency, quotes, dashes, and combining marks.
const FOREIGN_SCRIPT = /[^\p{Script=Hebrew}\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

export function hasForeignScript(text) {
  if (text == null || text === '') return false;
  return FOREIGN_SCRIPT.test(String(text));
}

export function isHebrewSafeText(text) {
  return !hasForeignScript(text);
}

// A cached translation: a Hebrew string, or { title, desc } from the feed.
// Empty desc is fine. A blank or foreign-script title is not a translation.
export function isHebrewSafeTranslation(value) {
  if (typeof value === 'string') return value.trim().length > 0 && isHebrewSafeText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim() || !isHebrewSafeText(value.title)) return false;
  if (value.desc == null || value.desc === '') return true;
  return typeof value.desc === 'string' && isHebrewSafeText(value.desc);
}

// Drop stored translations that use a foreign script. Same object when nothing
// was removed, so callers can persist only when the result differs.
export function dropInvalidTranslations(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const out = {};
  let removed = false;
  for (const [k, v] of Object.entries(map)) {
    if (isHebrewSafeTranslation(v)) out[k] = v;
    else removed = true;
  }
  return removed ? out : map;
}

/** A display string, or '' when it is missing or uses a foreign script. */
export function safeHebrew(text) {
  return typeof text === 'string' && isHebrewSafeText(text) ? text : '';
}

// Prefer a safe translation, then the stored original, then the English source.
export function preferredHeadline(translated, original, english) {
  return safeHebrew(translated) || safeHebrew(original) || safeHebrew(english);
}

const TITLE_MAX = 300;
const DESC_MAX = 400;

// Split a model batch into script-safe entries and the source rows to retry.
// `accepted` is index-aligned with `sourceItems` (null = no usable translation).
export function partitionTranslations(sourceItems, modelItems) {
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const accepted = new Array(source.length).fill(null);
  const rejectedById = new Map();
  for (const tr of (Array.isArray(modelItems) ? modelItems : [])) {
    const i = Number(tr?.id);
    if (!Number.isInteger(i) || i < 0 || i >= source.length || accepted[i]) continue;
    if (!tr?.title) continue;
    const entry = {
      title: String(tr.title).slice(0, TITLE_MAX),
      desc: String(tr.desc || '').slice(0, DESC_MAX),
    };
    if (!isHebrewSafeTranslation(entry)) {
      if (!rejectedById.has(i)) {
        rejectedById.set(i, {
          id: i,
          title: String(source[i]?.title || ''),
          desc: String(source[i]?.desc || ''),
        });
      }
      continue;
    }
    accepted[i] = entry;
    rejectedById.delete(i);
  }
  return { accepted, rejected: [...rejectedById.values()] };
}

// Digest stories are stored Hebrew. A headline in the wrong script is replaced
// with the English source title so the feed translator can redo it; a bad
// "why" line is dropped.
export function sanitizeDigest(digest) {
  if (!digest || typeof digest !== 'object' || !Array.isArray(digest.stories)) {
    return { digest, changed: false };
  }
  let changed = false;
  const stories = digest.stories.map((s) => {
    if (!s || typeof s !== 'object') return s;
    let headline = s.headline;
    let why = s.why;
    if (hasForeignScript(headline)) {
      const english = (Array.isArray(s.sources) ? s.sources : [])
        .find((src) => src?.title && !hasForeignScript(src.title))?.title;
      if (english && english !== headline) {
        headline = english;
        changed = true;
      }
    }
    if (hasForeignScript(why)) {
      why = '';
      changed = true;
    }
    if (headline === s.headline && why === s.why) return s;
    return { ...s, headline, why };
  });
  if (!changed) return { digest, changed: false };
  return { digest: { ...digest, stories }, changed: true };
}
