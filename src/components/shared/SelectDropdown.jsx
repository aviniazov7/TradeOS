import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';

const isOptionRow = (o) => !!o && !o.header && o.value != null;

function stepSelectable(opts, from, dir) {
  const idxs = [];
  opts.forEach((o, i) => { if (isOptionRow(o)) idxs.push(i); });
  if (!idxs.length) return 0;
  if (dir === 'home') return idxs[0];
  if (dir === 'end') return idxs[idxs.length - 1];
  const pos = idxs.indexOf(from);
  const base = pos < 0 ? (dir < 0 ? idxs.length : -1) : pos;
  return idxs[Math.min(idxs.length - 1, Math.max(0, base + dir))];
}

/**
 * SelectDropdown - custom dropdown replacement for native <select>.
 *
 * The menu is rendered in a portal with a backdrop so it always floats above
 * page content — animated lists (framer-motion transforms) create their own
 * stacking contexts that would otherwise paint over an absolutely-positioned
 * menu.
 *
 * Props:
 *   value       - string, current selected value
 *   onChange     - (value: string) => void
 *   options      - Array<{ value: string, label: string } | { header: string }>
 *                  Header rows are section labels (not selectable).
 *   placeholder  - string, shown when no value selected
 *   label        - optional label text
 *   allowClear   - boolean, show clear option (default false)
 *   compact      - boolean, smaller size for inline/filter use (default false)
 *   className        - optional extra classes for the root wrapper
 *   triggerClassName - optional extra classes for the trigger button (e.g. h-full
 *                      to match sibling buttons when inlined in an action row)
 *   id               - optional id for the trigger (label htmlFor)
 *   ariaLabel        - accessible name when there is no visible `label`
 */
export default function SelectDropdown({ value, onChange, options = [], placeholder = 'בחר...', label, allowClear = false, compact = false, className = '', triggerClassName = '', id, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef(null);
  const activeRef = useRef(0);
  const optionsRef = useRef(options);
  const onChangeRef = useRef(onChange);
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const reactId = useId();
  const buttonId = id || reactId;
  const listId = `${buttonId}-list`;
  const labelId = `${buttonId}-label`;

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Open upward when there isn't enough room below the trigger.
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 240 && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? null : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.max(140, (openUp ? r.top : spaceBelow) - 16),
    });
  };

  useLayoutEffect(() => {
    if (open) updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const selectedOption = options.find((o) => isOptionRow(o) && o.value === value);
  const displayText = selectedOption?.label || placeholder;
  const hasValue = !!value;

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    btnRef.current?.focus();
  };

  const openMenu = () => {
    const opts = optionsRef.current;
    const idx = opts.findIndex((o) => isOptionRow(o) && o.value === value);
    const next = idx >= 0 ? idx : stepSelectable(opts, -1, 1);
    activeRef.current = next;
    setActive(next);
    setOpen(true);
  };

  // Arrows, Home/End and Enter work while the menu is open even if focus sits
  // on an option. Escape stops here so a dropdown inside a dialog does not
  // close the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const opts = optionsRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setActive((i) => {
          const dir = e.key === 'Home' ? 'home' : e.key === 'End' ? 'end' : e.key === 'ArrowDown' ? 1 : -1;
          const n = stepSelectable(opts, i, dir);
          activeRef.current = n;
          return n;
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const opt = opts[activeRef.current];
        if (isOptionRow(opt)) {
          onChangeRef.current?.(opt.value);
          setOpen(false);
          btnRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const el = document.getElementById(`${listId}-opt-${active}`);
    try { el?.scrollIntoView({ block: 'nearest' }); } catch { /* happy-dom */ }
    return undefined;
  }, [open, active, listId]);

  const onTriggerKey = (e) => {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  };

  const btnClass = compact
    ? 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary transition-colors text-right flex items-center justify-between cursor-pointer'
    : 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors text-right flex items-center justify-between cursor-pointer';

  const itemClass = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`relative ${className}`}>
      {label && <label id={labelId} htmlFor={buttonId} className="block text-xs text-text-muted mb-1">{label}</label>}
      <button
        ref={btnRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKey}
        className={`${btnClass} ${triggerClassName}`}
      >
        <span
          dir={selectedOption?.dir === 'ltr' ? 'ltr' : undefined}
          className={`min-w-0 truncate whitespace-nowrap text-right ${hasValue ? 'text-text-primary' : 'text-text-muted'}`}
        >{displayText}</span>
        <svg className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform mr-1 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bg-bg-overlay border border-border-primary rounded-xl shadow-xl overflow-hidden"
            style={{ left: pos.left, width: pos.width, top: pos.top ?? undefined, bottom: pos.bottom ?? undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            <div id={listId} role="listbox" aria-label={ariaLabel || label || placeholder} className="overflow-y-auto" style={{ maxHeight: pos.maxHeight }}>
              {allowClear && hasValue && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className={`w-full flex items-center px-3 py-2 ${itemClass} text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer text-right`}
                >
                  {placeholder}
                </button>
              )}
              {options.map((o, i) => {
                if (o.header) {
                  return (
                    <div key={`hdr-${i}`} role="presentation" className={`px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-text-muted sticky top-0 bg-bg-overlay ${i === 0 ? '' : 'border-t border-border-primary mt-1'}`}>
                      {o.header}
                    </div>
                  );
                }
                const selected = value === o.value;
                const highlighted = i === active;
                return (
                  <button
                    key={o.value}
                    id={`${listId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => { activeRef.current = i; setActive(i); }}
                    onClick={() => handleSelect(o.value)}
                    className={`w-full flex items-center px-3 py-2 ${itemClass} transition-colors cursor-pointer text-right ${
                      selected ? 'bg-accent-primary/10 text-accent-primary font-medium'
                        : highlighted ? 'bg-bg-tertiary text-text-primary'
                        : 'text-text-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <span
                      dir={o.dir === 'ltr' ? 'ltr' : undefined}
                      className="min-w-0 flex-1 truncate whitespace-nowrap text-right"
                    >{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
