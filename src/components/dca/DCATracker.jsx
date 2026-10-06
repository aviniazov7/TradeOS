import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Coins, Download, List, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDCA } from '../../hooks/useDCA';
import { useCryptoPrices } from '../../hooks/useCryptoPrices';
import DCACard from './DCACard';
import DCAForm from './DCAForm';
import DCAAnalytics from './DCAAnalytics';
import ConfirmDialog from '../shared/ConfirmDialog';
import EmptyState from '../shared/EmptyState';
import DCASkeleton from './DCASkeleton';
import { pageVariants, pageTransition } from '../../utils/animations';
import TabStrip from '../shared/TabStrip';
import { formatNumber, formatPrice, formatCurrency, formatPercent } from '../../utils/formatters';
import { COINS, DCA_FREQUENCY_LABELS, DCA_STATUS_LABELS } from '../../utils/constants';

export default function DCATracker() {
  const { dcaPlans, loading, addPlan, addEntry, updatePlan, deletePlan } = useDCA();
  const coinSymbols = [...new Set(dcaPlans.map((p) => p.coin))];
  const extraCoins = dcaPlans
    .filter((p) => p.coingeckoId && !COINS.find((c) => c.symbol === p.coin))
    .map((p) => ({ symbol: p.coin, coingeckoId: p.coingeckoId }));
  const { prices } = useCryptoPrices({ symbols: coinSymbols, extraCoins, enabled: coinSymbols.length > 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tab, setTab] = useState('plans');

  const handleSave = async (data) => {
    try {
      if (editingPlan) {
        await updatePlan(editingPlan.id, data);
        toast.success('התוכנית עודכנה');
      } else {
        await addPlan(data);
        toast.success('תוכנית DCA נוצרה');
      }
    } catch (error) {
      console.error('Save DCA plan failed:', error);
      toast.error('שגיאה בשמירת התוכנית');
    }
  };

  const handleEdit = (plan) => {
    setEditingPlan(plan);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePlan(deleteTarget.id);
      toast.success('התוכנית נמחקה');
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete DCA plan failed:', error);
      toast.error('שגיאה במחיקת התוכנית');
    }
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingPlan(null);
  };

  const exportCSV = () => {
    if (!dcaPlans.length) return;
    const headers = ['מטבע', 'סטטוס', 'תדירות', 'סכום לרכישה', 'סה״כ מושקע', 'כמות מטבעות', 'מחיר ממוצע', 'רכישות'];
    const rows = dcaPlans.map((p) => [
      p.coin, DCA_STATUS_LABELS[p.status] || p.status, DCA_FREQUENCY_LABELS[p.frequency] || p.frequency,
      p.amountPerEntry || '', p.totalInvested || 0, p.totalCoins || 0, p.avgPrice || 0, (p.entries || []).length,
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dca_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  };

  if (loading) return <DCASkeleton />;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      {/* Top Navigation Bar. backdrop-filter force-disabled (same as journal +
          backtest toolbars) — a translucent blur panel at the top of the page
          has nothing behind it to frost and produced a faint glass-band/hover
          flicker. The bg-bg-secondary fill keeps it identical in both themes. */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5 space-y-2" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
        {/* Row 1: Title + Tabs + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 md:gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Coins className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-bold text-text-primary">מעקב DCA</span>
            </div>
            <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
            {/* Desktop tabs */}
            <div className="hidden md:block">
              <TabStrip tabs={[{ id: 'plans', label: 'תוכניות', count: dcaPlans.length }, { id: 'summary', label: 'ניתוחים' }]} value={tab} onChange={setTab} layoutKey="dca-tab" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {dcaPlans.length > 0 && (
              <button onClick={exportCSV} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer border border-border-primary" title="ייצוא CSV">
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setFormOpen(true)} className="h-9 inline-flex items-center gap-1.5 text-accent-primary border border-accent-primary/40 font-semibold px-3.5 rounded-lg hover:bg-accent-primary/10 transition-colors cursor-pointer text-sm">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">תוכנית חדשה</span>
            </button>
          </div>
        </div>

        {/* Row 2: Mobile tabs */}
        <div className="md:hidden">
          <TabStrip tabs={[{ id: 'plans', label: 'תוכניות', count: dcaPlans.length }, { id: 'summary', label: 'ניתוחים' }]} value={tab} onChange={setTab} variant="mobile" layoutKey="dca-tab" />
        </div>
      </div>

      {/* Tab: Plans */}
      {tab === 'plans' && (
        <>
          {dcaPlans.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="אין תוכניות DCA עדיין"
              description="צור תוכנית Dollar Cost Averaging למעקב אחר ההשקעות שלך"
              action={
                <button onClick={() => setFormOpen(true)}
                  className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
                  צור תוכנית ראשונה
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dcaPlans.map((plan) => (
                <DCACard
                  key={plan.id}
                  plan={plan}
                  onAddEntry={addEntry}
                  onEdit={handleEdit}
                  onDelete={setDeleteTarget}
                  currentPrice={prices[plan.coin]?.price || null}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Analytics */}
      {tab === 'summary' && (
        dcaPlans.length === 0 ? (
          <EmptyState icon={Coins} title="אין נתונים לניתוח" description="צור תוכניות DCA כדי לראות ניתוחים מפורטים"
            actionLabel="צור תוכנית DCA" onAction={() => { setTab('plans'); setEditingPlan(null); setFormOpen(true); }} />
        ) : (
          <DCAAnalytics plans={dcaPlans} prices={prices} />
        )
      )}

      {/* Create/Edit form modal */}
      <DCAForm isOpen={formOpen} onClose={handleCloseForm} plan={editingPlan} onSave={handleSave} />

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת תוכנית DCA"
        message={`למחוק את תוכנית ה-DCA של ${deleteTarget?.coin}? לא ניתן לבטל פעולה זו.`}
      />
    </motion.div>
  );
}
