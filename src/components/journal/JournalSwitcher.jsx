import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Star, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { exchangeLabel, FREE_LIMITS, getExchangeLogo } from '../../utils/constants';
import { anchoredMenuBox } from '../../utils/menuPosition';
import ExchangeLogo from '../shared/ExchangeLogo';
import JournalFormModal from './JournalFormModal';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';

function journalLetter(name) {
  return Array.from(String(name || '').trim())[0] || '?';
}

// A real exchange mark only when getExchangeLogo resolves one. No venue,
// "other", or an unknown id gets the journal name's first letter — never a
// default Bybit / MEXC / Binance tile.
function JournalMark({ journal, size = 'w-5 h-5' }) {
  const exchange = journal?.exchange;
  const logo = exchange ? getExchangeLogo(exchange) : null;
  if (logo) {
    return <ExchangeLogo exchange={exchange} size={size} badge={journal?.name} />;
  }
  return (
    <span
      data-testid="journal-letter"
      className={`${size} rounded-full bg-accent-primary/20 text-accent-primary inline-flex items-center justify-center text-[13px] font-extrabold leading-none shrink-0`}
      aria-hidden="true"
    >
      {journalLetter(journal?.name)}
    </span>
  );
}

export default function JournalSwitcher({ compact }) {
  const { journals, archivedJournals, activeJournal, activeJournalId, setActiveJournalId, addJournal, toggleStarJournal, unarchiveJournal, deleteJournal } = useJournalContext();
  const { isPremium, profile } = useAuth();
  const defaultAssetClass = profile?.settings?.assetClasses?.[0] || 'crypto';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const [menuBox, setMenuBox] = useState(null);

  const placeMenu = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuBox(anchoredMenuBox(rect, window.innerWidth));
  }, []);

  // Free tier caps the number of journals; premium is unlimited.
  const openNewJournal = () => {
    setOpen(false);
    if (!isPremium && journals.length >= FREE_LIMITS.journals) {
      toast.error(`במסלול החינמי אפשר עד ${FREE_LIMITS.journals} יומנים. שדרג ל-Premium ליומנים ללא הגבלה.`);
      navigate('/premium');
      return;
    }
    setFormOpen(true);
  };

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
      toast.success('היומן נוצר');
    } catch (err) {
      if (err.code === 'free-limit') {
        toast.error(`במסלול החינמי אפשר עד ${FREE_LIMITS.journals} יומנים. שדרג ל-Premium ליומנים ללא הגבלה.`);
        navigate('/premium');
        return;
      }
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה ליצור יומן' : 'שגיאה ביצירת היומן — נסה שוב');
    }
  };

  const handleRestore = async (journalId) => {
    try {
      await unarchiveJournal(journalId);
      toast.success('היומן שוחזר');
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה לשחזר יומן' : 'שגיאה בשחזור — נסה שוב');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteJournal(deleteTarget);
      toast.success('היומן נמחק לצמיתות');
      setDeleteTarget(null);
      if (archivedJournals.length <= 1) setArchiveOpen(false);
    } catch (err) {
      toast.error(err.code === 'permission-denied' ? 'אין הרשאה למחוק יומן' : 'שגיאה במחיקה — נסה שוב');
    }
  };

  if (!journals.length) return null;

  // Compact mode: dropdown trigger showing active journal
  if (compact) {
    return (
      <>
        <div className="relative min-w-0 max-w-full" ref={dropdownRef}>
          <button
            ref={btnRef}
            type="button"
            onClick={() => { if (!open) placeMenu(); setOpen(!open); }}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="h-8 md:h-9 max-w-full min-w-0 inline-flex items-center gap-1.5 px-2 md:px-3 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary hover:border-border-hover transition-colors cursor-pointer"
          >
            <JournalMark journal={activeJournal} size="w-5 h-5" />
            <span className="truncate min-w-0 md:max-w-[360px] text-text-primary font-semibold">{activeJournal?.name || 'יומן'}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && menuBox && createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="יומנים"
              dir="rtl"
              data-testid="journal-switcher-menu"
              className="fixed z-[80] bg-bg-overlay border border-border-primary rounded-xl shadow-lg overflow-hidden"
              style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width, maxWidth: 'calc(100vw - 16px)' }}
            >
              <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
                {journals.map((j) => (
                  <div
                    key={j.id}
                    className={`flex items-center gap-1 px-3 py-2.5 text-sm transition-colors text-right ${
                      j.id === activeJournalId ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <button
                      onClick={() => { setActiveJournalId(j.id); setOpen(false); }}
                      className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                    >
                      <JournalMark journal={j} size="w-5 h-5" />
                      <span className="truncate">{j.name}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStarJournal(j.id); }}
                      className="p-0.5 rounded cursor-pointer flex-shrink-0"
                    >
                      <Star className={`w-3.5 h-3.5 ${j.starred ? 'fill-amber-400 text-amber-400' : 'text-text-muted hover:text-amber-400'}`} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-border-primary">
                <button
                  onClick={openNewJournal}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  יומן חדש
                </button>
              </div>
              {archivedJournals.length > 0 && (
                <div className="border-t border-border-primary">
                  <button
                    onClick={() => { setArchiveOpen(true); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 text-amber-500" />
                    <span>ארכיון ({archivedJournals.length})</span>
                  </button>
                </div>
              )}
            </div>,
            document.body,
          )}
        </div>

        <JournalFormModal
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          defaultAssetClass={defaultAssetClass}
        />

        <Modal isOpen={archiveOpen} onClose={() => setArchiveOpen(false)} title="ארכיון יומנים" maxWidth="max-w-sm">
          {archivedJournals.length > 0 ? (
            <div className="space-y-2">
              {archivedJournals.map((j) => (
                <div key={j.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary border border-border-primary">
                  <JournalMark journal={j} size="w-5 h-5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{j.name}</p>
                    {exchangeLabel(j.exchange) && <p className="text-[10px] text-text-muted">{exchangeLabel(j.exchange)}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleRestore(j.id)}
                      className="p-2 rounded-lg hover:bg-bg-secondary transition-colors cursor-pointer"
                      title="שחזור"
                    >
                      <ArchiveRestore className="w-4 h-4 text-amber-500" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(j.id)}
                      className="p-2 rounded-lg hover:bg-loss/10 transition-colors cursor-pointer"
                      title="מחיקה לצמיתות"
                    >
                      <Trash2 className="w-4 h-4 text-loss" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">אין יומנים בארכיון</p>
          )}
        </Modal>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="מחיקת יומן לצמיתות"
          message="כל העסקאות ביומן הזה יימחקו לצמיתות. לא ניתן לבטל פעולה זו."
          confirmText="מחק לצמיתות"
          confirmColor="loss"
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
            {j.starred && <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />}
            <JournalMark journal={j} size="w-4 h-4" />
            <span className="truncate max-w-[100px] md:max-w-[140px]">{j.name}</span>
          </button>
        ))}
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-accent-primary bg-bg-tertiary border border-dashed border-accent-primary/30 hover:bg-accent-primary/5 transition-colors cursor-pointer flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <JournalFormModal
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          defaultAssetClass={defaultAssetClass}
        />
    </>
  );
}
