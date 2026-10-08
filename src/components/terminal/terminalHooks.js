import { useCallback, useEffect, useState } from 'react';

/**
 * JSON state mirrored to localStorage (per-viewer UI prefs). `parse` turns
 * whatever was stored (or null) into a valid value; storage failures (private
 * mode, blocked site data) just mean nothing is remembered.
 */
export function useStoredJson(key, parse) {
  const [value, setValue] = useState(() => {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch { raw = null; }
    return parse(raw);
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered */ }
  }, [key, value]);
  return [value, setValue];
}

const fsElement = () => (typeof document === 'undefined' ? null : document.fullscreenElement || document.webkitFullscreenElement || null);

/** Fullscreen API for one element: [isFullscreen, toggle, supported]. */
export function useFullscreen(ref) {
  const supported = typeof document !== 'undefined' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!ref.current && fsElement() === ref.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [ref]);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
    } catch { /* refused */ }
  }, [ref]);
  return [on, toggle, supported];
}

/** Re-renders its caller every `ms` (for "updated Xs ago"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** matchMedia as state. */
export function useMedia(query) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

const readTheme = () => (typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark');

/** The app theme ('light' class on <html>, set by the layout's useTheme). */
export function useAppTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
