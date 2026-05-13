import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSignals } from '../../hooks/useSignals';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import SignalCard from './SignalCard';
import SignalForm from './SignalForm';
import ConfirmDialog from '../shared/ConfirmDialog';
import EmptyState from '../shared/EmptyState';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';

const TABS = [
  { key: 'all',     label: 'הכל' },
  { key: 'waiting', label: 'ממתין' },
  { key: 'active',  label: 'פעיל' },
  { key: 'closed',  label: 'הושלם' },
];

function getCoinFromPair(pair = '') {
  return pair.replace(/USDT$|BUSD$|USDC$|USD$/, '').toUpperCase();
}

export default function SignalsPage() {
  const { signals, loading, addSignal, updateSignal, deleteSignal } = useSignals();
  const { prices } = useCryptoPrices();
  const navigate = useNavigate();

  const [tab, setTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSignal, setEditingSignal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = tab === 'all' ? signals : signals.filter((s) => s.status === tab);
  const counts = {
    all: signals.length,
    waiting: signals.filter((s) => s.status === 'waiting').length,
    active:  signals.filter((s) => s.status === 'active').length,
    closed:  signals.filter((s) => s.status === 'closed').length,
  };

  const handleSave = async (data) => {
    try {
      if (editingSignal) {
        await updateSignal(editingSignal.id, data);
        toast.success('הסיגנל עודכן');
      } else {
        await addSignal(data);
        toast.success('הסיגנל נוסף');
      }
      setFormOpen(false);
      setEditingSignal(null);
    } catch {
      toast.error('שגיאה בשמירה');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSignal(deleteTarget);
      toast.success('הסיגנל נמחק');
      setDeleteTarget(null);
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateSignal(id, { status });
      toast.success(status === 'active' ? 'הסיגנל הופעל' : 'הסיגנל עודכן');
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  const handleTransfer = (signal) => {
    const params = new URLSearchParams({
      action: 'signal',
      pair: signal.pair || '',
      direction: signal.direction || 'long',
      entryPrice: signal.entryPrice ?? '',
      stopLoss: signal.stopLoss ?? '',
      timeframe: signal.timeframe || '',
    });
    navigate(`/journal?${params.toString()}`);
    handleStatusChange(signal.id, 'closed');
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Header bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 md:gap-3">
            <h1 className="text-sm md:text-base font-bold text-text-primary whitespace-nowrap">סיגנלים</h1>
            <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
            <div className="hidden md:flex items-center">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    tab === t.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  {t.label} {counts[t.key] > 0 && `(${counts[t.key]})`}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setEditingSignal(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 bg-accent-primary text-bg-primary font-semibold px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer text-xs md:text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">סיגנל חדש</span>
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden flex items-center gap-0.5 mt-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.key ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {t.label} {counts[t.key] > 0 && `(${counts[t.key]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-secondary rounded-2xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={tab === 'all' ? 'אין סיגנלים עדיין' : `אין סיגנלים ב${TABS.find((t) => t.key === tab)?.label}`}
          description="הוסף סיגנל עם מחיר כניסה, סטופ ויעדי רווח — המסלול יזוז בזמן אמת"
          action={
            tab === 'all' && (
              <button
                onClick={() => { setEditingSignal(null); setFormOpen(true); }}
                className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
              >
                הוסף סיגנל ראשון
              </button>
            )
          }
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {filtered.map((signal) => {
            const coin = getCoinFromPair(signal.pair);
            const currentPrice = prices[coin]?.price ?? null;
            return (
              <motion.div key={signal.id}>
                <SignalCard
                  signal={signal}
                  currentPrice={currentPrice}
                  onEdit={(s) => { setEditingSignal(s); setFormOpen(true); }}
                  onDelete={setDeleteTarget}
                  onTransfer={() => handleTransfer(signal)}
                  onStatusChange={handleStatusChange}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <SignalForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingSignal(null); }}
        signal={editingSignal}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת סיגנל"
        message="למחוק את הסיגנל? לא ניתן לבטל פעולה זו."
      />
    </motion.div>
  );
}
