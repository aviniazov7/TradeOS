import {
  ShieldAlert, ShieldCheck, AlertTriangle, Info, Layers, TrendingUp, TrendingDown, Minus, Wallet,
} from 'lucide-react';

// Severity carries meaning here, so it gets form as well as colour — a chip and
// a rule, not just a hue. Semantic tokens, never a raw palette colour.
const SEVERITY = {
  critical: { label: 'לטפל עכשיו', Icon: ShieldAlert, text: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/40', rule: 'bg-loss' },
  warning: { label: 'שים לב', Icon: AlertTriangle, text: 'text-breakeven', bg: 'bg-breakeven/10', border: 'border-breakeven/40', rule: 'bg-breakeven' },
  info: { label: 'לידיעה', Icon: Info, text: 'text-text-secondary', bg: 'bg-bg-tertiary', border: 'border-border-primary', rule: 'bg-border-hover' },
};

const fmt$ = (v) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;

// dir defaults to ltr because most values here are numbers; a Hebrew value has
// to be able to opt out or the bidi algorithm reorders its words.
function Metric({ label, value, sub, tone = 'neutral', Icon, dir = 'ltr' }) {
  let toneClass = 'text-text-primary';
  if (tone === 'profit') toneClass = 'text-profit';
  else if (tone === 'loss') toneClass = 'text-loss';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold truncate ${toneClass}`} dir={dir}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// "how much of the open book could we actually price" — three distinct answers,
// because "nothing at risk", "we cannot say" and "$X at risk" must never render
// the same way.
function exposureView(risk) {
  if (!risk.openCount) return { value: '—', sub: 'אין פוזיציות פתוחות' };
  if (risk.unmeasurablePositions >= risk.openCount) {
    return { value: '—', sub: 'אי אפשר לתמחר אף פוזיציה פתוחה' };
  }
  const partial = risk.unmeasurablePositions > 0 ? ` · ${risk.unmeasurablePositions} לא נמדדו` : '';
  if (risk.openRiskPct === null) {
    return { value: `$${risk.openRiskUsd.toFixed(2)}`, sub: `ללא יתרת פתיחה ביומן${partial}` };
  }
  return { value: `$${risk.openRiskUsd.toFixed(2)}`, sub: `${risk.openRiskPct}% מיתרת הפתיחה${partial}` };
}

function stopsView(risk) {
  if (!risk.openCount) return null;
  if (risk.stoplessPositions) return `${risk.stoplessPositions} בלי סטופ`;
  if (risk.unsizedPositions) return `${risk.unsizedPositions} עם סטופ שאי אפשר לתמחר`;
  return 'כולן עם סטופ';
}

export default function RiskSupervisor({ risk }) {
  if (!risk) return null;
  const { findings } = risk;
  const worst = findings[0]?.severity;
  const exposure = exposureView(risk);

  let dayTone = 'neutral';
  let DayIcon = Minus;
  if (risk.realizedToday > 0) { dayTone = 'profit'; DayIcon = TrendingUp; } else if (risk.realizedToday < 0) { dayTone = 'loss'; DayIcon = TrendingDown; }
  const bookedToday = risk.closedTodayCount + risk.partialTodayCount;
  const daySub = bookedToday
    ? `${risk.closedTodayCount} נסגרו${risk.partialTodayCount ? ` · ${risk.partialTodayCount} חלקיות` : ''}`
    : 'לא נסגר כלום היום';

  let statusValue = 'תקין';
  if (findings.length) statusValue = `${findings.length} ממצאים`;
  else if (!risk.hasPlan) statusValue = 'לא נבדק';

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label="פוזיציות פתוחות"
          value={risk.openCount}
          sub={stopsView(risk)}
          tone={risk.stoplessPositions ? 'loss' : 'neutral'}
          Icon={Layers}
        />
        <Metric
          label="תוצאה מומשת היום"
          value={bookedToday ? fmt$(risk.realizedToday) : '—'}
          sub={daySub}
          tone={bookedToday ? dayTone : 'neutral'}
          Icon={DayIcon}
        />
        <Metric label="סיכון פתוח" value={exposure.value} sub={exposure.sub} Icon={Wallet} />
        <Metric
          label="מצב מול התוכנית"
          value={statusValue}
          sub={risk.hasPlan ? 'נבדק מול התוכנית הפעילה' : 'אין תוכנית פעילה'}
          tone={worst === 'critical' ? 'loss' : 'neutral'}
          Icon={ShieldAlert}
          dir="auto"
        />
      </div>

      {/* An all-clear is a claim. It may only be made when something was
          actually checked — with no plan there is no rule to have passed. */}
      {findings.length === 0 && risk.hasPlan && (
        <div className="flex items-start gap-3 rounded-xl border border-profit/30 bg-profit/10 p-4">
          <ShieldCheck className="w-5 h-5 text-profit shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-profit">הספר הפתוח שלך תואם את התוכנית</p>
            <p className="text-xs text-text-secondary mt-0.5">
              אין כרגע חריגה ממגבלת הפוזיציות, מתקרת ההפסד היומי או מרשימות המסחר שהגדרת.
            </p>
          </div>
        </div>
      )}

      {findings.length === 0 && !risk.hasPlan && (
        <div className="flex items-start gap-3 rounded-xl border border-border-primary bg-bg-secondary p-4">
          <Info className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text-primary">אין תוכנית פעילה, ולכן אין מה לאכוף</p>
            <p className="text-xs text-text-secondary mt-0.5">
              המפקח לא אומר שהכול תקין — הוא אומר שלא נבדק כלום. הגדר תוכנית עם מגבלת פוזיציות,
              תקרת הפסד יומי ורשימות מסחר, והבדיקות יתחילו לרוץ אוטומטית.
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
                      {f.evidence.map((e, i) => (
                        // Two open positions can share a pair, so the value alone
                        // is not unique within a finding.
                        <span
                          key={`${f.id}-${i}-${e}`}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted"
                          dir="auto"
                        >
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
