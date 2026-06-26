import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Settings2 } from 'lucide-react';

const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right';

const MENU_HEIGHT = 150; // approx natural menu height (list + footer)

/**
 * StrategySelector - custom dropdown for selecting strategies.
 *
 * The menu is rendered in a portal with fixed positioning so it floats above
 * everything (never clipped by a scrollable modal) and never pushes its
 * container into scrolling. It opens downward, or upward when there isn't
 * enough room below in the viewport.
 *
 * Props:
 *   value            - string, current selected strategy
 *   onChange          - (strategy: string) => void
 *   strategies       - string[], available strategies list
 *   onAdd            - (name: string) => void, add custom strategy
 *   onRemove         - (name: string) => void, remove strategy
 *   label            - optional label text
 *   addLabel         - text for the "add custom" button (default: "מותאם אישית")
 *   inputPlaceholder - placeholder for add input (default: "שם אסטרטגיה...")
 *   emptyText        - text when no items (default: "אין אסטרטגיות")
 *   placeholder      - text when no selection (default: "בחר...")
 */
export default function StrategySelector({
  value,
  onChange,
  strategies = [],
  onAdd,
  onRemove,
  label,
  addLabel = 'מותאם אישית',
  inputPlaceholder = 'שם אסטרטגיה...',
  emptyText = 'אין אסטרטגיות',
  placeholder = 'בחר...',
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const [managing, setManaging] = useState(false);
  const [coords, setCoords] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Position the floating menu relative to the button, choosing the side
  // (below vs above) with more room *within the nearest scroll container*
  // (e.g. a modal body) so it stays inside the modal instead of spilling
  // past its bottom edge.
  const computeCoords = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const gap = 4;

    // Walk up to the closest vertically-scrollable ancestor and clamp the
    // available space to its bounds.
    let topBound = 0;
    let bottomBound = vh;
    let p = btnRef.current.parentElement;
    while (p) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        const cr = p.getBoundingClientRect();
        topBound = Math.max(topBound, cr.top);
        bottomBound = Math.min(bottomBound, cr.bottom);
        break;
      }
      p = p.parentElement;
    }

    const spaceBelow = bottomBound - rect.bottom;
    const spaceAbove = rect.top - topBound;
    const up = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;
    const avail = (up ? spaceAbove : spaceBelow) - gap - 8;
    setCoords({
      left: rect.left,
      width: rect.width,
      up,
      top: up ? undefined : rect.bottom + gap,
      bottom: up ? vh - rect.top + gap : undefined,
      maxHeight: Math.max(110, Math.min(MENU_HEIGHT, avail)),
    });
  }, []);

  const toggleOpen = () => {
    if (!open) computeCoords();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) { setManaging(false); setAdding(false); setCustom(''); return; }
    const reposition = () => computeCoords();
    window.addEventListener('resize', reposition);
    // capture: also catch the modal's internal scroll container
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, computeCoords]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleSelect = (s) => {
    onChange(s);
    setOpen(false);
  };

  const handleAddCustom = () => {
    const t = custom.trim();
    if (!t) return;
    onAdd?.(t);
    onChange(t);
    setCustom('');
    setAdding(false);
    setOpen(false);
  };

  const displayText = value || placeholder;

  // Leave room for the sticky footer (add/manage row) when capping the list.
  const listMax = coords ? Math.max(66, coords.maxHeight - 40) : 110;

  const menu = open && coords ? createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: coords.left,
        width: coords.width,
        top: coords.top,
        bottom: coords.bottom,
        zIndex: 70,
      }}
      className="bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
    >
      {managing ? (
        <>
          <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: listMax }}>
            {strategies.map((s) => (
              <div key={s} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-tertiary transition-colors">
                <span className="text-xs text-text-primary">{s}</span>
                <button type="button" onClick={() => onRemove?.(s)} className="p-0.5 text-text-muted hover:text-loss transition-colors cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {strategies.length === 0 && (
              <p className="text-xs text-text-muted text-center py-2">{emptyText}</p>
            )}
          </div>
          <div className="border-t border-border-primary">
            <button
              type="button"
              onClick={() => setManaging(false)}
              className="w-full text-center text-xs text-accent-primary hover:bg-bg-tertiary py-2 cursor-pointer transition-colors"
            >
              סגור ניהול
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="overflow-y-auto" style={{ maxHeight: listMax }}>
            {strategies.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSelect(s)}
                className={`w-full flex items-center px-3 py-1.5 text-sm transition-colors cursor-pointer text-right ${
                  value === s ? 'bg-accent-primary/10 text-accent-primary font-medium' : 'text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {s}
              </button>
            ))}
            {strategies.length === 0 && (
              <p className="text-xs text-text-muted text-center py-3">{emptyText}</p>
            )}
          </div>

          <div className="border-t border-border-primary">
            {adding ? (
              <div className="flex items-center gap-1 p-2">
                <input
                  ref={inputRef}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
                  className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
                  placeholder={inputPlaceholder}
                />
                <button type="button" onClick={handleAddCustom}
                  className="p-1.5 rounded-lg bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 cursor-pointer">
                  <Plus className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => { setAdding(false); setCustom(''); }}
                  className="p-1.5 rounded-lg text-text-muted hover:text-loss cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex-1 flex items-center gap-1 px-3 py-2 text-sm text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {addLabel}
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => setManaging(true)}
                    className="px-3 py-2 text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border-r border-border-primary"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs text-text-muted mb-1">{label}</label>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`${inputClass} flex items-center justify-between cursor-pointer`}
      >
        <span className={`truncate ${value ? 'text-text-primary' : 'text-text-muted'}`}>{displayText}</span>
        <svg className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {menu}
    </div>
  );
}
