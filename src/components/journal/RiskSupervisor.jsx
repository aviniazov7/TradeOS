import { ShieldAlert, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { LRM } from '../../utils/formatters';

// Severity carries meaning here, so it gets form as well as colour — a chip and
// a rule, not just a hue. Semantic tokens, never a raw palette colour.
const SEVERITY = {
  critical: { label: 'לטפל עכשיו', Icon: ShieldAlert, text: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/40', rule: 'bg-loss' },
  warning: { label: 'שים לב', Icon: AlertTriangle, text: 'text-breakeven', bg: 'bg-breakeven/10', border: 'border-breakeven/40', rule: 'bg-breakeven' },
  info: { label: 'לידיעה', Icon: Info, text: 'text-text-secondary', bg: 'bg-bg-tertiary', border: 'border-border-primary', rule: 'bg-border-hover' },
};

const fmt$ = (v) => `${LRM}${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;

// One compact figure inside the status card. dir defaults to ltr because the
// values are numbers.
function Figure({ label, value, sub, tone = 'neutral', dir = 'ltr' }) {
  let toneClass = 'text-text-primary';
  if (tone === 'profit') toneClass = 'text-profit';
  else if (tone === 'loss') toneClass = 'text-loss';
  return (
    <div className="min-w-0 px-3.5 py-3 bg-bg-tertiary">
      <div className="text-xs text-text-secondary truncate">{label}</div>
      <div className={`num-mono text-lg font-bold truncate mt-0.5 ${toneClass}`} dir={dir} style={{ textAlign: 'right' }}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5 truncate">{sub}</div>}
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
  if (risk.realizedToday > 0) dayTone = 'profit'; else if (risk.realizedToday < 0) dayTone = 'loss';
  const bookedToday = risk.closedTodayCount + risk.partialTodayCount;
  const daySub = bookedToday
    ? `${risk.closedTodayCount} נסגרו${risk.partialTodayCount ? ` · ${risk.partialTodayCount} חלקיות` : ''}`
    : 'לא נסגר כלום היום';

  // The headline status. An all-clear is a claim: it may only be made when
  // something was actually checked — with no plan there is no rule to pass.
  let status;
  if (findings.length) {
    const meta = SEVERITY[worst] || SEVERITY.info;
    status = { Icon: meta.Icon, cls: meta.text, chip: `${meta.bg} ${meta.border}`, title: `${findings.length} ממצאים מול התוכנית`, sub: 'פירוט ומה לעשות — למטה' };
  } else if (risk.hasPlan) {
    status = { Icon: ShieldCheck, cls: 'text-profit', chip: 'bg-profit/10 border-profit/30', title: 'הספר הפתוח תואם את התוכנית', sub: 'אין חריגה ממגבלת הפוזיציות, מתקרת ההפסד היומי או מרשימות המסחר' };
  } else {
    status = { Icon: Info, cls: 'text-text-secondary', chip: 'bg-bg-tertiary border-border-primary', title: 'לא נבדק — אין תוכנית פעילה', sub: 'הגדר תוכנית עם מגבלות סיכון והבדיקות ירוצו אוטומטית' };
  }
  const StatusIcon = status.Icon;

  return (
    <section className="space-y-2.5">
      <div className="rounded-2xl border border-border-primary bg-bg-tertiary overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-primary">
          <span className={`w-9 h-9 shrink-0 grid place-items-center rounded-xl border ${status.chip}`}>
            {StatusIcon && <StatusIcon className={`w-[18px] h-[18px] ${status.cls}`} />}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${findings.length ? status.cls : 'text-text-primary'}`}>{status.title}</p>
            <p className="text-xs text-text-secondary mt-0.5">{status.sub}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border-primary">
          <Figure
            label="פוזיציות פתוחות"
            value={risk.openCount}
            sub={stopsView(risk)}
            tone={risk.stoplessPositions ? 'loss' : 'neutral'}
          />
          <Figure
            label="תוצאה היום"
            value={bookedToday ? fmt$(risk.realizedToday) : '—'}
            sub={daySub}
            tone={bookedToday ? dayTone : 'neutral'}
          />
          <Figure label="סיכון פתוח" value={exposure.value} sub={exposure.sub} />
        </div>
      </div>

      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f) => {
            const meta = SEVERITY[f.severity] || SEVERITY.info;
            const { Icon } = meta;
            return (
              <li key={f.id} className={`relative overflow-hidden rounded-xl border ${meta.border} ${meta.bg} p-3.5 pr-4`}>
                <span className={`absolute inset-y-0 right-0 w-1 ${meta.rule}`} aria-hidden="true" />
                <div className="flex items-start gap-2.5">
                  {Icon && <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.text}`} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-text-primary">{f.title}</h3>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.border} ${meta.text}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{f.detail}</p>
                    {f.evidence?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {f.evidence.map((e, i) => (
                          // Two open positions can share a pair, so the value alone
                          // is not unique within a finding.
                          <span
                            key={`${f.id}-${i}-${e}`}
                            className="text-[11px] px-1.5 py-0.5 rounded-md bg-bg-secondary text-text-secondary"
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
      )}
    </section>
  );
}
