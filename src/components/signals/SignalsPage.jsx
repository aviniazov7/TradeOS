import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Radar, Flag, Bell, ChevronDown } from 'lucide-react';
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

// The three-step "how it works" — the whole point is that the user does NOTHING
// manually: they tag coins in the watchlist and the engine does the rest.
const STEPS = [
  { icon: Flag, text: 'תייג מטבע בלונג או שורט ברשימת המעקב (הדגל בצד).' },
  { icon: Radar, text: 'הסורק בודק אותו כל 10 דקות ומחפש כניסת LPS / LPSY.' },
  { icon: Bell, text: 'כשנוצר סטאפ — מקבל התראה, והוא מופיע כאן עם סטופ ומחיר.' },
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
  const [helpOpen, setHelpOpen] = useState(true);

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
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-primary/30 to-accent-primary/5 ring-1 ring-accent-primary/25 flex items-center justify-center">
            <Radar className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-text-primary tracking-tight">סורק סטאפים</h1>
            <p className="text-[11px] text-text-muted">זיהוי אוטומטי של סטאפי ויקוף (LPS / LPSY)</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingSignal(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          title="הוסף סטאפ ידנית למעקב"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">הוסף ידנית</span>
        </button>
      </div>

      {/* How it works — collapsible explainer */}
      <div className="rounded-2xl border border-border-primary bg-bg-secondary/40 overflow-hidden mb-4">
        <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #2563eb, #38bdf8, transparent)' }} />
        <button
          onClick={() => setHelpOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          aria-expanded={helpOpen}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Radar className="w-4 h-4 text-accent-primary" /> איך הסורק עובד
            <span className="text-[10px] font-normal text-text-muted">· אתה לא ממלא כלום, הכול אוטומטי</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
        </button>
        <motion.div
          initial={false}
          animate={{ height: helpOpen ? 'auto' : 0, opacity: helpOpen ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {STEPS.map((s, i) => (
                <div key={s.text} className="rounded-xl bg-bg-tertiary/40 border border-border-primary/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-5 h-5 rounded-md bg-accent-primary/15 text-accent-primary text-[11px] font-bold flex items-center justify-center num-mono">{i + 1}</span>
                    <s.icon className="w-3.5 h-3.5 text-accent-primary" />
                  </div>
                  <p className="text-[11px] text-text-secondary leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/watchlist')}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)' }}
            >
              <Flag className="w-3.5 h-3.5" /> תייג מטבעות לסריקה
            </button>
          </div>
        </motion.div>
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
          description="תייג מטבעות בלונג/שורט ברשימת המעקב — והסורק יזהה עבורך סטאפי כניסה (LPS/LPSY) אוטומטית, וישלח התראה."
          action={
            tab === 'all' && (
              <button
                onClick={() => navigate('/watchlist')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)' }}
              >
                <Flag className="w-4 h-4" /> תייג מטבעות לסריקה
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
        title="מחיקת סטאפ"
        message="למחוק את הסטאפ? לא ניתן לבטל פעולה זו."
      />
    </motion.div>
  );
}
