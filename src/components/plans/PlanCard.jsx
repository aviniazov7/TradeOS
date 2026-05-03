import { motion } from 'framer-motion';
import { Pencil, Trash2, Eye, Clock, Shield, CheckSquare } from 'lucide-react';
import { staggerItem, cardHover } from '../../utils/animations';
import { getSessionClasses } from '../../utils/constants';
import CoinIcon from '../shared/CoinIcon';

export default function PlanCard({ plan, onView, onEdit, onDelete }) {
  const checklistCount = plan.checklist?.length || 0;

  return (
    <motion.div
      variants={staggerItem}
      whileHover={cardHover}
      className="bg-bg-secondary border border-border-primary rounded-xl p-5 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-text-primary">{plan.name}</h3>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${plan.isActive ? 'text-profit' : 'text-text-muted'}`}>
          <span className={`w-2 h-2 rounded-full ${plan.isActive ? 'bg-profit' : 'bg-text-muted'}`} />
          {plan.isActive ? 'פעילה' : 'לא פעילה'}
        </span>
      </div>

      {plan.description && (
        <p className="text-sm text-text-secondary line-clamp-2 mb-3">{plan.description}</p>
      )}

      {/* Entry rules preview */}
      {plan.entryRules && (
        <p className="text-xs text-text-muted line-clamp-1 mb-3">
          <span className="text-text-secondary font-medium">כניסה:</span> {plan.entryRules.split('\n')[0]}
        </p>
      )}

      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {plan.pairs?.slice(0, 4).map((p) => (
          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded text-[11px] font-medium">
            <CoinIcon pair={p} className="w-3.5 h-3.5" />{p}
          </span>
        ))}
        {plan.pairs?.length > 4 && (
          <span className="px-2 py-0.5 bg-bg-tertiary text-text-muted rounded text-[11px]">+{plan.pairs.length - 4}</span>
        )}
        {plan.timeframes?.slice(0, 3).map((t) => (
          <span key={t} className="px-2 py-0.5 bg-bg-tertiary border border-border-primary rounded text-[10px] text-text-muted font-medium">
            {t}
          </span>
        ))}
        {plan.sessions?.slice(0, 2).map((s) => (
          <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getSessionClasses(s)}`}>
            <Clock className="w-2.5 h-2.5 inline mr-0.5" />{s}
          </span>
        ))}
      </div>

      {/* Info badges */}
      <div className="flex items-center gap-3 mb-4 text-[11px] text-text-muted">
        {plan.maxDailyLoss && (
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            הפסד יומי: {plan.maxDailyLoss}%
          </span>
        )}
        {checklistCount > 0 && (
          <span className="flex items-center gap-1">
            <CheckSquare className="w-3 h-3" />
            {checklistCount} פריטים
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border-primary">
        <button
          onClick={() => onView(plan)}
          className="flex items-center gap-1.5 text-xs text-accent-primary hover:text-accent-hover transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" /> צפה בתוכנית
        </button>
        <div className="flex gap-1">
          <button onClick={() => onEdit(plan)} className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(plan)} className="p-1.5 rounded-lg text-text-muted hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
