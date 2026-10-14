import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Wallet, ClipboardList, Brain, HelpCircle, TrendingUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useLinkedExchangeBalance } from '../../hooks/useLinkedExchangeBalance';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { superviseRisk } from '../../utils/riskSupervisor';
import { auditPlan } from '../../utils/planAudit';
import { buildPsychologyStats } from '../../utils/coachPsychology';
import { pickActivePlan } from '../../utils/pickActivePlan';
import RiskSupervisor from './RiskSupervisor';

const fmt$ = (v, gain) => formatCurrency(gain ? Math.abs(v) : -Math.abs(v));
const PREVIEW = 3;

// Where a finding came from, so two different measurements of "did I follow my
// plan" can never be read as one number confirming the other.
const SOURCE = {
  plan: { label: 'מול התוכנית', Icon: ClipboardList },
  psych: { label: 'מצב רוח · יומן בוקר/ערב', Icon: Brain },
};

// One finding per row: what happened on the right, what it moved in dollars
// on the left — the figure is the point, so it gets the weight.
function FindingRows({ rows }) {
  return (
    <ul className="rounded-2xl border border-border-primary bg-bg-tertiary divide-y divide-border-primary overflow-hidden">
      {rows.map((r) => {
        const meta = SOURCE[r.source];
        const { Icon } = meta;
        const gain = r.kind === 'gain';
        return (
          <li key={r.text} className="flex items-start gap-3 px-4 py-3">
            {Icon && <Icon className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-text-primary leading-relaxed">{r.text}</p>
              <span className="inline-block text-[11px] text-text-muted mt-1">{meta.label}</span>
            </div>
            {/* Only a priced finding gets a figure — a rule breach with no
                dollar amount must not be drawn as if it had one. */}
            {r.priced !== false && (
              <span dir="ltr" className={`num-mono shrink-0 text-sm font-bold mt-0.5 ${gain ? 'text-profit' : 'text-loss'}`}>
                {fmt$(r.cost, gain)}
              </span>
            )}
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          {Icon && <Icon className="w-4 h-4 text-accent-hover shrink-0" />}
          {title}
        </h3>
        {sub && <span className="text-xs text-text-muted">{sub}</span>}
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
  const { user } = useAuth();
  const { activeJournal } = useJournalContext();
  // undefined = still loading. Keeping it in one piece of state means the effect
  // never has to set anything synchronously just to show a skeleton.
  const [side, setSide] = useState(undefined);
  const [expanded, setExpanded] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);

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
  // A daily-loss cap is a percentage of what the trader HAS, not of what they
  // started with. When the journal is linked to a connected exchange the app
  // already knows the live wallet balance and refreshes it every minute, so
  // asking the user to type a number by hand was both redundant and less
  // accurate: someone who started at $1,000 and grew to $5,000 would have had a
  // 3% cap enforced at $30 instead of $150.
  const liveBalance = useLinkedExchangeBalance(activeJournal?.exchange);
  const accountBalance = liveBalance != null ? liveBalance : (Number(activeJournal?.initialBalance) || 0);
  const balanceIsLive = liveBalance != null;

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
    if (!accountBalance) {
      rows.push({
        rule: 'יתרת החשבון',
        reason: 'חבר את היומן לבורסה, או הזן יתרה התחלתית בהגדרות היומן — בלי אחד מהם אי אפשר לתרגם אחוזי סיכון לדולרים',
      });
    }
    if (!psych) rows.push({ rule: 'יומן בוקר בימי מסחר', reason: 'בלי הצלבה של יומן ועסקאות אי אפשר למדוד את השפעת מצב הראש' });
    return rows;
  }, [loading, loadError, audit, plan, accountBalance, psych]);

  if (loading) return <div className="h-36 rounded-2xl bg-bg-tertiary animate-pulse" />;

  const shownCosts = expanded ? costs : costs.slice(0, PREVIEW);

  return (
    <div className="space-y-5">
      <Section
        icon={ShieldAlert}
        title="מפקח הסיכון"
        sub={balanceIsLive ? 'עכשיו · מול היתרה החיה בבורסה' : 'מצב הפוזיציות הפתוחות עכשיו'}
      >
        {loadError
          ? <p className="text-[13px] text-text-secondary bg-bg-tertiary border border-border-primary rounded-2xl p-4">{loadError} רענן כדי לנסות שוב — עד אז אין כאן תשובה, לא &quot;הכול תקין&quot;.</p>
          : <RiskSupervisor risk={risk} />}
      </Section>

      {costs.length > 0 && (
        <Section icon={Wallet} title="מה עולה לך כסף" sub="מכל העסקאות הסגורות · מהיקר לזול">
          <FindingRows rows={shownCosts} />
          {costs.length > PREVIEW && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-hover hover:text-accent-primary cursor-pointer"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'הצג פחות' : `עוד ${costs.length - PREVIEW} ממצאים`}
            </button>
          )}
        </Section>
      )}

      {gains.length > 0 && (
        <Section icon={TrendingUp} title="מה כן עובד לך">
          <FindingRows rows={gains} />
        </Section>
      )}

      {gaps.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border-primary">
          <button
            onClick={() => setGapsOpen((v) => !v)}
            aria-expanded={gapsOpen}
            className="w-full flex items-center gap-2 px-4 py-3 text-right cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-text-muted shrink-0" />
            <span className="flex-1 text-[13px] text-text-secondary">
              {gaps.length === 1 ? 'נתון אחד חסר כדי למדוד הכול' : `${gaps.length} נתונים חסרים כדי למדוד הכול`}
            </span>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${gapsOpen ? 'rotate-180' : ''}`} />
          </button>
          {gapsOpen && (
            <ul className="px-4 pb-3 space-y-1.5">
              {gaps.map((g) => (
                <li key={`${g.rule}-${g.reason}`} className="text-xs text-text-muted leading-relaxed">
                  <span className="text-text-secondary font-semibold">{g.rule}</span> — {g.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
