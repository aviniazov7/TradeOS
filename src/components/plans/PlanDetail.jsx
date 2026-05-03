import { useState } from 'react';
import { CheckCircle2, Circle, LogIn, LogOut, Shield, Target, Clock, StickyNote } from 'lucide-react';
import Modal from '../shared/Modal';
import { getSessionClasses } from '../../utils/constants';
import CoinIcon from '../shared/CoinIcon';

export default function PlanDetail({ isOpen, onClose, plan }) {
  const [checked, setChecked] = useState([]);

  if (!plan) return null;

  const toggleCheck = (i) =>
    setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));

  const sectionClass = 'text-sm font-semibold text-accent-primary mb-2 mt-6 first:mt-0 flex items-center gap-2';
  const blockClass = 'text-sm text-text-secondary whitespace-pre-wrap bg-bg-tertiary border border-border-primary rounded-lg p-4';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={plan.name} maxWidth="max-w-2xl">
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2 h-2 rounded-full ${plan.isActive ? 'bg-profit' : 'bg-text-muted'}`} />
          <span className={`text-xs font-medium ${plan.isActive ? 'text-profit' : 'text-text-muted'}`}>
            {plan.isActive ? 'פעילה' : 'לא פעילה'}
          </span>
        </div>

        {plan.description && (
          <>
            <h3 className={sectionClass}>תיאור</h3>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{plan.description}</p>
          </>
        )}

        {plan.entryRules && (
          <>
            <h3 className={sectionClass}><LogIn className="w-4 h-4" /> כללי כניסה</h3>
            <p className={blockClass}>{plan.entryRules}</p>
          </>
        )}

        {plan.exitRules && (
          <>
            <h3 className={sectionClass}><LogOut className="w-4 h-4" /> כללי יציאה</h3>
            <p className={blockClass}>{plan.exitRules}</p>
          </>
        )}

        {/* Legacy: support old 'rules' field */}
        {plan.rules && !plan.entryRules && !plan.exitRules && (
          <>
            <h3 className={sectionClass}>חוקי כניסה / יציאה</h3>
            <p className={blockClass}>{plan.rules}</p>
          </>
        )}

        {(plan.riskManagement || plan.maxDailyLoss || plan.maxPositions) && (
          <>
            <h3 className={sectionClass}><Shield className="w-4 h-4" /> ניהול סיכונים</h3>
            {plan.riskManagement && <p className={blockClass}>{plan.riskManagement}</p>}
            {(plan.maxDailyLoss || plan.maxPositions) && (
              <div className="flex gap-3 mt-2">
                {plan.maxDailyLoss && (
                  <div className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-loss">{plan.maxDailyLoss}%</p>
                    <p className="text-[10px] text-text-muted">הפסד יומי מקסימלי</p>
                  </div>
                )}
                {plan.maxPositions && (
                  <div className="flex-1 bg-bg-tertiary border border-border-primary rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-text-primary">{plan.maxPositions}</p>
                    <p className="text-[10px] text-text-muted">עסקאות במקביל</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {plan.goals && (
          <>
            <h3 className={sectionClass}><Target className="w-4 h-4" /> יעדים</h3>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{plan.goals}</p>
          </>
        )}

        {(plan.pairs?.length > 0 || plan.timeframes?.length > 0 || plan.sessions?.length > 0) && (
          <>
            <h3 className={sectionClass}>זוגות, טיימפריימים וסשנים</h3>
            <div className="flex flex-wrap gap-2">
              {plan.pairs?.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded text-[11px] font-medium"><CoinIcon pair={p} className="w-3.5 h-3.5" />{p}</span>
              ))}
              {plan.timeframes?.map((t) => (
                <span key={t} className="px-2 py-0.5 bg-bg-tertiary border border-border-primary rounded text-[11px] text-text-muted">{t}</span>
              ))}
              {plan.sessions?.map((s) => (
                <span key={s} className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border ${getSessionClasses(s)}`}>
                  <Clock className="w-3 h-3" />{s}
                </span>
              ))}
            </div>
          </>
        )}

        {plan.checklist?.length > 0 && (
          <>
            <h3 className={sectionClass}>צ׳קליסט לפני עסקה</h3>
            <div className="space-y-2">
              {plan.checklist.map((item, i) => (
                <button
                  key={`${item}-${i}`}
                  onClick={() => toggleCheck(i)}
                  className="w-full flex items-center gap-3 p-3 bg-bg-tertiary border border-border-primary rounded-lg text-right hover:border-border-hover transition-colors cursor-pointer"
                >
                  {checked.includes(i) ? (
                    <CheckCircle2 className="w-5 h-5 text-profit shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-text-muted shrink-0" />
                  )}
                  <span className={`text-sm ${checked.includes(i) ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                    {item}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">
              {checked.length} / {plan.checklist.length} הושלמו
            </p>
          </>
        )}

        {plan.notes && (
          <>
            <h3 className={sectionClass}><StickyNote className="w-4 h-4" /> הערות</h3>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{plan.notes}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
