import { useRef, useState } from 'react';
import { m } from 'framer-motion';
import {
  BrainCircuit, Crown, RefreshCw, AlertCircle, Lock, Sparkles,
  TrendingUp, TrendingDown, Target, Lightbulb, HeartPulse, ClipboardCheck, ShieldAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ThinkingIndicator from '../shared/ThinkingIndicator';
import { renderBulletHtml } from '../../utils/renderBulletHtml';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useLinkedExchangeBalance } from '../../hooks/useLinkedExchangeBalance';
import { generateCoachReport } from '../../services/aiCoachService';
import { getUserCollectionDocs } from '../../services/firestoreService';
import { buildCoachStats, coachScopeTrades } from '../../utils/coachStats';
import { buildPsychologyStats } from '../../utils/coachPsychology';
import { auditPlan } from '../../utils/planAudit';
import { pickActivePlan } from '../../utils/pickActivePlan';
import AnalystInsights from './AnalystInsights';
import { LRM } from '../../utils/formatters';

// Quick prompts the user can click to seed the report.
const FREE_PROMPTS = [
  { id: 'overview', label: 'סיכום חודש אחרון' },
  { id: 'losses', label: 'איפה אני מפסיד הכי הרבה?' },
  { id: 'topPair', label: 'מה המטבע הכי רווחי שלי?' },
];
const PREMIUM_PROMPTS = [
  { id: 'mistakes', label: '3 הטעויות הכי גדולות שלי' },
  { id: 'sessionEdge', label: 'איזה סשן הכי רווחי?' },
  { id: 'compareMonth', label: 'איך החודש מול הקודם?' },
  { id: 'strategyEdge', label: 'איזו אסטרטגיה מצליחה?' },
  { id: 'psychology', label: 'כמה מצב הראש עולה לי?' },
  { id: 'planAudit', label: 'האם אני עומד בתוכנית שלי?' },
];

// Each section header maps to an icon + accent color. The model is locked to
// these four headings (חוזקות / חולשות / המלצות לפעולה / תובנות מתקדמות) so
// we get deterministic styling.
const SECTION_META = {
  'חוזקות': { Icon: TrendingUp, color: 'text-profit', bg: 'bg-profit/10', border: 'border-profit/30' },
  'חולשות': { Icon: TrendingDown, color: 'text-loss', bg: 'bg-loss/10', border: 'border-loss/30' },
  'המלצות לפעולה': { Icon: Target, color: 'text-accent-primary', bg: 'bg-accent-primary/10', border: 'border-accent-primary/30' },
  'תובנות מתקדמות': { Icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};
const DEFAULT_META = { Icon: Sparkles, color: 'text-text-primary', bg: 'bg-bg-tertiary', border: 'border-border-primary' };

// Known canonical sections — used to map slipped formats back to the right
// bucket and to ignore any section the model invents on its own (e.g. "מסקנות").
const CANONICAL_SECTIONS = ['חוזקות', 'חולשות', 'המלצות לפעולה', 'תובנות מתקדמות'];

function normalizeTitle(raw) {
  // Strip markdown noise the model sometimes leaks despite the prompt.
  let t = raw.replace(/^#+\s*/, '')      // "## חוזקות"
    .replace(/^\d+[.)]\s*/, '')          // "1. חוזקות"
    .replace(/\*\*/g, '')                // "**חוזקות**"
    .replace(/[:：]\s*$/, '')            // trailing colon
    .trim();
  // Snap to a canonical section if the model used a near match.
  const match = CANONICAL_SECTIONS.find((c) => t === c || t.includes(c) || c.includes(t));
  return match || t;
}

// Split the model's response into structured sections. Tolerates **bold**
// headings, '##' headings, and numbered headings. Drops anything that isn't
// one of the four canonical sections so a stray "מסקנות" intro doesn't show
// up as its own card.
function parseSections(text) {
  const sections = [];
  let current = null;
  const isHeading = (l) =>
    /^\*\*(.+?)\*\*\s*$/.test(l) ||      // **חוזקות**
    /^#{1,6}\s+\S+/.test(l) ||           // ## חוזקות
    /^\d+[.)]\s+\S+/.test(l);            // 1. חוזקות

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      const title = normalizeTitle(line);
      current = { title, bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: '', bullets: [] };
      sections.push(current);
    }
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      current.bullets.push(line.replace(/^[•\-*]\s*/, ''));
    } else {
      current.bullets.push(line);
    }
  }
  // Keep only canonical sections (drops stray "מסקנות" intros) and re-order
  // them deterministically for a consistent layout.
  const known = sections.filter((s) => CANONICAL_SECTIONS.includes(s.title) && s.bullets.length);
  known.sort((a, b) => CANONICAL_SECTIONS.indexOf(a.title) - CANONICAL_SECTIONS.indexOf(b.title));
  return known;
}

