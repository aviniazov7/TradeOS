import { ShieldAlert, ShieldCheck, AlertTriangle, Info, Layers, TrendingDown, Wallet } from 'lucide-react';

// Severity carries meaning here, so it gets form as well as colour — a chip and
// a left rule, not just a hue. Semantic tokens, never a raw palette colour.
const SEVERITY = {
  critical: { label: 'לטפל עכשיו', Icon: ShieldAlert, text: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/40', rule: 'bg-loss' },
  warning: { label: 'שים לב', Icon: AlertTriangle, text: 'text-breakeven', bg: 'bg-breakeven/10', border: 'border-breakeven/40', rule: 'bg-breakeven' },
  info: { label: 'לידיעה', Icon: Info, text: 'text-text-secondary', bg: 'bg-bg-tertiary', border: 'border-border-primary', rule: 'bg-border-hover' },
};

const fmt$ = (v) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;

function Metric({ label, value, sub, tone = 'neutral', Icon }) {
  let toneClass = 'text-text-primary';
  if (tone === 'profit') toneClass = 'text-profit';
  else if (tone === 'loss') toneClass = 'text-loss';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold ${toneClass}`} dir="ltr">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export default function RiskSupervisor({ risk }) {
  if (!risk) return null;
  const { findings } = risk;
  const worst = findings[0]?.severity;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label="פוזיציות פתוחות"
          value={risk.openCount}
          sub={risk.unboundedPositions ? `${risk.unboundedPositions} בלי סטופ` : 'כולן עם סטופ'}
          tone={risk.unboundedPositions ? 'loss' : 'neutral'}
          Icon={Layers}
        />
        <Metric
          label="תוצאה מומשת היום"
          value={fmt$(risk.realizedToday)}
          sub={`${risk.closedTodayCount} עסקאות נסגרו`}
          tone={risk.realizedToday >= 0 ? 'profit' : 'loss'}
          Icon={TrendingDown}
        />
        <Metric
          label="סיכון פתוח"
          value={risk.openRiskUsd ? `$${risk.openRiskUsd.toFixed(2)}` : '—'}
          sub={risk.openRiskPct === null ? 'ללא יתרת פתיחה ביומן' : `${risk.openRiskPct}% מהחשבון`}
          Icon={Wallet}
        />
        <Metric
          label="מצב מול התוכנית"
          value={findings.length ? `${findings.length} ממצאים` : 'תקין'}
          sub={risk.hasPlan ? 'נבדק מול התוכנית הפעילה' : 'אין תוכנית פעילה'}
          tone={worst === 'critical' ? 'loss' : 'neutral'}
          Icon={ShieldAlert}
        />
      </div>

      {findings.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-profit/30 bg-profit/10 p-4">
          <ShieldCheck className="w-5 h-5 text-profit shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-profit">הספר הפתוח שלך תואם את התוכנית</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {risk.hasPlan
                ? 'אין כרגע חריגה ממגבלת הפוזיציות, מתקרת ההפסד היומי או מרשימות המסחר שהגדרת.'
                : 'לא נמצאה תוכנית פעילה, ולכן אין מולה מה לבדוק. צור תוכנית כדי שהמפקח יוכל לאכוף אותה.'}
            </p>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {findings.map((f) => {
          const meta = SEVERITY[f.severity] || SEVERITY.info;
          const { Icon } = meta;
          return (
            <li key={f.id} className={`relative overflow-hidden rounded-xl border ${meta.border} ${meta.bg} p-4 pr-5`}>
              <span className={`absolute inset-y-0 right-0 w-1 ${meta.rule}`} aria-hidden="true" />
              <div className="flex items-start gap-3">
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-text-primary">{f.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${meta.border} ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">{f.detail}</p>
                  {f.evidence?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {f.evidence.map((e) => (
                        <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted" dir="auto">
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
