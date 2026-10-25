import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m } from 'framer-motion';
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
import PageHeader from '../shared/PageHeader';
import TabPanel from '../shared/TabPanel';
import { headerIconBtn, headerPrimaryBtn } from '../shared/headerStyles';
import { COINS, DCA_FREQUENCY_LABELS, DCA_STATUS_LABELS } from '../../utils/constants';
import { downloadCsv } from '../../utils/csv';
import { localDayKey } from '../../utils/calculations';

// `embedded` — rendered inside the Portfolio page, which owns the page header:
// the view ('plans' | 'summary') comes from the Portfolio tabs, and the
// header's buttons reach this component through one-shot URL flags
// (?new=1 opens the form, ?export=1 downloads the CSV) — no second toolbar.
export default function DCATracker({ embedded = false, view }) {
  const { dcaPlans, loading, addPlan, addEntry, updatePlan, deletePlan } = useDCA();
  const coinSymbols = [...new Set(dcaPlans.map((p) => p.coin))];
  const extraCoins = dcaPlans
    .filter((p) => p.coingeckoId && !COINS.find((c) => c.symbol === p.coin))
    .map((p) => ({ symbol: p.coin, coingeckoId: p.coingeckoId }));
  const { prices } = useCryptoPrices({ symbols: coinSymbols, extraCoins, enabled: coinSymbols.length > 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [ownTab, setOwnTab] = useState('plans');
  const tab = embedded && view ? view : ownTab;
  const setTab = setOwnTab;
  const [searchParams, setSearchParams] = useSearchParams();

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
    // Escaped, BOM-prefixed CSV; the file name uses the LOCAL date.
    downloadCsv(`dca_${localDayKey(new Date())}.csv`, headers, rows);
    toast.success('הקובץ הורד');
  };

  // One-shot flags from the Portfolio header (embedded mode).
  const wantsNew = searchParams.get('new') === '1';
  const wantsExport = searchParams.get('export') === '1';
  const clearFlag = (name) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete(name);
    return next;
  }, { replace: true });
  // ?export=1 is an action, not UI state: run it once and drop the flag.
  useEffect(() => {
    if (!embedded || loading || !wantsExport) return;
    if (dcaPlans.length) exportCSV();
    clearFlag('export');
  }, [embedded, loading, wantsExport]); // eslint-disable-line react-hooks/exhaustive-deps
  // ?new=1 opens the create form for as long as the flag is in the URL.
  const formShown = formOpen || (embedded && wantsNew);

  if (loading) return <DCASkeleton />;

  const dcaTabs = [{ id: 'plans', label: 'תוכניות', count: dcaPlans.length }, { id: 'summary', label: 'אנליטיקה' }];
  const dcaActions = (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      {dcaPlans.length > 0 && (
        <button onClick={exportCSV} className={headerIconBtn} title="ייצוא CSV" aria-label="ייצוא CSV">
          <Download className="w-[18px] h-[18px]" />
        </button>
      )}
      <button onClick={() => setFormOpen(true)} className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
        <Plus className="w-4 h-4" /> תוכנית חדשה
      </button>
    </div>
  );

  return (
    <m.div {...(embedded ? {} : { variants: pageVariants, initial: 'initial', animate: 'animate', exit: 'exit', transition: pageTransition })}>
      {embedded ? null : (
        <PageHeader
          icon={Coins}
          title="מעקב DCA"
          subtitle="קניות קבועות לאורך זמן ומה הן שוות היום"
          tabs={{ tabs: dcaTabs, value: tab, onChange: setTab, layoutKey: 'dca-tab' }}
          actions={dcaActions}
        />
      )}

      <TabPanel tabKey={tab}>
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
          <EmptyState icon={Coins} title="אין נתונים לאנליטיקה" description="צור תוכניות DCA כדי לראות אנליטיקה מפורטת"
            actionLabel="צור תוכנית DCA" onAction={() => { setTab('plans'); setEditingPlan(null); setFormOpen(true); }} />
        ) : (
          <DCAAnalytics plans={dcaPlans} prices={prices} />
        )
      )}
      </TabPanel>

      {/* Create/Edit form modal */}
      <DCAForm isOpen={formShown} onClose={() => { if (wantsNew) clearFlag('new'); handleCloseForm(); }} plan={editingPlan} onSave={handleSave} />

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת תוכנית DCA"
        message={`למחוק את תוכנית ה-DCA של ${deleteTarget?.coin}? לא ניתן לבטל פעולה זו.`}
      />
    </m.div>
  );
}
