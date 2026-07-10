import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { translateNews } from '../../services/newsService';

// Rotating Hebrew news ticker for the dashboard — one headline at a time,
// auto-advancing, translated to Hebrew via the same AI service (and the SAME
// localStorage cache key) the full news page uses, so a title translated in
// one place is free in the other. Falls back to the English headline until
// its translation lands.

const HE_CACHE_KEY = 'tradeos_news_he_v1';        // shared with NewsPage feed
const HE_CACHE_TTL = 3 * 24 * 60 * 60 * 1000;     // 3d, matches the worker KV TTL
const ROTATE_MS = 6000;

function loadHe() {
  try {
    const raw = JSON.parse(localStorage.getItem(HE_CACHE_KEY) || 'null');
    if (raw && typeof raw.savedAt === 'number' && Date.now() - raw.savedAt < HE_CACHE_TTL && raw.map) {
      return raw.map;
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
    const map = { ...current, ...additions };
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

export default function NewsTicker({ items = [] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [heMap, setHeMap] = useState(loadHe);
  const [dir, setDir] = useState(1); // slide direction for the enter/exit animation

  const list = useMemo(() => items.slice(0, 6), [items]);

  // Keep idx in range if the list shrinks between fetches.
  useEffect(() => { setIdx((i) => (list.length ? i % list.length : 0)); }, [list.length]);

  // Translate the visible headlines to Hebrew (only the ones not cached).
  useEffect(() => {
    if (!list.length) return undefined;
    let cancelled = false;
    (async () => {
      const missing = list.filter((a) => a.link && !heMap[a.link]);
      if (!missing.length) return;
      const res = await translateNews(missing.map((a) => ({ title: a.title, desc: '' })));
      if (cancelled || !res) return;
      const additions = {};
      missing.forEach((a, j) => { if (res[j]?.title) additions[a.link] = res[j]; });
      if (Object.keys(additions).length) {
        setHeMap((m) => ({ ...m, ...additions }));
        mergeSaveHe(additions);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // Auto-advance. Pause on hover/focus so a user reading a headline isn't
  // yanked to the next one. Ref keeps the interval callback reading fresh state.
  const stateRef = useRef({ len: list.length, paused });
  stateRef.current = { len: list.length, paused };
  useEffect(() => {
    if (list.length < 2) return undefined;
    const t = setInterval(() => {
      if (stateRef.current.paused) return;
      setDir(1);
      setIdx((i) => (i + 1) % stateRef.current.len);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [list.length]);

  if (!list.length) {
    return <p className="text-xs text-text-muted">טוען חדשות…</p>;
  }

  const go = (delta) => {
    setDir(delta);
    setIdx((i) => (i + delta + list.length) % list.length);
  };

  const item = list[idx];
  const heTitle = heMap[item.link]?.title || item.title;
  const thumb = item.thumbnail || item.enclosure?.link || null;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-lg">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.a
            key={item.link || idx}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            custom={dir}
            initial={{ opacity: 0, x: dir > 0 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir > 0 ? -24 : 24 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="group flex items-stretch gap-3 bg-bg-tertiary border border-border-primary rounded-lg overflow-hidden hover:border-accent-primary/40 transition-colors min-h-[92px]"
          >
            {thumb ? (
              <div className="relative w-28 shrink-0 bg-bg-primary overflow-hidden">
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                />
              </div>
            ) : (
              <div className="w-28 shrink-0 bg-gradient-to-br from-bg-primary to-bg-tertiary flex items-center justify-center">
                <Newspaper className="w-6 h-6 text-text-muted/40" />
              </div>
            )}
            <div className="flex-1 min-w-0 py-2.5 pe-3 flex flex-col justify-center text-right">
              <p className="text-sm text-text-primary leading-snug line-clamp-3 group-hover:text-accent-primary transition-colors">
                {heTitle}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-text-muted">
                <ExternalLink className="w-3 h-3" />
                <span>{heRelative(item.pubDate)}</span>
              </div>
            </div>
          </motion.a>
        </AnimatePresence>
      </div>

      {/* Controls: prev/next + progress dots. In RTL, ChevronRight = previous,
          ChevronLeft = next. */}
      {list.length > 1 && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => go(-1)}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              title="הקודם"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => go(1)}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              title="הבא"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {list.map((a, i) => (
              <button
                key={a.link || i}
                onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i); }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === idx ? 'w-4 bg-accent-primary' : 'w-1.5 bg-bg-tertiary hover:bg-border-hover'
                }`}
                title={`חדשה ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
