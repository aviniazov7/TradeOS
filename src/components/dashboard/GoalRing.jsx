import { useState, useEffect, useMemo } from 'react';
import { Pencil, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { formatCurrency } from '../../utils/formatters';

// Small progress ring (conic) sized to match the dashboard's other KPI gauges.
function MiniRing({ pct, size = 52 }) {
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(from -90deg, var(--color-accent-primary) 0 ${pct}%, rgba(255,255,255,0.08) ${pct}% 100%)` }}
    >
      <div className="absolute inset-[6px] rounded-full bg-bg-secondary" />
    </div>
  );
}

// Monthly-goal KPI card — lives INSIDE the KPI row (6th card). The user sets a
// goal; the ring tracks this calendar month's realized P&L toward it. Stored
// per-user (settings/monthlyGoal). Kept compact to match the sibling KPI cards.
export default function GoalRing({ trades = [] }) {
  const { user } = useAuth();
  const [goal, setGoal] = useState(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    getUserSetting(user.uid, 'monthlyGoal')
      .then((d) => { if (alive && d?.amount != null) setGoal(Number(d.amount)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.uid]);

  // This month's realized P&L — trades that closed in the current calendar month.
  const monthPnl = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let sum = 0;
    for (const t of trades) {
      const d = t.exitDate?.toDate ? t.exitDate.toDate() : (t.exitDate ? new Date(t.exitDate) : null);
      if (d && d.getFullYear() === y && d.getMonth() === m) sum += (t.netPnl ?? t.pnl ?? 0);
    }
    return sum;
  }, [trades]);

  const pct = goal > 0 ? Math.max(0, Math.min(100, (monthPnl / goal) * 100)) : 0;

  const save = async () => {
    const amount = Number(val);
    setEditing(false);
    if (!(amount > 0)) return;
    setGoal(amount);
    if (user?.uid) await setUserSetting(user.uid, 'monthlyGoal', { amount }).catch(() => {});
  };

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">יעד חודשי</span>
        {goal > 0 && !editing && (
          <button onClick={() => { setVal(String(goal)); setEditing(true); }} className="p-0.5 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer" title="ערוך יעד">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)}
            placeholder="יעד $" dir="ltr" autoFocus
            className="w-full min-w-0 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary/50"
          />
          <button onClick={save} className="shrink-0 p-1.5 rounded-lg text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 transition-colors cursor-pointer" title="שמור">
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : goal > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div dir="ltr" className="text-2xl font-bold text-text-primary num-mono">{Math.round(pct)}%</div>
            <div className="text-[10px] text-text-muted mt-0.5 truncate">
              {monthPnl >= goal ? '🎉 הושג!' : `עוד ${formatCurrency(goal - monthPnl)}`}
            </div>
          </div>
          <MiniRing pct={pct} />
        </div>
      ) : (
        <button onClick={() => { setVal(''); setEditing(true); }} className="text-sm text-accent-primary font-semibold text-right cursor-pointer hover:underline mt-2">
          הגדר יעד →
        </button>
      )}
    </div>
  );
}