// Coach "thinking" step labels for the journal AI coach (see ThinkingIndicator).
const COACH_STEPS = [
  'אוסף את העסקאות שלך',
  'מחפש דפוסי הפסד חוזרים',
  'משווה תקופות וביצועים',
  'מגבש המלצות פעולה',
];

// ---- Stats dashboard --------------------------------------------------------
// Renders deterministic stats + mini charts BEFORE the AI commentary so the
// numbers come from us (trusted), not the model. The model only contextualizes
// them in the section cards below.

// findingsRanked is a UI-only field on the enrichment payloads. The prompt's
// contract is `findings`, and shipping both would spend the token budget on the
// same sentences twice.
const forModel = (obj) => {
  const copy = { ...obj };
  delete copy.findingsRanked;
  return copy;
};

const fmt$ = (v) => `${LRM}${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;
const fmt$Compact = (v) => {
  const sign = `${LRM}${v >= 0 ? '+' : '-'}`;
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

// dir defaults to ltr because almost every value here is a number, but a caller
// passing free-form Hebrew (a plan name) must be able to opt out — forcing LTR
// on a mixed string reorders its runs against how it reads everywhere else.
function StatCard({ label, value, sub, tone = 'neutral', Icon, dir = 'ltr' }) {
  const toneClass = tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className={`text-lg font-bold truncate ${toneClass}`} dir={dir} title={typeof value === 'string' ? value : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// Horizontal bars — each row shows a label, its P&L value, and a bar whose
// width is proportional to the absolute P&L. Profit = green, loss = red.
function PnlBars({ title, rows, Icon }) {
  if (!rows || !rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = (Math.abs(r.pnl) / max) * 100;
          const positive = r.pnl >= 0;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-secondary">{r.key} <span className="text-text-muted">· {r.trades}</span></span>
                <span className={positive ? 'text-profit font-semibold' : 'text-loss font-semibold'} dir="ltr">{fmt$(r.pnl)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full ${positive ? 'bg-profit' : 'bg-loss'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Donut-ish split bar — wins (green) vs losses (red) as a single horizontal bar
// with their counts. Cheaper than a real donut and reads instantly.
function WinLossBar({ wins, losses }) {
  const total = wins + losses;
  if (!total) return null;
  const winPct = (wins / total) * 100;
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-text-secondary">פילוח עסקאות</span>
        <span className="text-text-muted">{total} סה"כ</span>
      </div>
      <div className="h-3 rounded-full bg-bg-tertiary overflow-hidden flex">
        <div className="h-full bg-profit" style={{ width: `${winPct}%` }} />
        <div className="h-full bg-loss" style={{ width: `${100 - winPct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-profit">● {wins} רווחים ({winPct.toFixed(0)}%)</span>
        <span className="text-loss">● {losses} הפסדים ({(100 - winPct).toFixed(0)}%)</span>
      </div>
    </div>
  );
}

