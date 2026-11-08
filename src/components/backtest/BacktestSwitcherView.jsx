import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { anchoredMenuBox } from '../../utils/menuPosition';
import BacktestFormModal from './BacktestFormModal';

// Presentational journal picker. Selection and account isolation stay in
// BacktestSwitcher / BacktestContext — this file does not touch storage.
export default function BacktestSwitcherView({
  compact,
  journals,
  activeJournal,
  activeJournalId,
  setActiveJournalId,
  addJournal,
}) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  const placeMenu = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuBox(anchoredMenuBox(rect, window.innerWidth));
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    const handleClick = (e) => {
      const inTrigger = dropdownRef.current && dropdownRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSave = async (data) => {
    try {
      await addJournal(data);
      toast.success('יומן הבקטסט נוצר');
    } catch {
      toast.error('שגיאה בשמירה');
    }
  };

  if (!journals.length) return null;

  const journalName = activeJournal?.name || 'בקטסט';

  // Compact mode: dropdown trigger beside the page heading.
  // The label sizes to the name. A floor keeps a short Hebrew or English
  // name from collapsing to one glyph inside the RTL flex row; the cap
  // ellipsizes a long name. The menu itself is not inside the label, so
  // overflow on the label cannot clip it.
  if (compact) {
    return (
      <>
        <div className="relative w-max max-w-full" ref={dropdownRef}>
          <button
            ref={btnRef}
            type="button"
            onClick={() => { if (!open) placeMenu(); setOpen(!open); }}
            title={journalName}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="h-9 max-w-full inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary hover:border-border-hover transition-colors cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
            <span
              data-testid="backtest-journal-name"
              dir="auto"
              className="w-max min-w-[4.5rem] max-w-full sm:max-w-[16rem] md:max-w-[22rem] truncate text-start text-text-primary font-semibold"
            >
              {journalName}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && menuBox && createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="יומני בקטסט"
              data-testid="backtest-journal-menu"
              dir="rtl"
              className="fixed z-[80] bg-bg-overlay border border-border-primary rounded-xl shadow-lg overflow-hidden"
              style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width, maxWidth: 'calc(100vw - 16px)' }}
            >
              <div className="max-h-60 overflow-y-auto">
                {journals.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    role="option"
                    aria-selected={j.id === activeJournalId}
                    title={j.name}
                    onClick={() => { setActiveJournalId(j.id); setOpen(false); }}
                    className={`w-full min-w-0 flex items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer text-right ${
                      j.id === activeJournalId ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
                    <span dir="auto" className="truncate min-w-0 text-start">{j.name}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-border-primary">
                <button
                  type="button"
                  onClick={() => { setFormOpen(true); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  יומן בקטסט חדש
                </button>
              </div>
            </div>,
            document.body,
          )}
        </div>

        <BacktestFormModal
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
        />
      </>
    );
  }

  // Full mode: tabs
  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide" ref={dropdownRef}>
        {journals.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => setActiveJournalId(j.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer flex-shrink-0 ${
              j.id === activeJournalId
                ? 'bg-accent-primary/10 text-accent-primary font-medium border border-accent-primary/30'
                : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border-primary hover:border-border-hover'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="truncate max-w-[100px] md:max-w-[140px]">{j.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="h-9 inline-flex items-center gap-1 px-3 rounded-lg text-sm text-accent-primary bg-bg-tertiary border border-dashed border-accent-primary/30 hover:bg-accent-primary/5 transition-colors cursor-pointer flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <BacktestFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}
