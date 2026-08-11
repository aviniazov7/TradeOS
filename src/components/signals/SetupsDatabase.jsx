import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Plus, Pencil, Trash2, ExternalLink, TrendingUp, TrendingDown, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWyckoffSetups } from '../../hooks/useWyckoffSetups';
import CoinIcon from '../shared/CoinIcon';
import ConfirmDialog from '../shared/ConfirmDialog';
import MarkSetupModal from './MarkSetupModal';
import { safeHttpUrl } from '../../utils/urls';

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Stat({ label, value, tone }) {
  const color = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-primary min-w-[64px]">
      <span className={`text-base font-extrabold num-mono leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-text-muted mt-1">{label}</span>
    </div>
  );
}

// One labeled setup row — reads like a ledger line: coin, direction, verdict,
// levels, when, and where it came from (owner-marked vs scanner-detected).
function SetupRow({ s, onEdit, onDelete }) {
  const isLong = s.direction === 'long';
  const isValid = s.label !== 'invalid';
  const chart = safeHttpUrl(s.chartUrl);
  const date = fmtDate(s.at) || fmtDate(s.createdAt);
  return (
    <motion.div
      layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary hover:border-accent-primary/30 transition-colors"
    >
      <CoinIcon pair={s.pair} className="w-7 h-7 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-text-primary" dir="ltr">{s.pair}</span>
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
            {isLong ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}{isLong ? 'LPS' : 'LPSY'}
          </span>
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${isValid ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
            {isValid ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}{isValid ? 'תקין' : 'לא תקין'}
          </span>
          {s.source === 'scanner' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">סורק</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted num-mono">
          <span>{s.timeframe || '30m'}</span>
          {s.entry != null && <span dir="ltr">כניסה {s.entry}</span>}
          {s.stop != null && <span dir="ltr">סטופ {s.stop}</span>}
          {date && <span>· {date}</span>}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {chart && (
          <a href={chart} target="_blank" rel="noopener noreferrer" title="פתח צ׳ארט"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={() => onEdit(s)} title="עריכה"
          className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(s)} title="מחיקה"
          className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// The labeled-setups database section: the owner's ground-truth of real
// LPS/LPSY entries. This is what the scanner is measured and (later) trained
// against — mark the setups you'd take (and the ones you wouldn't).
export default function SetupsDatabase() {
  const { setups, loading, addSetup, updateSetup, deleteSetup } = useWyckoffSetups();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const stats = useMemo(() => ({
    total: setups.length,
    valid: setups.filter((s) => s.label !== 'invalid').length,
    invalid: setups.filter((s) => s.label === 'invalid').length,
  }), [setups]);

  const sorted = useMemo(() => {
    const key = (s) => {
      const d = s.at?.toDate ? s.at.toDate() : s.at ? new Date(s.at) : s.createdAt?.toDate ? s.createdAt.toDate() : null;
      return d ? d.getTime() : 0;
    };
    return [...setups].sort((a, b) => key(b) - key(a));
  }, [setups]);

  const handleSave = async (data) => {
    if (editing) await updateSetup(editing.id, data);
    else await addSetup(data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSetup(deleteTarget.id);
      toast.success('הסטאפ נמחק מהמאגר');
    } catch {
      toast.error('שגיאה במחיקה');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-accent-primary/12 flex items-center justify-center shrink-0">
            <Database className="w-3.5 h-3.5 text-accent-primary" />
          </span>
          <h2 className="text-sm font-bold text-text-primary shrink-0">מאגר הסטאפים שלי</h2>
          <span className="text-[11px] text-text-muted truncate">— הבסיס שהסורק נמדד ולומד ממנו</span>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm font-bold hover:brightness-110 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">סמן סטאפ</span>
        </button>
      </div>

      {/* Stats strip */}
      {stats.total > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Stat label="סה״כ" value={stats.total} />
          <Stat label="תקינים" value={stats.valid} tone="profit" />
          <Stat label="לא תקינים" value={stats.invalid} tone="loss" />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-secondary animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border border-dashed border-border-primary text-text-muted hover:text-accent-primary hover:border-accent-primary/40 transition-colors cursor-pointer"
        >
          <Database className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">אין עדיין סטאפים במאגר</span>
          <span className="text-[11px]">סמן סטאפ אמיתי (LPS/LPSY) — כך הסורק לומד מה נחשב כניסה טובה עבורך</span>
        </button>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sorted.map((s) => (
              <SetupRow key={s.id} s={s} onEdit={(x) => { setEditing(x); setModalOpen(true); }} onDelete={setDeleteTarget} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <MarkSetupModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        setup={editing}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת סטאפ מהמאגר"
        message="למחוק את הסטאפ מהמאגר? לא ניתן לבטל."
      />
    </section>
  );
}
