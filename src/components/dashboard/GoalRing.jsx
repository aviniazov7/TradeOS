import { useState, useEffect, useMemo } from 'react';
import { Target, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSetting, setUserSetting } from '../../services/firestoreService';
import { formatCurrency } from '../../utils/formatters';
import Card from '../shared/Card';

// Monthly-goal widget: a progress ring comparing THIS calendar month's realized
// P&L to a goal the user sets. The goal is stored per-user (settings/monthlyGoal).
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
    <Card className="p-4 flex items-center gap-4">
      <div
        className="relative w-[92px] h-[92px] shrink-0 rounded-full transition-all duration-700"
        style={{ background: `conic-gradient(from -90deg, var(--color-accent-primary) 0 ${pct}%, rgba(255,255,255,0.08) ${pct}% 100%)` }}
      >
        <div className="absolute inset-[9px] rounded-full bg-bg-secondary flex items-center justify-center">
          <span className="text-lg font-extrabold num-mono text-text-primary">{Math.round(pct)}%</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
          <Target className="w-3.5 h-3.5 text-accent-primary" />
          <span>יעד חודשי</span>
          {goal > 0 && !editing && (
            <button onClick={() => { setVal(String(goal)); setEditing(true); }} className="mr-auto p-1 rounded text-text-muted hover:text-accent-primary transition-colors cursor-pointer" title="ערוך יעד">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)}
              placeholder="סכום יעד ($)" dir="ltr" autoFocus
              className="w-28 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary/50"
            />
            <button onClick={save} className="text-xs font-bold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">שמור</button>
          </div>
        ) : goal > 0 ? (
          <>
            <div dir="ltr" className="text-lg font-extrabold text-text-primary leading-tight">
              {formatCurrency(monthPnl)} <span className="text-text-muted font-semibold text-sm">/ {formatCurrency(goal)}</span>
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {monthPnl >= goal ? '🎉 היעד הושג!' : `עוד ${formatCurrency(goal - monthPnl)} ליעד`}
            </div>
          </>
        ) : (
          <button onClick={() => { setVal(''); setEditing(true); }} className="text-sm text-accent-primary font-semibold cursor-pointer hover:underline">
            הגדר יעד חודשי →
          </button>
        )}
      </div>
    </Card>
  );
}
