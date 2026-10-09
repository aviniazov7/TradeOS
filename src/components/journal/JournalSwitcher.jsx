import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, BookOpen, Star, Archive, ArchiveRestore, Trash2, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useJournalContext } from '../../contexts/JournalContext';
import { useAuth } from '../../contexts/AuthContext';
import { exchangeLabel, FREE_LIMITS } from '../../utils/constants';
import ExchangeLogo from '../shared/ExchangeLogo';
import JournalFormModal from './JournalFormModal';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';

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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary hover:border-border-hover transition-colors cursor-pointer"
          >
            {activeJournal?.exchange ? (
              <ExchangeLogo exchange={activeJournal.exchange} size="w-3.5 h-3.5" />
            ) : activeJournal?.assetClass === 'stocks' ? (
              <Briefcase className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
            ) : (
              <BookOpen className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
            )}
            <span className="truncate max-w-[220px] md:max-w-[360px] text-text-primary font-semibold">{activeJournal?.name || 'יומן'}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute top-full right-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-bg-overlay border border-border-primary rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
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
                      {j.exchange ? (
                        <ExchangeLogo exchange={j.exchange} size="w-4 h-4" />
                      ) : j.assetClass === 'stocks' ? (
                        <Briefcase className="w-3.5 h-3.5 flex-shrink-0 text-emerald-300" />
                      ) : (
                        <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
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
            </div>
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
                  {j.exchange ? (
                    <ExchangeLogo exchange={j.exchange} size="w-5 h-5" />
                  ) : (
                    <BookOpen className="w-5 h-5 text-text-muted flex-shrink-0" />
                  )}
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
            {j.exchange ? (
              <ExchangeLogo exchange={j.exchange} size="w-3.5 h-3.5" />
            ) : (
              <BookOpen className="w-3.5 h-3.5" />
            )}
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
