import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ClipboardList, Pencil, Trash2, ExternalLink, FileImage, Search } from 'lucide-react';
import CoinIcon from '../shared/CoinIcon';
import PairSearch from '../journal/PairSearch';
import TimeframeSelector from '../shared/TimeframeSelector';
import { useUserTimeframes } from '../../hooks/useUserTimeframes';
import toast from 'react-hot-toast';
import { useTradingPlans } from '../../hooks/useTradingPlans';
import { useProcesses } from '../../hooks/useProcesses';
import { useProcessCategories } from '../../hooks/useProcessCategories';
import PlanCard from './PlanCard';
import PlanForm from './PlanForm';
import StrategyView from '../backtest/StrategyView';
import ConfirmDialog from '../shared/ConfirmDialog';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import StrategySelector from '../shared/StrategySelector';
import SelectDropdown from '../shared/SelectDropdown';
import PlansSkeleton from './PlansSkeleton';
import { pageVariants, pageTransition, staggerContainer } from '../../utils/animations';

function toImageUrl(url) {
  if (!url) return null;
  const tvMatch = url.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (tvMatch) {
    const id = tvMatch[1];
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  }
  if (url.startsWith('http')) return url;
  return null;
}

const defaultProcessForm = { category: '', chartUrl: '', description: '', coin: '', timeframe: '' };

