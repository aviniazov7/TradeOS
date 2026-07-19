import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Accessibility, X, Plus, Minus, Contrast, Link2, Type, Pause, MousePointer2, RotateCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Site-wide accessibility menu (Israeli SI 5568 expectation: the site must let
// users ADJUST it, not just declare it accessible). A small, unobtrusive
// floating button on every page; the full controls open only on click. All
// preferences persist in localStorage and are applied as classes on <html>
// (+ a root font-size scale), so they survive navigation and reload.

const STORE_KEY = 'a11y_prefs';
const FONT_STEPS = [100, 115, 130, 150]; // % of the base root font-size

const DEFAULTS = {
  font: 100,        // one of FONT_STEPS
  contrast: false,
  links: false,     // highlight/underline links
  readable: false,  // switch to a plain readable font
  stopMotion: false,
  bigCursor: false,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return raw && typeof raw === 'object' ? { ...DEFAULTS, ...raw } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

// Reflect the preferences onto <html> so global CSS can act on them.
function apply(prefs) {
  const root = document.documentElement;
  root.style.fontSize = prefs.font && prefs.font !== 100 ? `${prefs.font}%` : '';
  root.classList.toggle('a11y-contrast', !!prefs.contrast);
  root.classList.toggle('a11y-links', !!prefs.links);
  root.classList.toggle('a11y-readable', !!prefs.readable);
  root.classList.toggle('a11y-stop-motion', !!prefs.stopMotion);
  root.classList.toggle('a11y-big-cursor', !!prefs.bigCursor);
}

// Module-scope so it isn't recreated on every render (which would remount the
// toggles and lose focus). Pure — driven entirely by props.
function ToggleRow({ Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
        active ? 'bg-accent-primary/15 border-accent-primary/40 text-accent-primary' : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary'
      }`}
    >
      <span className="flex items-center gap-2.5 text-sm"><Icon className="w-4 h-4 shrink-0" /> {label}</span>
      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${active ? 'bg-accent-primary' : 'bg-border-primary'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(load);
  const navigate = useNavigate();

  // Apply on mount and whenever prefs change; persist too.
  useEffect(() => {
    apply(prefs);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  const toggle = useCallback((key) => setPrefs((p) => ({ ...p, [key]: !p[key] })), []);
  const stepFont = useCallback((dir) => setPrefs((p) => {
    const i = FONT_STEPS.indexOf(p.font);
    const next = FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    return { ...p, font: next };
  }), []);
  const reset = useCallback(() => setPrefs({ ...DEFAULTS }), []);

  const anyActive = prefs.font !== 100 || prefs.contrast || prefs.links || prefs.readable || prefs.stopMotion || prefs.bigCursor;

  return (
    <>
      {/* Floating trigger — small + unobtrusive, present on every page. Sits
          above the mobile bottom-nav (z-40) and lifts clear of it on mobile. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="פתיחת תפריט נגישות"
        title="נגישות"
        className="fixed left-3 bottom-24 lg:left-5 lg:bottom-5 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-accent-primary text-bg-primary shadow-lg shadow-black/40 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <Accessibility className="w-5.5 h-5.5" />
        {anyActive && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-profit border-2 border-bg-primary" />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/40"
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              role="dialog" aria-label="תפריט נגישות"
              className="fixed left-3 bottom-24 lg:left-5 lg:bottom-5 z-[61] w-[min(92vw,340px)] max-h-[75vh] overflow-y-auto rounded-2xl border border-border-primary bg-bg-primary shadow-2xl shadow-black/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Accessibility className="w-5 h-5 text-accent-primary" />
                  <h2 className="text-base font-bold text-text-primary">תפריט נגישות</h2>
                </div>
                <button onClick={() => setOpen(false)} aria-label="סגירה" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Font size stepper */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary">
                <span className="flex items-center gap-2.5 text-sm text-text-secondary"><Type className="w-4 h-4" /> גודל טקסט</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => stepFont(-1)} disabled={prefs.font === FONT_STEPS[0]} aria-label="הקטן טקסט" className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="w-11 text-center text-xs font-semibold text-text-primary num-mono">{prefs.font}%</span>
                  <button onClick={() => stepFont(1)} disabled={prefs.font === FONT_STEPS[FONT_STEPS.length - 1]} aria-label="הגדל טקסט" className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <ToggleRow Icon={Contrast} label="ניגודיות גבוהה" active={prefs.contrast} onClick={() => toggle('contrast')} />
              <ToggleRow Icon={Link2} label="הדגשת קישורים" active={prefs.links} onClick={() => toggle('links')} />
              <ToggleRow Icon={Type} label="גופן קריא" active={prefs.readable} onClick={() => toggle('readable')} />
              <ToggleRow Icon={Pause} label="עצירת אנימציות" active={prefs.stopMotion} onClick={() => toggle('stopMotion')} />
              <ToggleRow Icon={MousePointer2} label="סמן עכבר גדול" active={prefs.bigCursor} onClick={() => toggle('bigCursor')} />

              <div className="flex items-center gap-2 pt-1">
                <button onClick={reset} disabled={!anyActive} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border-primary text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors cursor-pointer">
                  <RotateCcw className="w-4 h-4" /> איפוס
                </button>
                <button onClick={() => { setOpen(false); navigate('/accessibility'); }} className="flex-1 px-3 py-2 rounded-xl bg-bg-secondary border border-border-primary text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                  הצהרת נגישות
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
