import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Gauge, ShieldAlert, Wallet, ClipboardList, Brain, HelpCircle, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useTrades } from '../../hooks/useTrades';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { superviseRisk } from '../../utils/riskSupervisor';
import { auditPlan } from '../../utils/planAudit';
import { buildPsychologyStats } from '../../utils/coachPsychology';
import { pickActivePlan } from '../../utils/pickActivePlan';
import RiskSupervisor from './RiskSupervisor';

const fmt$ = (v) => `$${Math.abs(v).toFixed(2)}`;

// Where a finding came from, so two different measurements of "did I follow my
// plan" can never be read as one number confirming the other.
const SOURCE = {
  plan: { label: 'כללי התוכנית · לפי עסקה', Icon: ClipboardList },
  psych: { label: 'יומן בוקר/ערב · לפי יום', Icon: Brain },
};

function CostFindings({ rows }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.cost), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const meta = SOURCE[r.source];
        const { Icon } = meta;
        const share = Math.max((r.cost / max) * 100, 2);
        return (
          <li key={r.text} className="bg-bg-secondary border border-border-primary rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Icon className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary leading-relaxed">{r.text}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1 flex-1 rounded-full bg-bg-tertiary overflow-hidden">
                    <div className="h-full rounded-full bg-loss" style={{ width: `${share}%` }} />
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0" dir="ltr">{fmt$(r.cost)}</span>
                </div>
                <span className="inline-block text-[10px] text-text-muted mt-1.5">{meta.label}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AnalystPage() {
  const { user } = useAuth();
  const { activeJournal, activeJournalId } = useJournalContext();
  const { trades, loading: tradesLoading } = useTrades(activeJournalId);

  // undefined = still loading. Keeping it in one piece of state means the
  // effect never has to set anything synchronously to show a spinner.
  const [side, setSide] = useState(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  // The plan and the mentality journals are one-shot reads. This page is opened
  // deliberately, so a live subscription would cost two listeners for data that
  // changes on a human timescale.
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
        // would send the user to create something they already have.
        if (!cancelled) {
          setSide({
            plan: null,
            journals: null,
            error: 'טעינת התוכנית ויומני המנטליות נכשלה. המדדים שמבוססים עליהן לא מוצגים.',
          });
        }
      });
    return () => { cancelled = true; };
  }, [user, reloadKey]);

  const reload = () => {
    setSide(undefined);
    setReloadKey((k) => k + 1);
  };

  const plan = side?.plan ?? null;
  const journals = side?.journals ?? null;
  const loadError = side?.error || '';
  const sideLoading = side === undefined;

  const accountBalance = Number(activeJournal?.initialBalance) || 0;

  const risk = useMemo(
    () => superviseRisk(trades, plan, { accountBalance }),
    [trades, plan, accountBalance],
  );

  const audit = useMemo(
    () => (plan ? auditPlan(plan, trades, { accountBalance }) : null),
    [plan, trades, accountBalance],
  );

  const psych = useMemo(
    () => (journals ? buildPsychologyStats(trades, journals.morning, journals.evening) : null),
    [journals, trades],
  );

  // One ranked list. Both sources measure dollars actually moved, so they rank
  // on the same scale — but each row still says which measurement it came from.
  const costFindings = useMemo(() => {
    const rows = [
      ...(audit?.findingsRanked || []).map((f) => ({ ...f, source: 'plan' })),
      ...(psych?.findingsRanked || []).map((f) => ({ ...f, source: 'psych' })),
    ];
    return rows.filter((r) => r.cost > 0).sort((a, b) => b.cost - a.cost);
  }, [audit, psych]);

  const gaps = useMemo(() => {
    const rows = [...(audit?.notMeasurable || [])];
    if (!plan) rows.push({ rule: 'תוכנית מסחר', reason: 'אין תוכנית פעילה — אין מול מה להשוות את העסקאות' });
    if (!accountBalance) rows.push({ rule: 'יתרת פתיחה ליומן', reason: 'בלעדיה אי אפשר לתרגם אחוזי סיכון לדולרים' });
    if (!psych) rows.push({ rule: 'יומן בוקר בימי מסחר', reason: 'בלי הצלבה של יומן ועסקאות אי אפשר למדוד את השפעת מצב הראש' });
    return rows;
  }, [audit, plan, accountBalance, psych]);

  const loading = tradesLoading || sideLoading;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-accent-primary/25 bg-gradient-to-l from-accent-primary/10 via-bg-secondary to-bg-secondary p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-accent-primary/15 border border-accent-primary/40 flex items-center justify-center">
              <Gauge className="w-6 h-6 text-accent-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-text-primary">האנליסט האישי</h1>
              <p className="text-xs text-text-secondary leading-relaxed mt-1">
                מה פתוח אצלך עכשיו מול מה שהתחייבת אליו בתוכנית, ואיזה דפוסים באמת עולים לך כסף.
                כל המספרים כאן מחושבים מהעסקאות שלך — לא נכתבים על ידי מודל.
              </p>
            </div>
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-primary text-text-secondary text-xs hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </button>
        </div>
      </motion.header>

      {loadError && (
        <p className="text-xs text-loss bg-loss/10 border border-loss/30 rounded-xl p-3">{loadError}</p>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-accent-primary" />
          <h2 className="text-sm font-bold text-text-primary">מפקח הסיכון</h2>
          <span className="text-[10px] text-text-muted">מצב הספר הפתוח ברגע זה</span>
        </div>
        {loading ? <div className="h-32 rounded-xl bg-bg-secondary animate-pulse" /> : <RiskSupervisor risk={risk} />}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-accent-primary" />
          <h2 className="text-sm font-bold text-text-primary">מה עולה לך כסף</h2>
          <span className="text-[10px] text-text-muted">מדורג לפי הסכום שזז בפועל</span>
        </div>
        {!loading && costFindings.length === 0 && (
          <p className="text-xs text-text-secondary bg-bg-secondary border border-border-primary rounded-xl p-4">
            אין עדיין דפוס עם מספיק עסקאות מאחוריו כדי לכמת אותו בכסף. זה לא אומר שהכול תקין — זה אומר
            שהמדגם קטן מכדי להסיק ממנו, וכל מסקנה בשלב הזה תהיה ניחוש.
          </p>
        )}
        <CostFindings rows={costFindings} />
      </div>

      {gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-bold text-text-primary">מה חסר כדי למדוד</h2>
          </div>
          <ul className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-2">
            {gaps.map((g) => (
              <li key={`${g.rule}-${g.reason}`} className="text-xs text-text-muted">
                <span className="text-text-secondary font-medium">{g.rule}</span> — {g.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/journal?ai=1"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold hover:bg-accent-hover transition-colors"
        >
          לניתוח AI מלא <ArrowLeft className="w-4 h-4" />
        </Link>
        <Link
          to="/plans"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border-primary text-text-secondary text-sm hover:text-text-primary hover:border-border-hover transition-colors"
        >
          <ClipboardList className="w-4 h-4" /> לתוכניות המסחר
        </Link>
      </div>
    </div>
  );
}
