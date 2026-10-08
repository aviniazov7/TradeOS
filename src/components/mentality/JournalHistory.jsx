import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Eye, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../shared/Modal';
import { MENTALITY_EMOTIONS, PRE_MARKET_CHECKLIST } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import { SLEEP_OPTIONS, BIAS_OPTIONS, labelOf } from '../../utils/mentalityJournalForm';

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

function getEmotionDisplay(key) {
  const found = MENTALITY_EMOTIONS.find((e) => e.key === key);
  return found ? `${found.emoji} ${found.label}` : key || '-';
}

function getChecklistLabel(key) {
  const found = PRE_MARKET_CHECKLIST.find((c) => c.key === key);
  return found ? found.label : key;
}

function ViewMorningModal({ entry, isOpen, onClose }) {
  if (!entry) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`יומן בוקר - ${formatDate(entry.date)}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted">רגש</span>
            <p className="text-sm text-text-primary">{getEmotionDisplay(entry.emotion)}</p>
          </div>
          <div className="text-left">
            <span className="text-xs text-text-muted">מוכנות</span>
            <p className="text-sm text-accent-primary font-bold">{entry.readinessLevel || '-'}/10</p>
          </div>
        </div>

        {(entry.sleepQuality || entry.marketBias) && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-text-muted">שינה</span>
              <p className="text-sm text-text-primary">{labelOf(SLEEP_OPTIONS, entry.sleepQuality) || '-'}</p>
            </div>
            <div className="text-left">
              <span className="text-xs text-text-muted">הטיית שוק</span>
              <p className="text-sm text-text-primary">{labelOf(BIAS_OPTIONS, entry.marketBias) || '-'}</p>
            </div>
          </div>
        )}

        {entry.keyLevels?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">רמות מפתח</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2">{entry.keyLevels}</p>
          </div>
        )}

        {entry.rulesChecked?.length > 0 && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">
              כללים שהתחייבתי אליהם{entry.rulesTotal ? ` (${entry.rulesChecked.length}/${entry.rulesTotal})` : ''}
            </span>
            <ul className="space-y-1">
              {entry.rulesChecked.map((r) => (
                <li key={r} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-accent-primary mt-0.5">&#x2022;</span>{r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {entry.preMarketChecklist?.length > 0 && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">שגרת פרה-מרקט</span>
            <div className="flex flex-wrap gap-1.5">
              {entry.preMarketChecklist.map((key) => (
                <span key={key} className="text-xs bg-accent-primary/10 text-accent-primary px-2.5 py-1 rounded-lg">
                  {getChecklistLabel(key)}
                </span>
              ))}
            </div>
          </div>
        )}

        {entry.thingsIAppreciate?.some((t) => t?.trim()) && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">דברים שאני מעריך</span>
            <ul className="space-y-1">
              {entry.thingsIAppreciate.filter((t) => t?.trim()).map((t, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-accent-primary mt-0.5">&#x2022;</span>{t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {entry.mainGoal?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">הכוונה להיום</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2">{entry.mainGoal}</p>
          </div>
        )}

        {entry.focusToday?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">פוקוס היום</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2">{entry.focusToday}</p>
          </div>
        )}

        {entry.dailyGoals?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">יעדים יומיים</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.dailyGoals}</p>
          </div>
        )}

        {entry.motivation?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">מוטיבציה ותזכורות</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.motivation}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ViewEveningModal({ entry, isOpen, onClose }) {
  if (!entry) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`יומן ערב - ${formatDate(entry.date)}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted">רגש</span>
            <p className="text-sm text-text-primary">
              {(entry.emotionsAfter?.length ? entry.emotionsAfter : [entry.emotionAfter]).map(getEmotionDisplay).join(' · ')}
            </p>
          </div>
          <div className="text-center">
            <span className="text-xs text-text-muted">עקב אחרי תוכנית</span>
            <p className="text-sm font-medium">{entry.planAdherence === 'partial' ? 'חלקית' : entry.followedPlan === true ? 'כן' : entry.followedPlan === false ? 'לא' : '-'}</p>
          </div>
          <div className="text-left">
            <span className="text-xs text-text-muted">דירוג היום</span>
            <p className="text-sm text-accent-primary font-bold">{entry.dayRating || '-'}/10</p>
          </div>
        </div>

        {entry.planNote?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">הערה על התוכנית</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.planNote}</p>
          </div>
        )}

        {entry.whatWentWell?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">מה הלך טוב</span>
            <p className="text-sm text-text-primary bg-profit/5 border border-profit/10 rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.whatWentWell}</p>
          </div>
        )}

        {entry.whatDidntGoWell?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">מה לא הלך טוב</span>
            <p className="text-sm text-text-primary bg-loss/5 border border-loss/10 rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.whatDidntGoWell}</p>
          </div>
        )}

        {entry.lessonsLearned?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">הלקח למחר</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.lessonsLearned}</p>
          </div>
        )}

        {entry.gratitude?.trim() && (
          <div>
            <span className="text-xs text-text-muted block mb-1">אסיר תודה על</span>
            <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2 whitespace-pre-wrap">{entry.gratitude}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function JournalHistory({ entries, type, onDeleteEntry }) {
  const [viewEntry, setViewEntry] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId || !onDeleteEntry) return;
    setDeleting(true);
    try {
      await onDeleteEntry(deleteId);
      toast.success('רשומה נמחקה');
    } catch (err) {
      console.error(err);
      toast.error('שגיאה במחיקה');
    }
    setDeleting(false);
    setDeleteId(null);
  };

  if (!entries || entries.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
        <Calendar className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-text-secondary text-sm">אין רשומות עדיין</p>
        <p className="text-text-muted text-xs mt-1">הרשומות שתשמור יופיעו כאן</p>
      </div>
    );
  }

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            variants={itemVariants}
            className="bg-bg-secondary border border-border-primary rounded-xl p-4 flex items-center justify-between hover:border-border-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center text-lg">
                {type === 'morning'
                  ? getEmotionDisplay(entry.emotion).split(' ')[0]
                  : getEmotionDisplay(entry.emotionAfter).split(' ')[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{formatDate(entry.date)}</span>
                  {type === 'morning' && entry.readinessLevel && (
                    <span className="text-xs text-text-muted">מוכנות: {entry.readinessLevel}/10</span>
                  )}
                  {type === 'evening' && entry.dayRating && (
                    <span className="text-xs text-text-muted">דירוג: {entry.dayRating}/10</span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">
                  {type === 'morning'
                    ? getEmotionDisplay(entry.emotion)
                    : getEmotionDisplay(entry.emotionAfter)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewEntry(entry)}
                className="flex items-center gap-1 text-xs text-accent-primary hover:text-accent-hover transition-colors px-3 py-1.5 rounded-lg bg-accent-primary/10"
              >
                <Eye className="w-3.5 h-3.5" />
                צפה
              </button>
              <button
                onClick={() => setDeleteId(entry.id)}
                className="flex items-center gap-1 text-xs text-loss hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg bg-loss/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* View Modal */}
      {type === 'morning' ? (
        <ViewMorningModal entry={viewEntry} isOpen={!!viewEntry} onClose={() => setViewEntry(null)} />
      ) : (
        <ViewEveningModal entry={viewEntry} isOpen={!!viewEntry} onClose={() => setViewEntry(null)} />
      )}

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="מחיקת רשומה" maxWidth="max-w-sm">
        <p className="text-sm text-text-secondary mb-4">האם אתה בטוח שברצונך למחוק את הרשומה הזו? פעולה זו לא ניתנת לביטול.</p>
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 bg-loss text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? 'מוחק...' : 'מחק'}
          </button>
          <button
            onClick={() => setDeleteId(null)}
            className="flex-1 bg-bg-tertiary text-text-secondary py-2.5 rounded-lg text-sm font-medium hover:text-text-primary transition-colors"
          >
            ביטול
          </button>
        </div>
      </Modal>
    </>
  );
}