// Compact list of individual trades (best/worst) — pair, direction, strategy, P&L.
function TradeRows({ title, rows, Icon }) {
  if (!rows || !rows.length) return null;
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      <div>
        {rows.map((t, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border-primary/50 last:border-0">
            <span className="text-text-secondary min-w-0 truncate">
              {t.pair}
              {t.direction && <span className="text-text-muted"> · {t.direction === 'long' ? 'לונג' : t.direction === 'short' ? 'שורט' : t.direction}</span>}
              {t.strategy && <span className="text-text-muted"> · {t.strategy}</span>}
            </span>
            <span className={`${t.pnl >= 0 ? 'text-profit' : 'text-loss'} font-semibold shrink-0`} dir="ltr">{fmt$(t.pnl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Psychology — each row is a bucket (an emotion, a readiness band, a routine
// item) measured against the user's own baseline. A bucket under the minimum
// sample gets a "מדגם קטן" chip instead of being hidden, so a thin number is
// never read as a conclusion.
function DeltaRows({ title, rows, Icon, sub }) {
  if (!rows?.length) return null;
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      {sub && <p className="text-[10px] text-text-muted mb-2">{sub}</p>}
      <div className="space-y-2 mt-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-text-secondary min-w-0 truncate">
              {r.label}
              <span className="text-text-muted"> · {r.trades} עסקאות</span>
              {r.thin && (
                <span className="mr-1.5 text-[9px] px-1 py-0.5 rounded bg-bg-tertiary text-text-muted align-middle">
                  מדגם קטן
                </span>
              )}
            </span>
            <span className={`font-semibold shrink-0 ${r.delta >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">
              {fmt$(r.delta)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PsychologyPanel({ psych }) {
  if (!psych) return null;
  const emotionRows = psych.emotions.map((e) => ({ label: e.label, trades: e.trades, thin: e.thin, delta: e.avgPnlDelta }));
  const routineRows = psych.routine.map((c) => ({ label: c.label, trades: c.done.trades, thin: c.done.thin || c.skipped.thin, delta: c.avgPnlDelta }));
  const d = psych.discipline;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="ימים מוצלבים" value={psych.daysCovered} sub="יומן בוקר + עסקאות" Icon={HeartPulse} />
        <StatCard
          label="ממוצע לעסקה (בסיס)"
          value={fmt$Compact(psych.baseline.avgPnl)}
          sub={`${psych.baseline.winRate}% הצלחה`}
          tone={psych.baseline.avgPnl >= 0 ? 'profit' : 'loss'}
          Icon={Target}
        />
        <StatCard label="מוכנות בימים ירוקים" value={psych.avgReadinessOnGreenDays} sub="מתוך 10" tone="profit" Icon={TrendingUp} />
        <StatCard label="מוכנות בימים אדומים" value={psych.avgReadinessOnRedDays} sub="מתוך 10" tone="loss" Icon={TrendingDown} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <DeltaRows
          title="רגש הבוקר → כסף"
          sub="פער ברווח הממוצע לעסקה מול הבסיס שלך"
          rows={emotionRows}
          Icon={HeartPulse}
        />
        <DeltaRows
          title="שגרת הבוקר → כסף"
          sub="ההפרש בין ימים שביצעת את הפעולה לימים שלא"
          rows={routineRows}
          Icon={Sparkles}
        />
      </div>

      {d && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-accent-primary" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">משמעת מול תוצאה</h4>
              <p className="text-[10px] text-text-muted">דיווח עצמי ביומן הערב, ברמת יום</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-bg-tertiary p-3">
              <div className="text-[11px] text-text-muted mb-1">עמדת בתוכנית</div>
              <div className={`text-base font-bold ${d.followedPlan.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{fmt$(d.followedPlan.avgPnl)}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{d.followedPlan.trades} עסקאות · {d.followedPlan.winRate}%</div>
            </div>
            <div className="rounded-lg bg-bg-tertiary p-3">
              <div className="text-[11px] text-text-muted mb-1">סטית מהתוכנית</div>
              <div className={`text-base font-bold ${d.brokePlan.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`} dir="ltr">{fmt$(d.brokePlan.avgPnl)}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{d.brokePlan.trades} עסקאות · {d.brokePlan.winRate}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Plan audit — what the trader wrote down vs what they actually did. Rules the
// audit could not measure are listed explicitly; a rule the user defined must
// never just vanish from the report.
function PlanAuditPanel({ audit }) {
  if (!audit) return null;
  const c = audit.compliance;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="התוכנית" value={audit.planName} sub={audit.planActive ? 'פעילה' : 'לא פעילה'} Icon={ClipboardCheck} dir="auto" />
        <StatCard
          label="עסקאות שנבדקו"
          value={audit.tradesAudited}
          sub={c?.unmeasuredTrades ? `${c.unmeasuredTrades} ללא שדות להשוואה` : 'נמדד ברמת עסקה'}
          Icon={Target}
        />
        {c && (
          <StatCard
            label="בתוך התוכנית"
            value={fmt$Compact(c.onPlan.avgPnl)}
            sub={`${c.onPlan.trades} עסקאות · ${c.onPlan.winRate}% · מול כללי התוכנית`}
            tone={c.onPlan.avgPnl >= 0 ? 'profit' : 'loss'}
            Icon={TrendingUp}
          />
        )}
        {c && (
          <StatCard
            label="חריגה מהתוכנית"
            value={fmt$Compact(c.offPlan.avgPnl)}
            sub={`${c.offPlan.trades} עסקאות · ${c.offPlan.winRate}% · מול כללי התוכנית`}
            tone={c.offPlan.avgPnl >= 0 ? 'profit' : 'loss'}
            Icon={TrendingDown}
          />
        )}
      </div>

      {audit.findings.length > 0 && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-primary">חריגות, לפי העלות שלהן</h4>
          </div>
          <ul className="space-y-1.5">
            {audit.findings.map((f) => (
              <li key={f} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
                <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-loss shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit.notMeasurable.length > 0 && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-primary mb-2">מה לא ניתן היה לבדוק</h4>
          <ul className="space-y-1">
            {audit.notMeasurable.map((n) => (
              <li key={n.rule} className="text-[11px] text-text-muted">
                <span className="text-text-secondary">{n.rule}</span> — {n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// This-month vs previous-month comparison table (Premium stats only).
function CompareMonths({ cmp }) {
  const prev = cmp?.prevMonth;
  const cur = cmp?.thisMonth;
  if (!prev && !cur) return null;
  const rows = [
    { label: 'P&L', prev: prev ? fmt$Compact(prev.pnl) : '—', cur: cur ? fmt$Compact(cur.pnl) : '—', up: (cur?.pnl ?? 0) >= (prev?.pnl ?? 0) },
    { label: 'אחוז הצלחה', prev: prev ? `${prev.winRate}%` : '—', cur: cur ? `${cur.winRate}%` : '—', up: (cur?.winRate ?? 0) >= (prev?.winRate ?? 0) },
    { label: 'Profit Factor', prev: prev?.profitFactor ?? '—', cur: cur?.profitFactor ?? '—', up: (cur?.profitFactor ?? 0) >= (prev?.profitFactor ?? 0) },
    { label: 'עסקאות', prev: prev?.total ?? '—', cur: cur?.total ?? '—', up: null },
  ];
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4">
      <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-text-muted pb-2 border-b border-border-primary/50">
        <span>מדד</span>
        <span className="text-center">חודש קודם</span>
        <span className="text-center">החודש</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-3 gap-2 text-xs py-2 border-b border-border-primary/40 last:border-0 items-center">
          <span className="text-text-secondary">{r.label}</span>
          <span className="text-center text-text-muted" dir="ltr">{r.prev}</span>
          <span className={`text-center font-semibold ${r.up == null ? 'text-text-primary' : r.up ? 'text-profit' : 'text-loss'}`} dir="ltr">{r.cur}</span>
        </div>
      ))}
    </div>
  );
}

// The dashboard adapts to the question asked (focus) — showing ONLY the charts
// that answer it. Without this every button rendered the identical full
// dashboard, which made all reports look like the same output.
function StatsDashboard({ stats, focus }) {
  if (!stats || stats.empty) return null;
  const s = stats.summary || {};

  const byPnlAsc = (a, b) => a.pnl - b.pnl;
  const byPnlDesc = (a, b) => b.pnl - a.pnl;
  const losingPairs = (stats.byPair || []).filter((r) => r.pnl < 0).sort(byPnlAsc);
  const winningPairs = (stats.byPair || []).filter((r) => r.pnl > 0).sort(byPnlDesc);
  const losingSessions = (stats.bySession || []).filter((r) => r.pnl < 0).sort(byPnlAsc);

  // Focused views — each returns only what answers the clicked question.
  if (focus === 'losses' && (losingPairs.length || losingSessions.length || stats.worstTrades?.length)) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <PnlBars title="איפה אתה מפסיד — לפי מטבע" rows={losingPairs.slice(0, 5)} Icon={TrendingDown} />
          {losingSessions.length > 0 && <PnlBars title="סשנים מפסידים" rows={losingSessions} Icon={Target} />}
        </div>
        <TradeRows title="העסקאות הגרועות ביותר" rows={stats.worstTrades} Icon={TrendingDown} />
      </div>
    );
  }
  if (focus === 'topPair' && (winningPairs.length || stats.bestTrades?.length)) {
    return (
      <div className="space-y-3">
        <PnlBars title="המטבעות הרווחיים שלך" rows={winningPairs.slice(0, 5)} Icon={TrendingUp} />
        <TradeRows title="העסקאות הטובות ביותר" rows={stats.bestTrades} Icon={TrendingUp} />
      </div>
    );
  }
  if (focus === 'sessionEdge' && stats.bySession?.length) {
    return <PnlBars title="ביצועים לפי סשן מסחר" rows={[...stats.bySession].sort(byPnlDesc)} Icon={Target} />;
  }
  if (focus === 'strategyEdge' && stats.byStrategy?.length) {
    return <PnlBars title="ביצועים לפי אסטרטגיה" rows={[...stats.byStrategy].sort(byPnlDesc)} Icon={Lightbulb} />;
  }
  if (focus === 'compareMonth' && stats.compareToPrevMonth) {
    return <CompareMonths cmp={stats.compareToPrevMonth} />;
  }
  if (focus === 'planAudit') {
    return stats.planAudit
      ? <PlanAuditPanel audit={stats.planAudit} />
      : (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-xs text-text-secondary">
          לא נמצאה תוכנית מסחר לבדוק מולה. צור תוכנית במסך "תוכניות מסחר" והגדר בה מטבעות, טיימפריימים, סשנים ותקרות סיכון.
        </div>
      );
  }
  if (focus === 'psychology') {
    return stats.psychology
      ? <PsychologyPanel psych={stats.psychology} />
      : (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-xs text-text-secondary">
          אין עדיין ימים שבהם מילאת יומן בוקר וגם סגרת עסקה — בלי הצלבה כזו אי אפשר למדוד את ההשפעה של מצב הראש.
        </div>
      );
  }
  if (focus === 'mistakes' && (stats.worstTrades?.length || losingPairs.length)) {
    return (
      <div className="space-y-3">
        <TradeRows title="העסקאות הגרועות ביותר" rows={stats.worstTrades} Icon={TrendingDown} />
        {losingPairs.length > 0 && <PnlBars title="המטבעות שמושכים אותך למטה" rows={losingPairs.slice(0, 5)} Icon={TrendingDown} />}
      </div>
    );
  }

  // Default (overview / "נתח עסקאות") — the full dashboard.
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          label="P&L כולל"
          value={fmt$Compact(s.pnl || 0)}
          tone={(s.pnl || 0) >= 0 ? 'profit' : 'loss'}
          Icon={TrendingUp}
        />
        <StatCard label="אחוז הצלחה" value={`${s.winRate || 0}%`} sub={`${s.wins}/${s.total} עסקאות`} Icon={Target} />
        <StatCard
          label="Profit Factor"
          value={s.profitFactor != null ? s.profitFactor : '—'}
          sub={s.profitFactor >= 1.5 ? 'מצוין' : s.profitFactor >= 1 ? 'תקין' : 'לשיפור'}
          tone={s.profitFactor >= 1 ? 'profit' : 'loss'}
          Icon={Sparkles}
        />
        <StatCard
          label="רווח מול הפסד ממוצע"
          value={`${fmt$Compact(s.avgWin || 0)} / ${fmt$Compact(s.avgLoss || 0)}`}
          Icon={Lightbulb}
        />
      </div>

      <WinLossBar wins={s.wins || 0} losses={s.losses || 0} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <PnlBars title="מטבעות מובילים" rows={(stats.byPair || []).slice(0, 5)} Icon={TrendingUp} />
        {stats.bySession?.length > 0 && (
          <PnlBars title="לפי סשן מסחר" rows={stats.bySession} Icon={Target} />
        )}
        {stats.byStrategy?.length > 0 && !stats.bySession?.length && (
          <PnlBars title="לפי אסטרטגיה" rows={stats.byStrategy} Icon={Lightbulb} />
        )}
        {!stats.bySession?.length && !stats.byStrategy?.length && (stats.byDirection || []).length > 0 && (
          <PnlBars title="לפי כיוון" rows={stats.byDirection} Icon={TrendingDown} />
        )}
      </div>
    </div>
  );
}

// Animated "AI is thinking" indicator — cycles short labels so it feels like
// the model is actually working, not just spinning a wheel.

export default function AICoachPanel({ trades }) {
  const { user, isPremium } = useAuth();
  const { activeJournal } = useJournalContext();
  const liveBalance = useLinkedExchangeBalance(activeJournal?.exchange);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [stats, setStats] = useState(null); // computed snapshot used by the dashboard
  const [error, setError] = useState('');
  const [activePrompt, setActivePrompt] = useState(null);
  // The mentality journals are fetched once, on the first analysis, instead of
  // held on a live subscription — the journal page already carries two of those
  // and this data only matters at the moment the coach runs.
  const journalsRef = useRef(null);
  // undefined = never fetched. null is a real answer (the user has no plan),
  // so it can't double as the "not loaded yet" marker.
  const plansRef = useRef(undefined);

  const loadMentalityJournals = async () => {
    if (!user) return null;
    if (journalsRef.current) return journalsRef.current;
    const [morning, evening] = await Promise.all([
      getUserCollectionDocs(user.uid, 'morningJournals'),
      getUserCollectionDocs(user.uid, 'eveningJournals'),
    ]);
    journalsRef.current = { morning, evening };
    return journalsRef.current;
  };

  const loadActivePlan = async () => {
    if (!user) return null;
    if (plansRef.current !== undefined) return plansRef.current;
    const plans = await getUserCollectionDocs(user.uid, 'tradingPlans');
    // Shared with the analyst page — the two must never audit different plans.
    plansRef.current = pickActivePlan(plans);
    return plansRef.current;
  };

  const run = async (promptKey = null) => {
    setActivePrompt(promptKey);
    setLoading(true);
    setError('');
    try {
      const built = buildCoachStats(trades, { premium: isPremium });
      if (built.empty) {
        setError(isPremium ? 'אין עדיין עסקאות סגורות לנתח.' : 'אין עסקאות סגורות החודש. הוסף עסקאות כדי לקבל ניתוח.');
        setReport('');
        setStats(null);
        return;
      }
      // Psychology is an enrichment, never a prerequisite — if the journals
      // fail to load the report still goes out, just without that section.
      try {
        const j = await loadMentalityJournals();
        // Same trade window buildCoachStats used, so a free user doesn't get
        // this-month headline numbers next to an all-time psychology section.
        const psych = j && buildPsychologyStats(coachScopeTrades(trades, { premium: isPremium }), j.morning, j.evening);
        if (psych) built.psychology = forModel(psych);
      } catch {
        journalsRef.current = null;
      }
      // Same deal for the plan audit — an enrichment, never a prerequisite.
      try {
        const plan = await loadActivePlan();
        const audit = plan && auditPlan(plan, coachScopeTrades(trades, { premium: isPremium }), {
          // Same basis the analyst panel uses: the live wallet when the journal
          // is linked to a connected exchange, the typed opening balance only
          // as a fallback.
          accountBalance: liveBalance != null ? liveBalance : (Number(activeJournal?.initialBalance) || 0),
        });
        if (audit) built.planAudit = forModel(audit);
      } catch {
        plansRef.current = undefined;
      }
      setStats(built);
      const text = await generateCoachReport(promptKey ? { ...built, focus: promptKey } : built, isPremium ? 'deep' : 'short');
      setReport(text);
    } catch (e) {
      setError(e.message || 'הניתוח נכשל. נסה שוב בעוד רגע.');
      setReport('');
    } finally {
      setLoading(false);
    }
  };

  const sections = report ? parseSections(report) : [];

  return (
    <div className="space-y-4 mt-2 max-w-3xl mx-auto">
      {/* Header */}
      <m.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-primary bg-bg-secondary px-4 py-3.5"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)' }}>
            <BrainCircuit className="w-5 h-5" style={{ color: '#06060a' }} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text-primary">ניתוח AI אישי</h2>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-hover font-bold">
                  <Crown className="w-2.5 h-2.5" /> Premium
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {isPremium ? 'מבוסס על כל העסקאות הסגורות ביומן' : 'במסלול החינמי: מבוסס על החודש האחרון'}
            </p>
          </div>
        </div>
        <button
          onClick={() => run(null)}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent-muted hover:bg-accent-primary text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> מנתח...</>
            : <><Sparkles className="w-4 h-4" /> ניתוח מלא</>}
        </button>
      </m.div>

      {/* Deterministic analysis — correct on open, costs nothing, needs no model */}
      <AnalystInsights trades={trades} />

      {/* Focused questions for the model */}
      <div className="rounded-2xl border border-border-primary bg-bg-secondary p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-3">
          <Sparkles className="w-4 h-4 text-accent-hover" /> שאל את ה-AI על המסחר שלך
        </h3>
        <div className="flex flex-wrap gap-2">
          {(isPremium ? [...FREE_PROMPTS, ...PREMIUM_PROMPTS] : FREE_PROMPTS).map((p) => (
            <button
              key={p.id}
              onClick={() => run(p.id)}
              disabled={loading}
              className={`text-[13px] h-9 px-3.5 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
                activePrompt === p.id
                  ? 'bg-accent-primary/15 border-accent-primary/60 text-accent-hover font-semibold'
                  : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
          {!isPremium && PREMIUM_PROMPTS.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate('/premium')}
              className="text-[13px] h-9 px-3.5 rounded-xl border border-dashed border-border-hover bg-transparent text-text-muted hover:text-accent-hover cursor-pointer inline-flex items-center gap-1.5"
              title="שדרג ל-Premium כדי לפתוח"
            >
              <Lock className="w-3 h-3" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thinking indicator while the model is working */}
      {loading && <ThinkingIndicator steps={COACH_STEPS} />}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-loss/30 bg-loss/10 text-sm text-loss">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            {error.includes('שדרג ל-Premium') && (
              <button onClick={() => navigate('/premium')} className="mt-1 text-xs underline text-accent-primary cursor-pointer">
                לשדרוג Premium
              </button>
            )}
          </div>
        </div>
      )}

      {/* Structured chat-style report */}
      {sections.length > 0 && !loading && (
        <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Focused stats — only the charts that answer the question asked */}
          <StatsDashboard stats={stats} focus={activePrompt} />

          {/* Section cards */}
          {sections.map((s, idx) => {
            const meta = SECTION_META[s.title] || DEFAULT_META;
            const { Icon } = meta;
            return (
              <m.div
                key={`${s.title}-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * idx }}
                className={`border ${meta.border} ${meta.bg} rounded-2xl p-4 space-y-2`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <h3 className={`text-sm font-bold ${meta.color}`}>{s.title || 'מסקנות'}</h3>
                </div>
                <ul className="space-y-1.5">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary leading-relaxed">
                      <span className={`mt-2 inline-block w-1.5 h-1.5 rounded-full ${meta.color.replace('text-', 'bg-')} shrink-0`} />
                      <span dangerouslySetInnerHTML={{ __html: renderBulletHtml(b) }} />
                    </li>
                  ))}
                </ul>
              </m.div>
            );
          })}
        </m.div>
      )}

      {/* Footer upsell for free users */}
      {!isPremium && (
        <div className="text-center text-xs text-text-muted pt-1">
          {`במסלול החינמי: 5 ניתוחים בחודש.`}
          <button onClick={() => navigate('/premium')} className="text-accent-primary mr-1 cursor-pointer">
            שדרג ל-Premium לניתוחים ללא הגבלה
          </button>
        </div>
      )}
    </div>
  );
}
