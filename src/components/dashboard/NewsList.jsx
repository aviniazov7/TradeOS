import { useEffect, useMemo, useState } from 'react';
import { translateNews, unpackNewsTranslations } from '../../services/newsService';
import { dropInvalidTranslations, isHebrewSafeTranslation, safeHebrew } from '../../utils/newsScript';

// The latest headlines for the home page, translated to Hebrew via the same AI
// service (and the SAME localStorage cache key) the full news page uses, so a
// title translated in one place is free in the other. Falls back to the
// English headline until its translation lands.

const HE_CACHE_KEY = 'tradeos_news_he_v1';        // shared with NewsPage feed
const HE_CACHE_TTL = 3 * 24 * 60 * 60 * 1000;     // 3d, matches the worker KV TTL

function loadHe() {
  try {
    const raw = JSON.parse(localStorage.getItem(HE_CACHE_KEY) || 'null');
    if (raw && typeof raw.savedAt === 'number' && Date.now() - raw.savedAt < HE_CACHE_TTL && raw.map) {
      const map = dropInvalidTranslations(raw.map);
      if (map !== raw.map) {
        localStorage.setItem(HE_CACHE_KEY, JSON.stringify({ savedAt: raw.savedAt, map }));
      }
      return map;
    }
  } catch { /* corrupt/absent — start fresh */ }
  return {};
}

// Merge our new translations into whatever is already cached (the news page
// may have written more) instead of overwriting, so neither view clobbers the
// other's entries.
function mergeSaveHe(additions) {
  try {
    const current = loadHe();
    const map = dropInvalidTranslations({ ...current, ...additions });
    localStorage.setItem(HE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), map }));
  } catch { /* quota/private mode — non-fatal */ }
}

function heRelative(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} ד׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

// Hebrew titles for the given headlines, translated once and cached (shared
// with the news page). Returns link → { title }.
function useHeTitles(list) {
  const [heMap, setHeMap] = useState(loadHe);
  useEffect(() => {
    if (!list.length) return undefined;
    let cancelled = false;
    (async () => {
      const missing = list.filter((a) => a.link && !heMap[a.link]);
      if (!missing.length) return;
      const { items } = unpackNewsTranslations(await translateNews(missing.map((a) => ({ title: a.title, desc: '' }))));
      // A spent quota (or any other miss) leaves the English headline. No error.
      if (cancelled || !items) return;
      const additions = {};
      missing.forEach((a, j) => { if (isHebrewSafeTranslation(items[j])) additions[a.link] = items[j]; });
      if (Object.keys(additions).length) {
        setHeMap((m) => ({ ...m, ...additions }));
        mergeSaveHe(additions);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  return heMap;
}

// A short list of the latest headlines (home page).
export function NewsList({ items = [], max = 3 }) {
  const list = useMemo(() => items.slice(0, max), [items, max]);
  const heMap = useHeTitles(list);
  if (!list.length) return <p className="market-status">טוען חדשות…</p>;
  return (
    <div>
      {list.map((a, i) => {
        const source = a.sourceLabel || a.source || a.author || '';
        const when = heRelative(a.pubDate);
        return (
          <a key={a.link || i} href={a.link} target="_blank" rel="noopener noreferrer" className={i === 0 ? 'news-lead' : 'news-row'}>
            <span className="news-meta">
              {source ? <span className="news-source">{source}</span> : null}
              {source && when ? <span aria-hidden>·</span> : null}
              {when ? <span>{when}</span> : null}
            </span>
            <h3 className="news-headline">{safeHebrew(heMap[a.link]?.title) || a.title}</h3>
          </a>
        );
      })}
    </div>
  );
}
