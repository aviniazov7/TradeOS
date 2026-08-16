import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, Pencil, Trash2, Play, Gem, AlertCircle, Compass } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePolymarketStrategies } from '../../hooks/usePolymarketStrategies';
import { usePolymarkets } from '../../hooks/usePolymarkets';
import ConfirmDialog from '../shared/ConfirmDialog';
import StrategyFormModal from './StrategyFormModal';
import { runStrategy, describeStrategy } from '../../utils/polymarketStrategy';
import { fmtUsd } from '../../utils/polymarketScore';
import { staggerContainer, staggerItem } from '../../utils/animations';

function FitBadge({ fit }) {
  const tone = fit >= 70 ? 'bg-profit/15 text-profit border-profit/40'
    : fit >= 45 ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40'
    : 'bg-bg-tertiary text-text-secondary border-border-primary';
  return <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl border text-xs font-extrabold num-mono ${tone}`} title={`ציון התאמה ${fit}/100`}>{fit}</span>;
}

function MatchRow({ match, onOpen }) {
  const { market, band, daysLeft, fit } = match;
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-secondary border border-border-primary text-right cursor-pointer transition-colors hover:border-accent-primary/40 outline-none focus-visible:border-accent-primary/60">
      <FitBadge fit={fit} />
      {market.icon
        ? <img src={market.icon} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" loading="lazy" />
        : <div className="w-9 h-9 rounded-lg bg-bg-tertiary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text-primary truncate" dir="auto">{market.question}</div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted num-mono flex-wrap">
          <span className="text-accent-primary font-bold">{band.outcome} · {Math.round(band.price * 100)}¢</span>
          <span>· נזילות {fmtUsd(market.liquidity)}</span>
          {daysLeft != null && <span>· {daysLeft <= 0 ? 'נסגר היום' : `${daysLeft} ימים`}</span>}
          {match.smartCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-accent-primary">
              <Gem className="w-2.5 h-2.5" />{match.smartCount} חכמים
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ s, active, matchCount, onRun, onEdit, onDelete }) {
  return (
    <div className={`rounded-2xl border p-3 transition-colors ${active ? 'border-accent-primary/50 bg-accent-primary/[0.06]' : 'border-border-primary bg-bg-secondary'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Target className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-accent-primary' : 'text-text-muted'}`} />
            <span className="text-sm font-bold text-text-primary truncate">{s.name}</span>
          </div>
          <p className="text-[10px] text-text-muted num-mono mt-1 leading-relaxed">{describeStrategy(s)}</p>
          {s.notes && <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed line-clamp-2">{s.notes}</p>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onEdit(s)} title="עריכה" className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(s)} title="מחיקה" className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <button onClick={() => onRun(s)}
        className={`w-full mt-2.5 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
          active ? 'bg-accent-primary text-bg-primary' : 'bg-bg-tertiary text-text-secondary hover:text-accent-primary'
        }`}>
        <Play className="w-3.5 h-3.5" /> {active ? `${matchCount} התאמות` : 'הרץ סריקה'}
      </button>
    </div>
  );
}

// End-to-end strategy workflow: define the rule-set → run it against the live
// market board → get a ranked shortlist → open a market to act on it.
export default function StrategyTab({ smartCountByMarket = {}, smartLoading = false }) {
  const navigate = useNavigate();
  const { strategies, loading, addStrategy, updateStrategy, deleteStrategy } = usePolymarketStrategies();
  const { markets, loading: marketsLoading, error } = usePolymarkets();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const active = strategies.find((s) => s.id === activeId) || null;
  const matches = useMemo(
    () => (active ? runStrategy(markets, active, smartCountByMarket) : []),
    [active, markets, smartCountByMarket],
  );

  const handleSave = async (data) => {
    if (editing) await updateStrategy(editing.id, data);
    else await addStrategy(data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStrategy(deleteTarget.id);
      if (activeId === deleteTarget.id) setActiveId(null);
      toast.success('האסטרטגיה נמחקה');
    } catch {
      toast.error('מחיקה נכשלה');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Compass className="w-3.5 h-3.5 text-accent-primary shrink-0" />
          <h2 className="text-sm font-bold text-text-primary shrink-0">האסטרטגיות שלי</h2>
          <span className="text-[11px] text-text-muted truncate">— הגדר כללים פעם אחת, וסרוק איתם את כל השוק</span>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition cursor-pointer">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">אסטרטגיה חדשה</span>
        </button>
      </div>

      {/* Strategy cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-bg-secondary animate-pulse" />)}</div>
      ) : strategies.length === 0 ? (
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border border-dashed border-border-primary text-text-muted hover:text-accent-primary hover:border-accent-primary/40 transition-colors cursor-pointer">
          <Target className="w-7 h-7 opacity-60" />
          <span className="text-sm font-medium">עדיין אין אסטרטגיה</span>
          <span className="text-[11px] max-w-sm text-center leading-relaxed">
            בנה כלל אחד — באיזה טווח הסתברות אתה צד, מה רצפת הנזילות, וכמה זמן עד ההכרעה — והמערכת תסרוק איתו את כל השווקים החיים.
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {strategies.map((s) => (
            <StrategyCard key={s.id} s={s} active={s.id === activeId}
              matchCount={s.id === activeId ? matches.length : 0}
              onRun={(x) => setActiveId((cur) => (cur === x.id ? null : x.id))}
              onEdit={(x) => { setEditing(x); setFormOpen(true); }}
              onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {/* Scan results */}
      {active && (
        <section className="mt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-accent-primary" />
            <h3 className="text-sm font-bold text-text-primary">התאמות · {active.name}</h3>
            <span className="text-[11px] text-text-muted">({matches.length} מתוך {markets.length} שווקים)</span>
          </div>

          {marketsLoading || smartLoading ? (
            <div className="space-y-2">
              {smartLoading && !marketsLoading && <p className="text-[11px] text-text-muted">בודק אילו ארנקים חכמים מחזיקים בכל שוק…</p>}
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-bg-secondary animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-loss"><AlertCircle className="w-4 h-4" />{error}</div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border border-dashed border-border-primary text-text-muted text-center px-6">
              <Target className="w-7 h-7 opacity-60" />
              <span className="text-sm font-medium">אף שוק לא עומד בכללים כרגע</span>
              <span className="text-[11px] max-w-sm leading-relaxed">זה תקין — אסטרטגיה טובה מסננת הרבה. נסה להרחיב את טווח ההסתברות, להוריד את רצפת הנזילות, או להאריך את חלון הזמן.</span>
            </div>
          ) : (
            <motion.div className="space-y-2" variants={staggerContainer} initial="initial" animate="animate">
              {matches.slice(0, 30).map((m) => (
                <motion.div key={m.market.conditionId} variants={staggerItem}>
                  <MatchRow match={m} onOpen={() => navigate(`/polymarket/market/${m.market.conditionId}`, { state: { market: m.market } })} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>
      )}

      <StrategyFormModal isOpen={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={handleSave} strategy={editing} />
      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="מחיקת אסטרטגיה" message={`למחוק את "${deleteTarget?.name || ''}"? לא ניתן לבטל.`} />
    </div>
  );
}
