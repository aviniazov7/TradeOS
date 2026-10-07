import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBacktestContext } from '../../contexts/BacktestContext';
import BacktestFormModal from './BacktestFormModal';

export default function BacktestSwitcher({ compact }) {
  const { journals, activeJournal, activeJournalId, setActiveJournalId, addJournal } = useBacktestContext();
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
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

  // Compact mode: dropdown trigger
  if (compact) {
    return (
      <>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary hover:border-border-hover transition-colors cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
            <span className="truncate max-w-[220px] md:max-w-[360px] text-text-primary font-semibold">{activeJournal?.name || 'בקטסט'}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute top-full right-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-bg-overlay border border-border-primary rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                {journals.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => { setActiveJournalId(j.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer text-right ${
                      j.id === activeJournalId ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{j.name}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-border-primary">
                <button
                  onClick={() => { setFormOpen(true); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  יומן בקטסט חדש
                </button>
              </div>
            </div>
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
