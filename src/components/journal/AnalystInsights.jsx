import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Wallet, ClipboardList, Brain, HelpCircle, TrendingUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { superviseRisk } from '../../utils/riskSupervisor';
import { auditPlan } from '../../utils/planAudit';
import { buildPsychologyStats } from '../../utils/coachPsychology';
import { pickActivePlan } from '../../utils/pickActivePlan';
import RiskSupervisor from './RiskSupervisor';

const fmt$ = (v) => `$${Math.abs(v).toFixed(2)}`;
const PREVIEW = 3;

// Where a finding came from, so two different measurements of "did I follow my
// plan" can never be read as one number confirming the other.
const SOURCE = {
  plan: { label: 'כללי התוכנית · לפי עסקה', Icon: ClipboardList },
  psych: { label: 'יומן בוקר/ערב · לפי יום', Icon: Brain },
};

function FindingRows({ rows, max }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const meta = SOURCE[r.source];
        const { Icon } = meta;
        const share = Math.max((r.cost / max) * 100, 2);
        return (
          <li key={r.text} className="bg-bg-secondary border border-border-primary rounded-xl p-3">
            <div className="flex items-start gap-2.5">
              <Icon className="w-3.5 h-3.5 text-accent-primary shrink-0 mt-1" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-primary leading-relaxed">{r.text}</p>
                {/* Only a priced finding gets a bar and a figure — a rule breach
                    with no dollar amount must not be drawn as if it had one. */}
                {r.priced !== false && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="h-1 flex-1 rounded-full bg-bg-tertiary overflow-hidden">
                      <div className={`h-full rounded-full ${r.kind === 'gain' ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0" dir="ltr">{fmt$(r.cost)}</span>
                  </div>
                )}
                <span className="inline-block text-[10px] text-text-muted mt-1">{meta.label}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// icon comes in lowercase and is aliased in the body: eslint's jsx-uses-vars
// does not see a capitalised destructured PROP as used, and this file must not
// add a new lint error.
function Section({ icon, title, sub, children }) {
  const Icon = icon;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-accent-primary shrink-0" />
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * The deterministic half of the analysis: the open book against the plan, and
 * the patterns that already cost money. Computed entirely in code — it needs no
 * AI call, no quota, and it is correct the moment the modal opens.
 */
export default function AnalystInsights({ trades }) {
  const { user, isPremium } = useAuth();
  const { activeJournal } = useJournalContext();
  // undefined = still loading. Keeping it in one piece of state means the effect
  // never has to set anything synchronously just to show a skeleton.
  const [side, setSide] = useState(undefined);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    Promise.all([
      getUserCollectionDocs(user.uid, 'tradingPlans'),
      getUserCollectionDocs(user.uid, 'morningJournals'),
      getUserCollectionDocs(user.uid, 'eveningJournals'),
    ])
      .then(([plans, morning, evening]) => {
        if (!cancelled) setSide({ plan: pickActivePlan(plans), journals: { morning, evening }, error: '' });
      })
      .catch(() => {
        // Say what failed. Rendering "you have no plan" after a failed read
        // would send the user to create something they may already have.
        if (!cancelled) setSide({ plan: null, journals: null, error: 'טעינת התוכנית ויומני המנטליות נכשלה, אז הבדיקות מולן לא רצו.' });
      });
    return () => { cancelled = true; };
  }, [user]);

  const plan = side?.plan ?? null;
  const journals = side?.journals ?? null;
  const loadError = side?.error || '';
  const loading = side === undefined;
  const accountBalance = Number(activeJournal?.initialBalance) || 0;

  const risk = useMemo(() => superviseRisk(trades, plan, { accountBalance }), [trades, plan, accountBalance]);
  const audit = useMemo(() => (plan ? auditPlan(plan, trades, { accountBalance }) : null), [plan, trades, accountBalance]);
  const psych = useMemo(
    () => (journals ? buildPsychologyStats(trades, journals.morning, journals.evening) : null),
    [journals, trades],
  );

  // Both sources measure dollars actually moved, so they rank on the same scale —
  // but a gain is never filed under "what is costing you money".
  const { costs, gains } = useMemo(() => {
    const rows = [
      ...(audit?.findingsRanked || []).map((f) => ({ ...f, source: 'plan' })),
      ...(psych?.findingsRanked || []).map((f) => ({ ...f, source: 'psych' })),
    ];
    const byCost = (a, b) => b.cost - a.cost;
    // Unpriced rows have no sort key, so they go last rather than pretending to
    // a cost of zero.
    const rank = (arr) => [
      ...arr.filter((r) => r.priced !== false).sort(byCost),
      ...arr.filter((r) => r.priced === false),
    ];
    return {
      costs: rank(rows.filter((r) => r.kind !== 'gain')),
      gains: rank(rows.filter((r) => r.kind === 'gain')),
    };
  }, [audit, psych]);

  const gaps = useMemo(() => {
    if (loading || loadError) return [];
    const rows = [...(audit?.notMeasurable || [])];
    if (!plan) rows.push({ rule: 'תוכנית מסחר', reason: 'אין תוכנית פעילה — אין מול מה להשוות את העסקאות' });
    if (!accountBalance) rows.push({ rule: 'יתרת פתיחה ליומן', reason: 'בלעדיה אי אפשר לתרגם אחוזי סיכון לדולרים' });
    if (!psych) rows.push({ rule: 'יומן בוקר בימי מסחר', reason: 'בלי הצלבה של יומן ועסקאות אי אפשר למדוד את השפעת מצב הראש' });
    return rows;
  }, [loading, loadError, audit, plan, accountBalance, psych]);

  if (loading) return <div className="h-28 rounded-xl bg-bg-secondary animate-pulse" />;

  const shownCosts = expanded ? costs : costs.slice(0, PREVIEW);
  const maxCost = Math.max(...costs.filter((r) => r.priced !== false).map((r) => r.cost), 1);
  const maxGain = Math.max(...gains.filter((r) => r.priced !== false).map((r) => r.cost), 1);

  return (
    <div className="space-y-4">
      <Section icon={ShieldAlert} title="מפקח הסיכון" sub="מצב הספר הפתוח ברגע זה">
        {loadError
          ? <p className="text-xs text-text-secondary bg-bg-secondary border border-border-primary rounded-xl p-3">{loadError} רענן כדי לנסות שוב — עד אז אין כאן תשובה, לא &quot;הכול תקין&quot;.</p>
          : <RiskSupervisor risk={risk} />}
      </Section>

      {costs.length > 0 && (
        <Section icon={Wallet} title="מה עולה לך כסף" sub="כל העסקאות הסגורות ביומן · לפי הסכום שזז בפועל">
          <FindingRows rows={shownCosts} max={maxCost} />
          {costs.length > PREVIEW && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent-primary hover:text-accent-hover cursor-pointer"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'הצג פחות' : `עוד ${costs.length - PREVIEW} ממצאים`}
            </button>
          )}
        </Section>
      )}

      {gains.length > 0 && (
        <Section icon={TrendingUp} title="מה כן עובד לך" sub="אותה מדידה, בכיוון השני">
          <FindingRows rows={gains} max={maxGain} />
        </Section>
      )}

      {gaps.length > 0 && (
        <Section icon={HelpCircle} title="מה חסר כדי למדוד">
          <ul className="bg-bg-secondary border border-border-primary rounded-xl p-3 space-y-1.5">
            {gaps.map((g) => (
              <li key={`${g.rule}-${g.reason}`} className="text-[11px] text-text-muted">
                <span className="text-text-secondary font-medium">{g.rule}</span> — {g.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!isPremium && (
        <p className="text-[11px] text-text-muted">
          המדדים כאן מכסים את כל העסקאות הסגורות ביומן. ניתוח ה-AI במסלול החינמי מכסה רק את החודש
          הנוכחי, ולכן המספרים שם יהיו קטנים יותר.
        </p>
      )}
    </div>
  );
}
