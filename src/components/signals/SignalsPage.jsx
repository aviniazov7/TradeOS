import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Radar, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSignals } from '../../hooks/useSignals';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import WatchlistPage from '../watchlist/WatchlistPage';
import ScannerHero from './ScannerHero';
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

// One page, one flow: the top half is the scan universe (tag coins long/short),
// the bottom half is the setups the engine detected for them. The old separate
// "watchlist" page is folded in here (embedded) so there's a single place to work.
export default function SignalsPage() {
  const { signals, loading, addSignal, updateSignal, deleteSignal } = useSignals();
  const { items: watchItems } = useWatchlist();
  const { prices } = useCryptoPrices();
  const taggedCount = watchItems.filter((i) => i.bias === 'long' || i.bias === 'short').length;

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
        toast.success('הסטאפ עודכן');
      } else {
        await addSignal(data);
        toast.success('הסטאפ נוסף');
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
      toast.success('הסטאפ נמחק');
      setDeleteTarget(null);
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateSignal(id, { status });
      toast.success(status === 'active' ? 'הסטאפ הופעל' : 'הסטאפ עודכן');
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-5xl mx-auto">
      {/* Premium scanner hero — true-black card, live radar sweep, uniform chips */}
      <ScannerHero taggedCount={taggedCount} activeCount={counts.active} />

      {/* ── Section 1: the scan universe (tag coins long/short) ── */}
      <section className="mb-7">
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="w-6 h-6 rounded-lg bg-accent-primary/12 flex items-center justify-center shrink-0">
            <Flag className="w-3.5 h-3.5 text-accent-primary" />
          </span>
          <h2 className="text-sm font-bold text-text-primary">המטבעות שאני סורק</h2>
          <span className="text-[11px] text-text-muted">— תייג לונג/שורט, השאר עלינו</span>
        </div>
        <WatchlistPage embedded />
      </section>

      {/* ── Section 2: detected setups ── */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg bg-accent-primary/12 flex items-center justify-center shrink-0">
              <Radar className="w-3.5 h-3.5 text-accent-primary" />
            </span>
            <h2 className="text-sm font-bold text-text-primary">סטאפים שאותרו</h2>
          </div>
          <button
            onClick={() => { setEditingSignal(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
            title="הוסף סטאפ ידנית למעקב"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">הוסף ידנית</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 mb-4 overflow-x-auto">
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

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-bg-secondary rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Radar}
            title={tab === 'all' ? 'אין סטאפים עדיין' : `אין סטאפים ב${TABS.find((t) => t.key === tab)?.label}`}
            description="תייג מטבעות למעלה בלונג/שורט — והסורק יזהה עבורך סטאפי כניסה (LPS/LPSY) אוטומטית, וישלח התראה ברגע שהמדרגה השנייה נשברת."
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
                    onStatusChange={handleStatusChange}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

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
        title="מחיקת סטאפ"
        message="למחוק את הסטאפ? לא ניתן לבטל פעולה זו."
      />
    </motion.div>
  );
}