export default function PlansPage() {
  const { plans, loading, addPlan, updatePlan, deletePlan } = useTradingPlans();
  const { processes, loading: processesLoading, addProcess, updateProcess, deleteProcess } = useProcesses();
  const { allCategories, addCategory, removeCategory } = useProcessCategories();
  const { allTimeframes, addTimeframe, removeTimeframe } = useUserTimeframes();
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [viewingPlan, setViewingPlan] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tab, setTab] = useState('plans');

  // Process form state
  const [processFormOpen, setProcessFormOpen] = useState(false);
  const [processForm, setProcessForm] = useState(defaultProcessForm);
  const [editingProcessId, setEditingProcessId] = useState(null);
  const [processDelTarget, setProcessDelTarget] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [coinFilter, setCoinFilter] = useState('');

  // Category filter: gather only categories that actually have processes
  const usedCategories = Array.from(new Set(processes.map((p) => p.category).filter(Boolean)));
  const hasUncategorized = processes.some((p) => !p.category);
  const filteredProcesses = processes.filter((p) => {
    if (categoryFilter) {
      if (categoryFilter === '__uncategorized__' && p.category) return false;
      if (categoryFilter !== '__uncategorized__' && p.category !== categoryFilter) return false;
    }
    if (coinFilter && !p.coin?.toLowerCase().includes(coinFilter.toLowerCase())) return false;
    return true;
  });
  const hasCoins = processes.some((p) => p.coin);
  const categoryFilterOptions = [
    ...usedCategories.map((c) => ({ value: c, label: `${c} (${processes.filter((p) => p.category === c).length})` })),
    ...(hasUncategorized ? [{ value: '__uncategorized__', label: `ללא תגית (${processes.filter((p) => !p.category).length})` }] : []),
  ];

  const handleSave = async (data) => {
    try {
      if (editingPlan) {
        await updatePlan(editingPlan.id, data);
        toast.success('התוכנית עודכנה');
      } else {
        await addPlan(data);
        toast.success('התוכנית נוצרה');
      }
    } catch (error) {
      console.error('Save plan failed:', error);
      toast.error(error.code === 'permission-denied' ? 'אין הרשאה לשמור' : 'שגיאה בשמירת התוכנית — נסה שוב');
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
      console.error('Delete plan failed:', error);
      toast.error(error.code === 'permission-denied' ? 'אין הרשאה למחוק' : 'שגיאה במחיקת התוכנית — נסה שוב');
    }
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingPlan(null);
  };

  // Process handlers
  const handleSaveProcess = async () => {
    if (!processForm.coin.trim() && !processForm.chartUrl.trim()) return;
    try {
      if (editingProcessId) {
        await updateProcess(editingProcessId, processForm);
        toast.success('הניתוח עודכן');
      } else {
        await addProcess(processForm);
        toast.success('הניתוח נוסף');
      }
      setProcessForm(defaultProcessForm);
      setEditingProcessId(null);
      setProcessFormOpen(false);
    } catch {
      toast.error(editingProcessId ? 'שגיאה בעדכון' : 'שגיאה בהוספה');
    }
  };

  const handleEditProcess = (proc) => {
    setProcessForm({ category: proc.category || '', chartUrl: proc.chartUrl || '', description: proc.description || '', coin: proc.coin || '', timeframe: proc.timeframe || '' });
    setEditingProcessId(proc.id);
    setProcessFormOpen(true);
  };

  const handleDeleteProcess = async () => {
    if (!processDelTarget) return;
    try {
      await deleteProcess(processDelTarget);
      toast.success('הניתוח נמחק');
      setProcessDelTarget(null);
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  if (loading) return <PlansSkeleton />;

  const inputClass = 'w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
      <>
          {/* Top Navigation Bar */}
          <div className="bg-bg-secondary border border-border-primary rounded-xl mb-4 px-3 md:px-4 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 md:gap-3 min-w-0">
                <h1 className="text-sm md:text-base font-bold text-text-primary whitespace-nowrap">תוכניות מסחר</h1>
                <div className="hidden md:block w-px h-6 bg-border-primary flex-shrink-0" />
                <div className="hidden md:flex items-center">
                  <button onClick={() => setTab('plans')}
                    className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${tab === 'plans' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}>
                    תוכניות ({plans.length})
                  </button>
                  <button onClick={() => setTab('processes')}
                    className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${tab === 'processes' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}>
                    ניתוחים ({processes.length})
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {tab === 'plans' && (
                  <button onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 bg-accent-primary text-bg-primary font-semibold px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer text-xs md:text-sm">
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">תוכנית חדשה</span>
                  </button>
                )}
                {tab === 'processes' && (
                  <button onClick={() => { setProcessForm(defaultProcessForm); setEditingProcessId(null); setProcessFormOpen(true); }} className="flex items-center gap-1.5 bg-accent-primary text-bg-primary font-semibold px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer text-xs md:text-sm">
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף ניתוח</span>
                  </button>
                )}
              </div>
            </div>
            <div className="md:hidden flex items-center">
              <button onClick={() => setTab('plans')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${tab === 'plans' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}>
                תוכניות ({plans.length})
              </button>
              <button onClick={() => setTab('processes')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${tab === 'processes' ? 'bg-accent-primary/15 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'}`}>
                ניתוחים ({processes.length})
              </button>
            </div>
          </div>

          {/* Tab: Plans */}
          {tab === 'plans' && (
            <>
              {plans.length === 0 ? (
                <EmptyState icon={ClipboardList} title="אין תוכניות מסחר עדיין" description="צור תוכנית מסחר לארגון האסטרטגיה והחוקים שלך"
                  action={<button onClick={() => setFormOpen(true)} className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">צור את התוכנית הראשונה</button>} />
              ) : (
                <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" variants={staggerContainer} initial="initial" animate="animate">
                  {plans.map((p) => (
                    <PlanCard key={p.id} plan={p} onView={setViewingPlan} onEdit={handleEdit} onDelete={setDeleteTarget} />
                  ))}
                </motion.div>
              )}
            </>
          )}

          {/* Tab: Analyses (standalone processes) */}
          {tab === 'processes' && (
            <>
              {/* Modal add/edit form */}
              <Modal
                isOpen={processFormOpen}
                onClose={() => { setProcessFormOpen(false); setProcessForm(defaultProcessForm); setEditingProcessId(null); }}
                title={editingProcessId ? 'עריכת ניתוח' : 'ניתוח חדש'}
                maxWidth="max-w-2xl"
              >
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <PairSearch
                      value={processForm.coin}
                      onChange={(val) => setProcessForm((f) => ({ ...f, coin: val }))}
                      label="מטבע"
                    />
                    <TimeframeSelector
                      label="טווח זמן"
                      value={processForm.timeframe}
                      onChange={(tf) => setProcessForm((f) => ({ ...f, timeframe: tf }))}
                      timeframes={allTimeframes}
                      onAdd={addTimeframe}
                      onRemove={removeTimeframe}
                    />
                    <div>
                      <StrategySelector
                        value={processForm.category}
                        onChange={(val) => setProcessForm((f) => ({ ...f, category: val }))}
                        strategies={allCategories}
                        onAdd={addCategory}
                        onRemove={removeCategory}
                        label="תגיות"
                        inputPlaceholder="שם תגית..."
                        emptyText="אין תגיות"
                        placeholder="בחר תגית..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">קישור לתמונה / TradingView</label>
                    <input value={processForm.chartUrl} onChange={(e) => setProcessForm((f) => ({ ...f, chartUrl: e.target.value }))} className={inputClass} placeholder="https://www.tradingview.com/x/..." />
                  </div>
                  {toImageUrl(processForm.chartUrl) && (
                    <div>
                      <img src={toImageUrl(processForm.chartUrl)} alt="תצוגה מקדימה" className="w-full max-h-40 object-contain rounded-lg" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-text-muted mb-1">תיאור</label>
                    <textarea value={processForm.description} onChange={(e) => setProcessForm((f) => ({ ...f, description: e.target.value }))} className={`${inputClass} h-20 resize-none`} placeholder="הערות, תובנות..." />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => { setProcessFormOpen(false); setProcessForm(defaultProcessForm); setEditingProcessId(null); }} className="flex-1 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-border-hover transition-colors cursor-pointer">ביטול</button>
                  <button type="button" onClick={handleSaveProcess} disabled={!processForm.chartUrl.trim() && !processForm.coin.trim()} className="flex-1 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40">{editingProcessId ? 'עדכן' : 'הוסף'}</button>
                </div>
              </Modal>

              {processes.length === 0 && !processFormOpen ? (
                <EmptyState icon={FileImage} title="אין ניתוחים עדיין" description="הוסף ניתוחים, דוגמאות כניסה, ניהול עסקה ועוד — עם תמונות TradingView"
                  action={<button onClick={() => { setProcessForm(defaultProcessForm); setEditingProcessId(null); setProcessFormOpen(true); }} className="mt-2 px-4 py-2 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">הוסף ניתוח ראשון</button>} />
              ) : (
                <>
                  {/* Filters */}
                  {(categoryFilterOptions.length > 0 || hasCoins) && (
                    <div className="mb-3 flex flex-wrap gap-2 items-center">
                      {hasCoins && (
                        <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 w-[160px]">
                          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <input
                            value={coinFilter}
                            onChange={(e) => setCoinFilter(e.target.value)}
                            placeholder="חפש זוג..."
                            className="bg-transparent text-xs text-text-primary placeholder-text-muted outline-none w-full"
                          />
                        </div>
                      )}
                      {categoryFilterOptions.length > 0 && (
                        <div className="w-[160px]">
                          <SelectDropdown
                            value={categoryFilter}
                            onChange={setCategoryFilter}
                            options={categoryFilterOptions}
                            placeholder={`כל התגיות (${processes.length})`}
                            allowClear
                            compact
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {filteredProcesses.length === 0 ? (
                    <EmptyState icon={FileImage} title="אין ניתוחים בקטגוריה זו" description="בחר קטגוריה אחרת או הוסף ניתוח חדש" />
                  ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProcesses.map((proc) => (
                    <div key={proc.id} className="bg-bg-secondary rounded-2xl overflow-hidden hover:shadow-lg transition-all">
                      {toImageUrl(proc.chartUrl) && (
                        <a href={proc.chartUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={toImageUrl(proc.chartUrl)} alt={proc.title || 'ניתוח'} className="w-full object-contain" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; }} />
                        </a>
                      )}
                      <div className="p-3 space-y-1.5">
                        {/* Top row: coin + timeframe + category + actions */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                            {proc.coin && (
                              <>
                                <CoinIcon pair={proc.coin} className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-mono font-semibold text-text-primary shrink-0">{proc.coin}</span>
                              </>
                            )}
                            {proc.timeframe && (
                              <span className="text-[11px] text-text-muted font-medium shrink-0">{proc.timeframe}</span>
                            )}
                            {proc.category && (
                              <span className="text-[11px] font-medium text-accent-primary bg-accent-primary/20 border border-accent-primary/30 px-2 py-0.5 rounded-lg shrink-0">{proc.category}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {proc.chartUrl && (
                              <a href={proc.chartUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button onClick={() => handleEditProcess(proc)} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setProcessDelTarget(proc.id)} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Description */}
                        {proc.description && (
                          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">{proc.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                  )}
                </>
              )}
            </>
          )}
        </>

      <PlanForm isOpen={formOpen} onClose={handleCloseForm} plan={editingPlan} onSave={handleSave} />
      <StrategyView isOpen={!!viewingPlan} onClose={() => setViewingPlan(null)} journal={viewingPlan} />

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="מחיקת תוכנית" message={`למחוק את "${deleteTarget?.name}"? לא ניתן לבטל פעולה זו.`} />
      <ConfirmDialog isOpen={!!processDelTarget} onClose={() => setProcessDelTarget(null)} onConfirm={handleDeleteProcess} title="מחיקת ניתוח" message="למחוק את הניתוח? לא ניתן לבטל פעולה זו." />
    </motion.div>
  );
}
