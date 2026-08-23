import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, ShieldCheck, CheckCircle2, Search, RefreshCw, Download, ChevronUp, ChevronDown, ChevronLeft, Mail, Calendar, Coins, TrendingUp, Percent, Sparkles, BookOpen, FlaskConical, Activity, FileText, Brain, Crown, Send, X, Ticket, Plus, Minus, Trash2, Copy, ScrollText, Share2, Link2, BarChart3, AlertTriangle, Clock, DollarSign, Hourglass, Image, Trophy, Loader2, Bell, StickyNote, Flame, Ban, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Card from '../shared/Card';
import AnimatedValue from '../shared/AnimatedValue';
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers, getUserSubcollectionCount, adminGrantPremium, adminRevokePremium, addPayment, getAllPayments, getAdminMeta, setAdminMeta } from '../../services/firestoreService';
import { APP_VERSION } from '../../utils/constants';
import { fetchUserAiUsage, fetchGlobalAiUsage, fetchAiStats, fetchSystemHealth, testAiProviders } from '../../hooks/useAiUsage';
import { adminSendNotification, adminSendBulkNotification, adminScheduleExpiryReminders, adminCancelExpiryReminders, adminRefreshPlanCache, adminListAuditEvents, adminSendTestDigest, adminSendPaymentEmail, adminDeleteUser, adminGetPushStatus, adminGetExchangesStatus, adminGetFirebaseUsage } from '../../services/pushService';
import { adminListCoupons, adminCreateCoupon, adminDeleteCoupon, couponShareUrl } from '../../services/couponService';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';
import Modal from '../shared/Modal';
import {
  toDate, formatDate, isUserPremium, lastActiveMs, daysSinceActive, activeWithin,
  daysUntilExpiry, relativeActive, ILS, csvCell,
} from '../../utils/adminStats';

// Compute effective premium status from a user doc (admins are always premium;
// otherwise plan='premium' and planExpires (if set) must be in the future).
const DAY_MS = 24 * 60 * 60 * 1000;

// Revenue-chart buckets, derived from each payment's `days` field (addPayment
// stores days: null for lifetime grants). Stack order = object order.
const REVENUE_BUCKETS = {
  monthly:  { label: 'חודשי',    color: 'var(--color-accent-primary)' },
  yearly:   { label: 'שנתי',     color: '#fbbf24' },  // amber-400
  lifetime: { label: 'לייפטיים', color: '#a78bfa' },  // violet-400
  other:    { label: 'אחר',      color: '#64748b' },  // slate-500
};

// Display names for connected-exchange ids (the worker returns ids only —
// mirrors the list in ExchangeSettings.jsx).
const EXCHANGE_NAMES = {
  bybit: 'Bybit', mexc: 'MEXC', okx: 'OKX', bitget: 'Bitget', binance: 'Binance', mt5: 'MetaTrader 5',
};

// Mirrors the worker's AI caps (FREE_LIMITS.aiPerDay / AI_PREMIUM_LIMITS.day /
// AI_IMAGE_DAILY_LIMIT) — used only for the admin overview estimates.
const AI_TEXT_LIMIT = { free: 20, premium: 200 };
const AI_IMAGE_LIMIT = 10; // premium only

// Rough $ cost estimate. We track request COUNTS (not tokens), so we assume
// average token sizes per request and apply Groq pay-as-you-go pricing
// (Llama 3.3 70B for text, Llama 4 Scout for vision). Estimate only.
const AI_COST_EST = {
  textPerReq: (800 * 0.59 + 500 * 0.79) / 1e6,   // ≈ $0.00087
  imagePerReq: (1600 * 0.11 + 500 * 0.34) / 1e6, // ≈ $0.00035
};
const estimateAiCost = (text, image) => text * AI_COST_EST.textPerReq + image * AI_COST_EST.imagePerReq;

// Client mirror of the worker's global daily AI circuit-breaker
// (AI_GLOBAL_DAILY_CEILING in worker/index.js). NOT exposed by any endpoint, so
// this can drift if the worker's value changes — keep the two in sync manually.
const AI_GLOBAL_DAILY_CEILING = 50000;

// Funnel bar colours (cyan → violet → amber → green) — matches the StatMini
// accent palette; the shrinking width, not the hue, conveys the drop-off.
const FUNNEL_ACCENTS = ['var(--color-accent-primary)', '#8b5cf6', '#f59e0b', 'var(--color-profit)'];

// Per-tile accent palette — gives the KPI strip colour variety + a soft corner
// glow (21st-style) instead of five identical grey boxes.
const STAT_ACCENTS = {
  cyan:   { text: 'text-accent-primary', chip: 'bg-accent-primary/12 text-accent-primary', glow: 'rgba(0,191,255,0.12)' },
  green:  { text: 'text-profit',         chip: 'bg-profit/12 text-profit',                 glow: 'rgba(34,197,94,0.12)' },
  amber:  { text: 'text-amber-400',      chip: 'bg-amber-400/12 text-amber-400',           glow: 'rgba(251,191,36,0.12)' },
  violet: { text: 'text-violet-400',     chip: 'bg-violet-400/12 text-violet-400',         glow: 'rgba(139,92,246,0.12)' },
};

function StatCard({ icon, label, value, onClick, accent = 'cyan' }) {
  const a = STAT_ACCENTS[accent] || STAT_ACCENTS.cyan;
  const inner = (
    <>
      {/* soft corner glow */}
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${a.glow} 0%, transparent 70%)` }} />
      <div className="relative flex items-center gap-3.5">
        <div className={`shrink-0 rounded-xl p-2.5 ${a.chip}`}>{icon}</div>
        <div className="min-w-0">
          <div className={`text-2xl md:text-[26px] font-bold leading-none ${a.text}`} dir="ltr">
            <AnimatedValue value={String(value)} />
          </div>
          <div className="text-[13px] text-text-secondary mt-1.5 truncate">{label}</div>
        </div>
        {onClick && (
          <ChevronLeft className="w-4 h-4 text-text-muted mr-auto shrink-0 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
        )}
      </div>
    </>
  );
  const cls = 'relative overflow-hidden p-4';
  if (!onClick) return <Card className={cls}>{inner}</Card>;
  return (
    <Card as="button" type="button" onClick={onClick} hover className={`${cls} group w-full text-right`}>
      {inner}
    </Card>
  );
}

// Modern section panel — accent icon chip + title + optional right-side action.
// `dense` tightens padding, header spacing and the icon chip for compact
// dashboard cards (charts/KPIs) that don't need the full panel breathing room.
function SectionCard({ icon, title, action, className = '', dense = false, children }) {
  return (
    <Card className={`${dense ? 'p-3.5' : 'p-4 md:p-5'} ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${dense ? 'mb-2.5' : 'mb-4'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`${dense ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg bg-accent-primary/12 text-accent-primary flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <h3 className={`font-semibold text-text-primary truncate ${dense ? 'text-[13px]' : 'text-sm'}`}>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// Small accent stat tile (DAU/WAU/MAU, AI counters, …). `compact` shrinks
// padding + value size for denser cards.
function StatMini({ value, label, accent = 'cyan', icon, compact = false }) {
  const a = STAT_ACCENTS[accent] || STAT_ACCENTS.cyan;
  return (
    <div className={`rounded-xl bg-bg-tertiary/40 border border-border-primary flex items-center ${compact ? 'px-2.5 py-2 gap-2' : 'px-3 py-3 gap-3'}`}>
      {icon && <div className={`shrink-0 rounded-lg ${compact ? 'p-1.5' : 'p-2'} ${a.chip}`}>{icon}</div>}
      <div className="min-w-0">
        <div className={`font-bold leading-none ${compact ? 'text-base' : 'text-xl'} ${a.text}`} dir="ltr"><AnimatedValue value={String(value)} /></div>
        <div className={`text-[10px] text-text-muted truncate ${compact ? 'mt-0.5' : 'mt-1.5'}`}>{label}</div>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: 'displayName', label: 'משתמש' },
  { key: 'email', label: 'אימייל' },
  { key: 'createdAt', label: 'הצטרף' },
  { key: 'lastActive', label: 'פעילות אחרונה' },
  { key: 'onboardingCompleted', label: 'אונבורדינג' },
  { key: 'role', label: 'תפקיד' },
];

function sortValue(u, key) {
  if (key === 'createdAt') return toDate(u.createdAt)?.getTime() || 0;
  if (key === 'lastActive') return lastActiveMs(u);
  if (key === 'onboardingCompleted') return u.onboardingCompleted ? 1 : 0;
  if (key === 'role') return u.role === 'admin' ? 1 : 0;
  return (u[key] || '').toString().toLowerCase();
}


export default function AdminPanel() {
  const { isAdmin, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [onboardFilter, setOnboardFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedUser, setSelectedUser] = useState(null);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  // { title, users } — opened by clicking a stat card to list its users.
  const [listModal, setListModal] = useState(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reengaging, setReengaging] = useState(null); // uid currently being re-engaged

  // Quick re-engagement push for a churn-risk customer.
  const quickReengage = async (u) => {
    setReengaging(u.id);
    try {
      await adminSendNotification({
        uid: u.id,
        title: 'ה-Premium שלך מחכה לך 👑',
        body: 'המנוי שלך פעיל וממתין — חזור לעדכן את יומן המסחר ולנצל את הניתוחים החכמים של TradeOS.',
        url: '/',
      });
      toast.success('נשלחה התראת חזרה');
    } catch {
      toast.error('שליחת ההתראה נכשלה');
    } finally {
      setReengaging(null);
    }
  };
  // Aggregate AI usage across all users today (text + image) from the worker.
  const [globalAi, setGlobalAi] = useState(null);
  // Daily AI stats (counts + real tokens) for the usage-over-time graph.
  const [aiStats, setAiStats] = useState(null);
  const [statsDays, setStatsDays] = useState(30);
  // System health (cron heartbeat, push/AI configured).
  const [health, setHealth] = useState(null);
  // AI provider connectivity self-test result + in-flight flag.
  const [aiTest, setAiTest] = useState(null);
  const [aiTesting, setAiTesting] = useState(false);
  const runAiTest = async () => {
    setAiTesting(true);
    try { setAiTest(await testAiProviders()); }
    finally { setAiTesting(false); }
  };
  // Firebase (Firestore) consumption vs the Spark free-tier limits —
  // { monitoring, monitoringError?, counts, limits } or { error: true }.
  const [fbUsage, setFbUsage] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);

  // After load() refreshes `users`, keep `selectedUser` pointing at the fresh
  // copy so the open detail modal reflects the new plan/role immediately
  // (otherwise grant/revoke updates the table but the modal still shows the
  // stale snapshot we took when the row was clicked).
  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.id === selectedUser.id);
    if (fresh && fresh !== selectedUser) setSelectedUser(fresh);
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    setLoading(true);
    setError(null);
    // payments lives in an admin-only collection; if rules aren't deployed
    // yet we degrade gracefully to an empty list (revenue widgets just show 0).
    Promise.all([
      getAllUsers(),
      getAllPayments().catch(() => []),
    ])
      .then(([data, pays]) => {
        setUsers(data); setPayments(pays || []); setLoadedAt(Date.now());
      })
      .catch((e) => setError(e?.code === 'permission-denied'
        ? 'אין הרשאת אדמין — ודא שהשדה role מוגדר ל-admin במסמך המשתמש שלך.'
        : 'טעינת המשתמשים נכשלה. נסה שוב.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) Promise.resolve().then(load);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchGlobalAiUsage().then((g) => { if (!cancelled) setGlobalAi(g); });
    return () => { cancelled = true; };
  }, [isAdmin, loadedAt]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setAiStats(null);
    fetchAiStats(statsDays).then((s) => { if (!cancelled) setAiStats(s); });
    return () => { cancelled = true; };
  }, [isAdmin, statsDays, loadedAt]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchSystemHealth().then((h) => { if (!cancelled) setHealth(h); });
    return () => { cancelled = true; };
  }, [isAdmin, loadedAt]);

  // Firebase consumption — best-effort: a failure shows an error line in the
  // card, it must never break the panel. Refreshed with the global "רענן"
  // (loadedAt) and by the card's own refresh button.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setFbLoading(true);
    adminGetFirebaseUsage()
      .then((d) => { if (!cancelled) setFbUsage(d); })
      .catch(() => { if (!cancelled) setFbUsage((prev) => prev || { error: true }); })
      .finally(() => { if (!cancelled) setFbLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, loadedAt]);

  const refreshFbUsage = () => {
    setFbLoading(true);
    adminGetFirebaseUsage()
      .then((d) => setFbUsage(d))
      .catch(() => setFbUsage((prev) => prev || { error: true }))
      .finally(() => setFbLoading(false));
  };

  // Active users (DAU/WAU/MAU) and a 30-day signups series — both derived from
  // the already-loaded users list, no extra queries.
  const growth = useMemo(() => {
    const DAY = 86400000;
    const now = loadedAt || Date.now();
    let dau = 0, wau = 0, mau = 0;
    for (const u of users) {
      const ms = lastActiveMs(u);
      if (!ms) continue;
      const age = now - ms;
      if (age <= DAY) dau++;
      if (age <= 7 * DAY) wau++;
      if (age <= 30 * DAY) mau++;
    }
    const buckets = {};
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      buckets[key] = 0;
      series.push({ key, date: d });
    }
    for (const u of users) {
      const c = toDate(u.createdAt);
      if (!c) continue;
      const key = `${c.getFullYear()}-${c.getMonth() + 1}-${c.getDate()}`;
      if (key in buckets) buckets[key]++;
    }
    return { dau, wau, mau, signups: series.map((s) => ({ date: s.date, count: buckets[s.key] })) };
  }, [users, loadedAt]);

  // Activity & retention (epic #223): calendar-day DAU (Israel time) + rolling
  // WAU/MAU, an 8-week signup-cohort split by "active in the last 7 days", and
  // a recency breakdown of the whole base. Cohorts use the SAME rolling week
  // buckets as the "הצטרפות חדשה — 8 שבועות אחרונים" chart in the analytics
  // modal so the two align visually. All derived from lastActive/createdAt —
  // no extra queries; toDate/lastActiveMs already guard garbage values.
  const retention = useMemo(() => {
    const now = loadedAt || Date.now();
    const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const todayKey = dayKey(new Date(now));
    let today = 0, week = 0, month = 0, dormant = 0, never = 0;
    for (const u of users) {
      const ms = lastActiveMs(u);
      if (!ms) { never++; continue; }
      if (dayKey(new Date(ms)) === todayKey) today++;
      if (activeWithin(u, 7)) week++;
      if (activeWithin(u, 30)) month++;
      if (daysSinceActive(u) >= 30) dormant++; // mirrors the 'inactive30' filter
    }
    const fmt = (t) => { const d = new Date(t); return `${d.getDate()}/${d.getMonth() + 1}`; };
    const cohorts = [];
    for (let i = 7; i >= 0; i--) {
      const end = now - i * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      let joined = 0, retained = 0;
      for (const u of users) {
        const t = toDate(u.createdAt)?.getTime() || 0;
        if (t > start && t <= end) {
          joined++;
          if (activeWithin(u, 7)) retained++;
        }
      }
      cohorts.push({
        label: i === 0 ? 'השבוע' : `-${i}`,
        full: `${fmt(start + DAY_MS)}–${fmt(end)}`,
        joined,
        retained,
        inactive: joined - retained,
        pct: joined ? Math.round((retained / joined) * 100) : 0,
      });
    }
    return { today, week, month, dormant, never, cohorts };
  }, [users, loadedAt]);

  const stats = useMemo(() => {
    const weekAgo = loadedAt - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = [];
    const onboarded = [];
    const admins = [];
    const premium = [];
    for (const u of users) {
      const created = toDate(u.createdAt);
      if (created && created.getTime() >= weekAgo) newThisWeek.push(u);
      if (u.onboardingCompleted) onboarded.push(u);
      if (u.role === 'admin') admins.push(u);
      if (isUserPremium(u) && u.role !== 'admin') premium.push(u);
    }
    return { total: users, newThisWeek, onboarded, admins, premium };
  }, [users, loadedAt]);

  // Users at/over 80% of their daily AI quota (text or image) today — combines
  // the worker's per-user counts with each user's premium status to derive the
  // right cap. Sorted by how close to the limit they are.
  const quotaAlerts = useMemo(() => {
    if (!globalAi?.perUser) return [];
    const out = [];
    for (const [uid, v] of Object.entries(globalAi.perUser)) {
      const u = users.find((x) => x.id === uid);
      const premium = u ? isUserPremium(u) : false;
      const textLimit = premium ? AI_TEXT_LIMIT.premium : AI_TEXT_LIMIT.free;
      const imgLimit = premium ? AI_IMAGE_LIMIT : 0;
      const textPct = textLimit ? (v.text || 0) / textLimit : 0;
      const imgPct = imgLimit ? (v.image || 0) / imgLimit : 0;
      const pct = Math.max(textPct, imgPct);
      if (pct >= 0.8) out.push({ uid, u, premium, text: v.text || 0, textLimit, image: v.image || 0, imgLimit, pct });
    }
    return out.sort((a, b) => b.pct - a.pct);
  }, [globalAi, users]);

  // Premium customers who haven't opened the app in 7+ days — the "churn risk"
  // list. Sorted by how long they've been gone (longest first).
  const churned = useMemo(() => {
    return users
      .filter((u) => u.role !== 'admin' && isUserPremium(u) && lastActiveMs(u) > 0 && daysSinceActive(u) >= 7)
      .sort((a, b) => daysSinceActive(b) - daysSinceActive(a));
  }, [users]);

  // Premium customers whose plan expires within the next 7 days — reach out to
  // renew them before they lapse. Sorted by soonest expiry.
  const expiringSoon = useMemo(() => {
    return users
      .filter((u) => {
        if (u.role === 'admin' || !isUserPremium(u) || !u.planExpires) return false;
        const d = daysUntilExpiry(u);
        return d >= 0 && d <= 7;
      })
      .sort((a, b) => daysUntilExpiry(a) - daysUntilExpiry(b));
  }, [users]);

  // Customer analytics: signups per week, conversion, activity, retention.
  const analytics = useMemo(() => {
    const now = Date.now();
    const customers = users.filter((u) => u.role !== 'admin');
    const totalC = customers.length;
    const premiumC = customers.filter((u) => isUserPremium(u)).length;
    const onboardedC = customers.filter((u) => u.onboardingCompleted).length;
    const active7 = customers.filter((u) => activeWithin(u, 7)).length;
    const active30 = customers.filter((u) => activeWithin(u, 30)).length;
    const everActive = customers.filter((u) => lastActiveMs(u) > 0).length;

    // Signups in each of the last 8 weeks (oldest → newest).
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const end = now - i * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      const count = users.filter((u) => {
        const t = toDate(u.createdAt)?.getTime() || 0;
        return t > start && t <= end;
      }).length;
      weeks.push({ count, weeksAgo: i });
    }

    // Most active customers — most recently seen first (only those we've seen).
    const topActive = [...customers]
      .filter((u) => lastActiveMs(u) > 0)
      .sort((a, b) => lastActiveMs(b) - lastActiveMs(a))
      .slice(0, 6);

    // Revenue: total from the payments log; MRR normalises each active paid
    // plan to a 30-day rate (lifetime grants are one-off → excluded from MRR).
    const totalRevenue = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const payingUids = new Set(payments.filter((p) => p.uid).map((p) => p.uid));
    const payingCount = payingUids.size;
    let mrr = 0;
    for (const u of customers) {
      if (!isUserPremium(u)) continue;
      const amt = Number(u.planAmount);
      const days = Number(u.planDays);
      if (amt > 0 && days > 0) mrr += (amt / days) * 30;
    }
    const revenueThisMonth = payments
      .filter((p) => now - (toDate(p.createdAt)?.getTime() || 0) < 30 * DAY_MS)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return {
      totalC,
      premiumC,
      conversion: totalC ? Math.round((premiumC / totalC) * 100) : 0,
      onboardRate: totalC ? Math.round((onboardedC / totalC) * 100) : 0,
      openRate: totalC ? Math.round((active7 / totalC) * 100) : 0,
      active7,
      active30,
      everActive,
      weeks,
      topActive,
      totalRevenue,
      mrr: Math.round(mrr),
      arpu: payingCount ? Math.round(totalRevenue / payingCount) : 0,
      payingCount,
      revenueThisMonth,
    };
  }, [users, payments]);

  // Onboarding / activation funnel (epic #223). Every stage derives ONLY from
  // the already-loaded `users` array — no per-user subcollection queries. Stages
  // are CUMULATIVE (each ANDs the previous stage's predicate) so the counts
  // strictly decline and the drop-off between bars is meaningful. Admins are
  // excluded (staff, not funnel subjects).
  //
  // Why there's no "added first trade" stage: that needs a per-user trades count
  // (getUserSubcollectionCount), which the panel loads lazily per row / detail
  // modal only. Counting it for every user would be N Firestore count-queries
  // against shared production data, so the funnel stops at activation/retention
  // and each stage documents the exact field it derives from.
  const funnel = useMemo(() => {
    const customers = users.filter((u) => u.role !== 'admin');
    const total = customers.length;
    // Stage 1: everyone with a user document.
    const registered = customers;
    // Stage 2: finished (or skipped past) the onboarding wizard — both set
    // onboardingCompleted:true in OnboardingWizard.complete().
    const onboarded = registered.filter((u) => u.onboardingCompleted === true);
    // Stage 3: "returned" — lastActive (stamped on app-open, throttled hourly)
    // lands more than a day after createdAt, i.e. the user came back on a later
    // day rather than only during the signup session. Proxy for activation.
    const returned = onboarded.filter((u) => {
      const c = toDate(u.createdAt)?.getTime() || 0;
      const l = lastActiveMs(u);
      return c > 0 && l > 0 && l - c > DAY_MS;
    });
    // Stage 4: still active in the last 7 days (retained).
    const active7 = returned.filter((u) => activeWithin(u, 7));
    const raw = [
      { key: 'registered', label: 'נרשמו', count: registered.length, note: 'מסמך משתמש קיים · role ≠ admin' },
      { key: 'onboarded', label: 'השלימו אונבורדינג', count: onboarded.length, note: 'onboardingCompleted = true' },
      { key: 'returned', label: 'חזרו אחרי יום ההרשמה', count: returned.length, note: 'lastActive מאוחר ביום+ מ-createdAt' },
      { key: 'active7', label: 'פעילים בשבוע האחרון', count: active7.length, note: 'lastActive בתוך 7 ימים' },
    ];
    const stages = raw.map((s, i) => ({
      ...s,
      pct: total ? Math.round((s.count / total) * 100) : 0,
      // Share of the PREVIOUS stage lost at this step.
      dropPct: i === 0 || raw[i - 1].count === 0 ? 0 : Math.round((1 - s.count / raw[i - 1].count) * 100),
    }));
    return { total, stages };
  }, [users]);

  // Revenue over time: monthly totals from the payments log (last 12 months),
  // split by plan-duration bucket derived from each payment's `days` field.
  const revenueSeries = useMemo(() => {
    const now = new Date();
    const months = [];
    const index = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      index[`${d.getFullYear()}-${d.getMonth()}`] = months.length;
      months.push({
        label: d.toLocaleDateString('he-IL', { month: 'short' }),
        full: d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
        monthly: 0, yearly: 0, lifetime: 0, other: 0, total: 0,
      });
    }
    for (const p of payments) {
      const d = toDate(p.createdAt);
      if (!d) continue;
      const at = index[`${d.getFullYear()}-${d.getMonth()}`];
      if (at === undefined) continue; // older than 12 months
      const amt = Number(p.amount) || 0;
      if (!amt) continue;
      const days = Number(p.days);
      const bucket = p.days == null ? 'lifetime'
        : days <= 31 ? 'monthly'
        : days >= 365 ? 'yearly'
        : 'other';
      months[at][bucket] += amt;
      months[at].total += amt;
    }
    return months;
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      if (q && !(u.displayName || '').toLowerCase().includes(q) &&
          !(u.email || '').toLowerCase().includes(q)) return false;
      if (roleFilter === 'admin' && u.role !== 'admin') return false;
      if (roleFilter === 'user' && u.role === 'admin') return false;
      if (roleFilter === 'premium' && !isUserPremium(u)) return false;
      if (roleFilter === 'free' && isUserPremium(u)) return false;
      if (onboardFilter === 'yes' && !u.onboardingCompleted) return false;
      if (onboardFilter === 'no' && u.onboardingCompleted) return false;
      if (activityFilter === 'active7' && !activeWithin(u, 7)) return false;
      if (activityFilter === 'active30' && !activeWithin(u, 30)) return false;
      if (activityFilter === 'inactive30' && !(lastActiveMs(u) > 0 && daysSinceActive(u) >= 30)) return false;
      if (activityFilter === 'never' && lastActiveMs(u) > 0) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [users, search, roleFilter, onboardFilter, activityFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'createdAt' || key === 'lastActive' ? 'desc' : 'asc');
    }
  };

  const exportCsv = () => {
    const header = ['שם', 'אימייל', 'הצטרף', 'אונבורדינג', 'תפקיד'];
    const rows = filtered.map((u) => [
      u.displayName || '',
      u.email || '',
      formatDate(u.createdAt),
      u.onboardingCompleted ? 'הושלם' : 'לא הושלם',
      u.role === 'admin' ? 'אדמין' : 'משתמש',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Wait for the profile (and thus the role) to resolve before deciding.
  if (profile === null) return <LoadingSpinner />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <motion.div dir="rtl" className="max-w-6xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/12 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary leading-tight">פאנל ניהול</h1>
            <p className="text-xs text-text-muted">סקירה כללית · משתמשים · מנויים · AI</p>
          </div>
        </div>
        {/* On mobile: a 2-col grid; on desktop: inline. Animated pill bar. */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          {[
            { label: 'אנליטיקס', Icon: BarChart3, onClick: () => setAnalyticsOpen(true), tone: 'accent' },
            { label: 'מובילים', Icon: Trophy, onClick: () => setLeaderboardOpen(true) },
            { label: 'שליחה קבוצתית', Icon: Send, onClick: () => setBulkOpen(true) },
            { label: 'קופונים', Icon: Ticket, onClick: () => setCouponsOpen(true), tone: 'amber' },
            { label: 'יומן פעולות', Icon: ScrollText, onClick: () => setAuditOpen(true) },
            { label: 'רענן', Icon: RefreshCw, onClick: load, disabled: loading, spin: loading },
          ].map((b) => {
            const tone = b.tone === 'accent'
              ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary hover:bg-accent-primary/20'
              : b.tone === 'amber'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary';
            return (
              <motion.button
                key={b.label}
                onClick={b.onClick}
                disabled={b.disabled}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                className={`h-9 flex items-center justify-center gap-2 px-3.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 cursor-pointer ${tone}`}
              >
                <b.Icon className={`w-4 h-4 shrink-0 ${b.spin ? 'animate-spin' : ''}`} />
                {b.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard accent="cyan" icon={<Users className="w-6 h-6" />} label="סה״כ משתמשים" value={stats.total.length} onClick={() => setListModal({ title: 'כל המשתמשים', users: stats.total })} />
        <StatCard accent="green" icon={<UserPlus className="w-6 h-6" />} label="חדשים השבוע" value={stats.newThisWeek.length} onClick={() => setListModal({ title: 'חדשים השבוע', users: stats.newThisWeek })} />
        <StatCard accent="violet" icon={<CheckCircle2 className="w-6 h-6" />} label="סיימו אונבורדינג" value={stats.onboarded.length} onClick={() => setListModal({ title: 'סיימו אונבורדינג', users: stats.onboarded })} />
        <StatCard accent="amber" icon={<Crown className="w-6 h-6" />} label="לקוחות Premium" value={stats.premium.length} onClick={() => setListModal({ title: 'לקוחות Premium', users: stats.premium })} />
      </div>

      {/* Growth: active users (DAU/WAU/MAU) + 30-day signups trend. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={<Activity className="w-4 h-4" />} title="משתמשים פעילים">
          <div className="grid grid-cols-3 gap-2">
            <StatMini accent="cyan" value={growth.dau} label="היום" />
            <StatMini accent="violet" value={growth.wau} label="השבוע" />
            <StatMini accent="green" value={growth.mau} label="החודש" />
          </div>
        </SectionCard>
        <SectionCard
          dense
          className="lg:col-span-2"
          icon={<UserPlus className="w-4 h-4" />}
          title="הרשמות (30 ימים)"
          action={<span className="text-[11px] text-text-muted">סה״כ {growth.signups.reduce((a, s) => a + s.count, 0)}</span>}
        >
          <div className="h-14 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth.signups.map((s) => ({ d: `${s.date.getDate()}/${s.date.getMonth() + 1}`, count: s.count }))} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="signupsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <Tooltip
                  contentStyle={{ background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                  cursor={{ stroke: 'var(--color-border-primary)' }}
                  formatter={(v) => [v, 'הרשמות']}
                />
                <Area type="monotone" dataKey="count" stroke="var(--color-profit)" strokeWidth={2} fill="url(#signupsGrad)" animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Activity & retention — DAU/WAU/MAU by lastActive, weekly signup
          cohorts split by recent activity, and a recency breakdown (#223). */}
      <SectionCard
        icon={<BarChart3 className="w-4 h-4" />}
        title="פעילות ורטנשן"
        action={<span className="text-[11px] text-text-muted">לפי lastActive</span>}
      >
        <div className="grid grid-cols-3 gap-2 mb-2">
          <StatMini compact accent="cyan" value={retention.today} label="היום" />
          <StatMini compact accent="violet" value={retention.week} label="7 ימים" />
          <StatMini compact accent="green" value={retention.month} label="30 יום" />
        </div>
        {users.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-5 border border-dashed border-border-primary rounded-xl">
            אין עדיין משתמשים להצגת רטנשן
          </div>
        ) : (
          <>
            <div className="h-24 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={retention.cohorts} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                    labelStyle={{ color: 'var(--color-text-secondary)' }}
                    cursor={{ fill: 'var(--color-bg-tertiary)' }}
                    formatter={(v, name) => [v, name === 'retained' ? 'פעילים בשבוע האחרון' : 'לא פעילים']}
                    labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.full} · הצטרפו ${p.joined} · רטנשן ${p.pct}%` : label;
                    }}
                  />
                  <Bar dataKey="retained" stackId="coh" fill="var(--color-accent-primary)" animationDuration={700} />
                  <Bar dataKey="inactive" stackId="coh" fill="#64748b" animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--color-accent-primary)' }} /> פעילים בשבוע האחרון
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#64748b' }} /> לא פעילים
              </span>
            </div>
          </>
        )}
        <div className="mt-3 text-[11px] text-text-muted">
          פעיל היום: {retention.today} · השבוע: {retention.week} · החודש: {retention.month} · רדומים 30+ יום: {retention.dormant} · לא נכנסו מעולם: {retention.never}
        </div>
      </SectionCard>

      {/* Onboarding / activation funnel (#223) — cumulative stages derived
          from the users list only. See the `funnel` useMemo for each stage's
          source field. Honest proxy: no per-user trade counts are loaded. */}
      <SectionCard
        icon={<Users className="w-4 h-4" />}
        title="משפך אונבורדינג"
        action={<span className="text-[11px] text-text-muted">מתוך {funnel.total} משתמשים</span>}
      >
        {funnel.total === 0 ? (
          <div className="text-sm text-text-muted text-center py-6 border border-dashed border-border-primary rounded-xl">
            אין עדיין משתמשים להצגת המשפך
          </div>
        ) : (
          <div className="space-y-1.5">
            {funnel.stages.map((s, i) => {
              // Keep a sliver visible for non-zero stages that round to a tiny %.
              const width = s.count > 0 ? Math.max(s.pct, 4) : 0;
              const color = FUNNEL_ACCENTS[i] || FUNNEL_ACCENTS[FUNNEL_ACCENTS.length - 1];
              return (
                <div key={s.key} title={s.note}>
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-0.5">
                    <span className="text-text-secondary truncate">{s.label}</span>
                    <span className="text-text-muted shrink-0" dir="ltr">
                      <span className="font-semibold text-text-primary">{s.count.toLocaleString()}</span>
                      {' · '}{s.pct}%
                      {i > 0 && s.dropPct > 0 && <span className="text-loss">{' · '}−{s.dropPct}%</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${width}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-[10px] text-text-muted">
          מצטבר — כל שלב מותנה בקודמו, האחוזים מסך הנרשמים.
        </div>
      </SectionCard>

      {/* System health — admin-only, exposes only status (never secrets). */}
      <SectionCard
        dense
        icon={<ShieldCheck className="w-4 h-4" />}
        title="בריאות מערכת"
      >
        {!health ? (
          <div className="text-xs text-text-muted">…</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(() => {
              const cronAgeH = health.cronLast ? (Date.now() - health.cronLast) / 3600000 : null;
              const cronOk = cronAgeH != null && cronAgeH < 26;
              const items = [
                { label: 'Cron', ok: cronOk, note: health.cronLast ? relativeActive(health.cronLast) : 'לא רץ' },
                { label: 'התראות Push', ok: !!health.pushConfigured, note: health.pushConfigured ? 'מוגדר' : 'חסר VAPID' },
                { label: 'AI', ok: !!health.aiConfigured, note: health.aiConfigured ? 'מחובר' : 'לא מוגדר' },
              ];
              return items.map((it) => (
                <div key={it.label} className="rounded-lg px-2.5 py-2 border transition-colors"
                  style={{
                    background: it.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                    borderColor: it.ok ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)',
                  }}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.ok ? 'bg-profit' : 'bg-loss'}`}
                      style={{ boxShadow: it.ok ? '0 0 6px rgba(34,197,94,0.7)' : '0 0 6px rgba(239,68,68,0.7)' }} />
                    <span className="text-[11px] font-semibold text-text-primary truncate">{it.label}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-1 truncate">{it.note}</div>
                </div>
              ));
            })()}
          </div>
        )}
      </SectionCard>

      {/* Cloudflare quota usage (KV + Workers) today vs the free-tier daily
          limits — replaces the "[Alert] approaching your KV limit" emails. */}
      {health?.quotas?.configured && (
        <SectionCard icon={<BarChart3 className="w-4 h-4" />} title="תשתית — מכסות Cloudflare">
          {health.quotas.error ? (
            <div className="text-xs text-loss">לא ניתן לטעון מכסות: {health.quotas.error}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { label: 'KV · קריאות', used: health.quotas.kv.read, limit: health.quotas.limits.kvRead },
                  { label: 'KV · כתיבות', used: health.quotas.kv.write, limit: health.quotas.limits.kvWrite },
                  { label: 'KV · מחיקות', used: health.quotas.kv.delete, limit: health.quotas.limits.kvDelete },
                  { label: 'KV · רשימות', used: health.quotas.kv.list, limit: health.quotas.limits.kvList },
                  { label: 'Workers · בקשות', used: health.quotas.workers.requests, limit: health.quotas.limits.workers },
                ].map((q) => <QuotaBar key={q.label} {...q} />)}
              </div>
              <div className="text-[10px] text-text-muted mt-2">ניצול היום (UTC) · מתעדכן כל 5 דק׳ · צהוב מ-70%, אדום מ-90%</div>
            </>
          )}
        </SectionCard>
      )}

      {/* Firebase (Firestore) consumption vs the Spark free-tier daily limits.
          Numbers only — the worker never returns documents or tokens. */}
      <SectionCard
        icon={<Flame className="w-4 h-4" />}
        title="צריכת Firebase"
        action={
          <button onClick={refreshFbUsage} disabled={fbLoading} className="px-3 py-1.5 rounded-lg border border-border-primary text-xs text-text-secondary hover:text-text-primary cursor-pointer shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 inline ${fbLoading ? 'animate-spin' : ''}`} /> רענן
          </button>
        }
      >
        {!fbUsage ? (
          <div className="text-xs text-text-muted">…</div>
        ) : fbUsage.error ? (
          <div className="text-xs text-loss">טעינת הנתונים נכשלה — נסה לרענן.</div>
        ) : (
          <>
            {(() => {
              const docs = [
                { label: 'משתמשים', accent: 'cyan', v: fbUsage.counts?.users },
                { label: 'טריידים', accent: 'violet', v: fbUsage.counts?.trades },
                { label: 'תשלומים', accent: 'green', v: fbUsage.counts?.payments },
                { label: 'לידרבורד', accent: 'amber', v: fbUsage.counts?.leaderboard },
              ].filter((d) => d.v != null);
              return docs.length ? (
                <div>
                  <div className="text-[11px] text-text-muted mb-1.5">מסמכים ב-Firestore</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {docs.map((d) => (
                      <StatMini compact key={d.label} accent={d.accent} value={d.v.toLocaleString()} label={d.label} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-text-muted">אין נתונים להצגה.</div>
              );
            })()}
            {/* The exact daily quota (reads/writes/storage vs the free-tier
                limit) lives in the Firebase console — the authoritative source. */}
            <a
              href="https://console.firebase.google.com/project/tradeos-91a58/usage"
              target="_blank" rel="noopener noreferrer"
              className="mt-2.5 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-primary text-xs text-text-secondary hover:text-text-primary hover:border-accent-primary/40 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" /> צפה בצריכה ובמכסות המלאות במסוף Firebase
            </a>
          </>
        )}
      </SectionCard>

      {/* Active AI models + daily caps — live routing straight from the worker
          /admin/health (Gemini premium vs Groq fallback), no hard-coded names. */}
      {health?.ai && (
        <SectionCard
          dense
          icon={<Sparkles className="w-4 h-4" />}
          title="מודלים ומכסות AI"
          action={
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${health.ai.geminiActive ? 'bg-accent-primary/15 text-accent-primary' : 'bg-amber-500/15 text-amber-400'}`}>
                {health.ai.geminiActive ? 'Gemini פעיל' : 'Groq בלבד'}
              </span>
              <button onClick={runAiTest} disabled={aiTesting} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border-primary text-[11px] text-text-secondary hover:text-text-primary hover:border-accent-primary/40 disabled:opacity-50 cursor-pointer transition-colors">
                <RefreshCw className={`w-3 h-3 ${aiTesting ? 'animate-spin' : ''}`} /> בדוק חיבור
              </button>
            </div>
          }
        >
          <div className="space-y-1.5">
            {[
              { role: 'Premium', cls: 'text-amber-400 bg-amber-500/12', model: health.ai.models.premiumText, provider: health.ai.geminiActive ? 'Gemini' : 'Groq', limit: `${health.ai.limits.premiumDaily}/יום` },
              { role: 'חינם', cls: 'text-profit bg-profit/12', model: health.ai.models.freeText, provider: 'Groq', limit: `${health.ai.limits.freeDaily}/יום` },
              { role: 'תמונות', cls: 'text-violet-400 bg-violet-500/12', model: health.ai.models.vision, provider: 'Groq', limit: `${health.ai.limits.imageDaily}/יום` },
            ].map((m) => (
              <div key={m.role} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-bg-tertiary/40 border border-border-primary">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${m.cls}`}>{m.role}</span>
                <span className="font-mono text-[11px] text-text-primary truncate" title={m.model}>{m.model}</span>
                <span className="text-[10px] text-text-muted shrink-0 hidden sm:inline">{m.provider}</span>
                <span className="mr-auto text-[11px] font-bold text-text-secondary shrink-0" dir="ltr">{m.limit}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-text-muted leading-relaxed">
            תקרה גלובלית {health.ai.limits.globalCeiling.toLocaleString()}/יום · Premium {health.ai.limits.premiumMinute}/דקה · {health.ai.limits.premiumHour}/שעה
            {health.ai.geminiActive && <> · כש-Gemini עמוס יש נפילה אוטומטית ל-Groq <span className="font-mono">{health.ai.models.groqFallback}</span></>}
          </div>

          {/* Live provider self-test — exact HTTP status + error snippet from
              Google/Groq, so "המערכת עמוסה" can be pinned to a real cause. */}
          {aiTest && (
            <div className="mt-3 pt-3 border-t border-border-primary space-y-1.5">
              {aiTest.error ? (
                <div className="text-[11px] text-loss">{aiTest.error}</div>
              ) : (
                [{ name: 'Gemini', r: aiTest.gemini }, { name: 'Groq', r: aiTest.groq }].map(({ name, r }) => (
                  <div key={name} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r?.ok ? 'bg-profit' : 'bg-loss'}`} />
                    <span className="font-semibold text-text-primary shrink-0 w-14">{name}</span>
                    <span className={`shrink-0 ${r?.ok ? 'text-profit' : 'text-loss'}`} dir="ltr">{r?.ok ? 'OK' : `שגיאה ${r?.status ?? '—'}`}</span>
                    {!r?.ok && r?.error && <span className="text-text-muted truncate" title={r.error} dir="ltr">{r.error}</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Global AI usage today — aggregated across all users (text + image). */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-3.5">
        <div className="text-[11px] text-text-muted mb-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> שימוש כללי ב-AI היום (כל המשתמשים)
        </div>
        {globalAi ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatMini compact accent="cyan" icon={<Sparkles className="w-4 h-4" />} value={globalAi.totalText} label="בקשות טקסט" />
              <StatMini compact accent="violet" icon={<Image className="w-4 h-4" />} value={globalAi.totalImage} label="ניתוחי תמונה" />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-text-muted flex-wrap">
              <DollarSign className="w-3.5 h-3.5 text-accent-primary" />
              עלות אילו בתוכנית בתשלום:
              <span className="text-text-secondary font-semibold">~${estimateAiCost(globalAi.totalText, globalAi.totalImage).toFixed(3)}</span>
              <span>· חודשי ~${(estimateAiCost(globalAi.totalText, globalAi.totalImage) * 30).toFixed(2)}</span>
              <span className="text-profit">· בפועל היום: $0 (גרסה חינמית)</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-text-muted">…</div>
        )}
        {globalAi && Object.keys(globalAi.perUser || {}).length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-[11px] text-text-muted mb-1">המשתמשים הפעילים ביותר היום</div>
            {Object.entries(globalAi.perUser)
              .map(([uid, v]) => ({ uid, ...v, total: (v.text || 0) + (v.image || 0) }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)
              .map((row) => {
                const u = users.find((x) => x.id === row.uid);
                const name = u?.displayName || u?.email || row.uid.slice(0, 8);
                return (
                  <button
                    key={row.uid}
                    type="button"
                    onClick={() => u && setSelectedUser(u)}
                    className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
                  >
                    <span className="text-text-secondary flex items-center gap-2">
                      <span className="text-text-primary">{row.text}</span> טקסט
                      <span className="text-text-primary">{row.image}</span> תמונה
                    </span>
                    <span className="text-text-primary font-medium truncate max-w-[55%] text-left">{name}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* AI usage over time — daily counts (bars) + real token-based cost. */}
      <SectionCard
        dense
        icon={<BarChart3 className="w-4 h-4" />}
        title="שימוש ב-AI לאורך זמן"
        action={
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border-primary p-0.5 shrink-0">
            {[7, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setStatsDays(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${statsDays === d ? 'bg-accent-primary text-black' : 'text-text-muted hover:text-text-primary'}`}
              >
                {d} ימים
              </button>
            ))}
          </div>
        }
      >
        {!aiStats ? (
          <div className="text-xs text-text-muted">…</div>
        ) : (() => {
          // Token metering (aistat) only accrues from when it shipped, so the
          // most recent day can read 0 even though users already chatted today.
          // Backfill today from the live per-user counters (globalAi) so it
          // reflects real usage immediately; tokens still fill in going forward.
          const series = (aiStats.stats || []).map((s) =>
            globalAi && s.date === globalAi.date
              ? { ...s, text: Math.max(s.text, globalAi.totalText || 0), image: Math.max(s.image, globalAi.totalImage || 0) }
              : s
          );
          const totTokIn = series.reduce((a, s) => a + s.tokIn, 0);
          const totTokOut = series.reduce((a, s) => a + s.tokOut, 0);
          const totReq = series.reduce((a, s) => a + s.text + s.image, 0);
          const realCost = (totTokIn * 0.59 + totTokOut * 0.79) / 1e6;
          // Today's global request count vs the worker's circuit-breaker
          // ceiling (moved here from the old separate cost-detail card).
          const todayCount = globalAi ? (globalAi.totalText || 0) + (globalAi.totalImage || 0) : null;
          const ceilPct = todayCount != null ? Math.min(100, (todayCount / AI_GLOBAL_DAILY_CEILING) * 100) : null;
          const ceilColor = ceilPct == null ? 'var(--color-accent-primary)'
            : ceilPct > 85 ? 'var(--color-loss)' : ceilPct >= 60 ? '#f59e0b' : 'var(--color-accent-primary)';
          const chartData = series.map((s) => {
            const d = new Date(s.date);
            return { d: `${d.getDate()}/${d.getMonth() + 1}`, total: s.text + s.image };
          });
          return (
            <>
              <div className="h-20 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                    <defs>
                      <linearGradient id="aiUsageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="d" hide />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                      labelStyle={{ color: 'var(--color-text-secondary)' }}
                      cursor={{ stroke: 'var(--color-border-primary)' }}
                      formatter={(v) => [v, 'בקשות']}
                    />
                    <Area type="monotone" dataKey="total" stroke="var(--color-accent-primary)" strokeWidth={2} fill="url(#aiUsageGrad)" animationDuration={700} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <StatMini compact accent="cyan" value={totReq.toLocaleString()} label={`בקשות (${statsDays} ימים)`} />
                <StatMini compact accent="violet" value={`${((totTokIn + totTokOut) / 1000).toFixed(0)}K`} label="טוקנים בפועל" />
                <StatMini compact accent="green" value={`~$${realCost.toFixed(2)}`} label="עלות אילו בתשלום" />
              </div>
              {/* System-load ceiling: today's global requests vs the worker
                  circuit-breaker (the one genuinely-unique widget kept from the
                  removed cost-detail card). */}
              {ceilPct != null && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                    <span className="text-text-muted flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> עומס גלובלי היום מול מגבלת המערכת</span>
                    <span className="text-text-secondary" dir="ltr">
                      <span className="font-semibold text-text-primary">{todayCount.toLocaleString()}</span>{' / '}{AI_GLOBAL_DAILY_CEILING.toLocaleString()}
                      <span style={{ color: ceilColor }}>{' \u00b7 '}{ceilPct > 0 && ceilPct < 10 ? ceilPct.toFixed(1) : Math.round(ceilPct)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${todayCount > 0 ? Math.max(ceilPct, 1.5) : 0}%`, background: ceilColor }} />
                  </div>
                  {ceilPct >= 85 && <div className="mt-1 text-[10px] text-loss">חריגה מתקרבת — קרוב למגבלת ה-503 הגלובלית</div>}
                </div>
              )}
            </>
          );
        })()}
      </SectionCard>

      {/* Revenue over time — monthly stacked bars from the payments log,
          split by plan duration, headed by the live MRR + total revenue. */}
      <SectionCard
        dense
        icon={<DollarSign className="w-4 h-4" />}
        title="MRR והכנסות לאורך זמן"
        action={<span className="text-[11px] text-text-muted">12 חודשים אחרונים</span>}
      >
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <StatMini compact accent="green" value={ILS(analytics.mrr)} label="MRR (חודשי)" />
          <StatMini compact accent="amber" value={ILS(analytics.totalRevenue)} label="הכנסה כוללת" />
        </div>
        {payments.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-6 border border-dashed border-border-primary rounded-xl">
            אין עדיין תשלומים
          </div>
        ) : (
          <>
            <div className="h-16 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueSeries} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-primary)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                    labelStyle={{ color: 'var(--color-text-secondary)' }}
                    cursor={{ fill: 'var(--color-bg-tertiary)' }}
                    formatter={(v, name) => [ILS(v), REVENUE_BUCKETS[name]?.label || name]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.full || label}
                  />
                  {Object.entries(REVENUE_BUCKETS).map(([key, b]) => (
                    <Bar key={key} dataKey={key} stackId="rev" fill={b.color} animationDuration={700} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-text-muted">
              {Object.entries(REVENUE_BUCKETS).map(([key, b]) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                  {b.label}
                </span>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {/* Quota alerts — users at/over 80% of their daily AI quota today. */}
      {quotaAlerts.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-amber-500/15 text-amber-400 rounded-lg p-1.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-text-primary">התראת חריגת מכסת AI</span>
            <span className="text-[11px] text-text-muted">({quotaAlerts.length})</span>
          </div>
          <div className="space-y-1.5">
            {quotaAlerts.map((a) => {
              const name = a.u?.displayName || a.u?.email || a.uid.slice(0, 8);
              const over = a.pct >= 1;
              return (
                <button
                  key={a.uid}
                  type="button"
                  onClick={() => a.u && setSelectedUser(a.u)}
                  className="w-full flex items-center justify-between gap-3 text-xs px-3 py-2 rounded-lg bg-bg-tertiary/40 border border-border-primary hover:border-amber-500/40 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className={`font-semibold ${over ? 'text-loss' : 'text-amber-400'}`}>{over ? 'חרג ממכסה' : `${Math.round(a.pct * 100)}%`}</span>
                    <span className="text-text-secondary">טקסט {a.text}/{a.textLimit}{a.imgLimit > 0 ? ` · תמונה ${a.image}/${a.imgLimit}` : ''}</span>
                  </span>
                  <span className="text-text-primary font-medium truncate max-w-[45%] text-left">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Churn-risk: Premium customers who haven't opened the app in 7+ days. */}
      {churned.length > 0 && (
        <div className="bg-loss/5 border border-loss/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-loss/15 text-loss rounded-lg p-1.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-text-primary">לקוחות בסיכון נטישה</span>
            <span className="text-[11px] text-text-muted">— מנויי Premium שלא נכנסו 7+ ימים</span>
            <span className="mr-auto text-xs font-bold text-loss bg-loss/10 px-2 py-0.5 rounded-full">{churned.length}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {churned.slice(0, 6).map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 hover:border-loss/40 transition-colors"
              >
                <button onClick={() => setSelectedUser(u)} className="flex items-center gap-3 flex-1 min-w-0 text-right cursor-pointer">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary text-sm font-semibold">
                      {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{u.displayName || u.email}</div>
                    <div className="text-[11px] text-loss">לא נכנס {daysSinceActive(u)} ימים</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => quickReengage(u)}
                  disabled={reengaging === u.id}
                  title="שלח התראת חזרה"
                  className="shrink-0 p-1.5 rounded-lg text-accent-primary hover:bg-accent-primary/10 disabled:opacity-50 cursor-pointer"
                >
                  {reengaging === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
          {churned.length > 6 && (
            <div className="text-[11px] text-text-muted mt-2">ועוד {churned.length - 6}… (מיין לפי "פעילות אחרונה" בטבלה)</div>
          )}
        </div>
      )}

      {/* Expiring soon: Premium customers whose plan ends within 7 days. */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-amber-500/15 text-amber-400 rounded-lg p-1.5">
              <Hourglass className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-text-primary">מנויים שעומדים להסתיים</span>
            <span className="text-[11px] text-text-muted">— Premium שנגמר ב-7 הימים הקרובים</span>
            <span className="mr-auto text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{expiringSoon.length}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {expiringSoon.slice(0, 6).map((u) => {
              const d = daysUntilExpiry(u);
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="flex items-center gap-3 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-right hover:border-amber-500/40 transition-colors cursor-pointer"
                >
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary text-sm font-semibold">
                      {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{u.displayName || u.email}</div>
                    <div className="text-[11px] text-amber-400">{d === 0 ? 'נגמר היום' : d === 1 ? 'נגמר מחר' : `עוד ${d} ימים`}</div>
                  </div>
                  <Send className="w-4 h-4 text-text-muted shrink-0" />
                </button>
              );
            })}
          </div>
          {expiringSoon.length > 6 && (
            <div className="text-[11px] text-text-muted mt-2">ועוד {expiringSoon.length - 6}…</div>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או אימייל…"
            className="w-full bg-bg-tertiary border border-border-primary rounded-lg py-2.5 pr-10 pl-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-primary"
          />
        </div>
        {/* Role + status filters share one row on mobile. */}
        <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
          <div className="md:w-44">
            <SelectDropdown
              value={roleFilter === 'all' ? '' : roleFilter}
              onChange={(v) => setRoleFilter(v || 'all')}
              options={[
                { value: 'admin', label: 'אדמינים בלבד' },
                { value: 'user', label: 'משתמשים בלבד' },
                { value: 'premium', label: 'Premium בלבד' },
                { value: 'free', label: 'חינמיים בלבד' },
              ]}
              placeholder="כל התפקידים"
              allowClear
            />
          </div>
          <div className="md:w-40">
            <SelectDropdown
              value={activityFilter === 'all' ? '' : activityFilter}
              onChange={(v) => setActivityFilter(v || 'all')}
              options={[
                { value: 'active7', label: 'פעיל 7 ימים' },
                { value: 'active30', label: 'פעיל 30 יום' },
                { value: 'inactive30', label: 'לא פעיל 30+ יום' },
                { value: 'never', label: 'לא היה פעיל מעולם' },
              ]}
              placeholder="כל רמות הפעילות"
              allowClear
            />
          </div>
          <div className="col-span-2 md:col-span-1 md:w-48">
            <SelectDropdown
              value={onboardFilter === 'all' ? '' : onboardFilter}
              onChange={(v) => setOnboardFilter(v || 'all')}
              options={[
                { value: 'yes', label: 'סיימו אונבורדינג' },
                { value: 'no', label: 'לא סיימו אונבורדינג' },
              ]}
              placeholder="כל הסטטוסים"
              allowClear
            />
          </div>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          ייצוא CSV
        </button>
      </div>

      {error && (
        <div className="bg-loss/10 border border-loss/30 text-loss rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : (
        <>
          <div className="text-sm text-text-secondary">
            מציג {filtered.length} מתוך {users.length} משתמשים
          </div>

          {/* Table sits on the page background so rows look 'pure' black/white
              for the theme rather than the previous gray-on-gray look. */}
          <div className="border border-border-primary rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-secondary border-b border-border-primary text-right">
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="font-medium px-4 py-3">
                        <button
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 hover:text-text-primary cursor-pointer"
                        >
                          {col.label}
                          {sortKey === col.key && (
                            sortDir === 'asc'
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                        לא נמצאו משתמשים
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="border-b border-border-primary/50 last:border-0 cursor-pointer hover:bg-bg-tertiary/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary font-semibold">
                                {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-text-primary font-medium block truncate">{u.displayName || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{u.email || '—'}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            // Only flag real churn in red: a Premium customer we
                            // HAVE seen, who's now been gone 7+ days. "Never seen"
                            // (no data yet) stays muted — it isn't churn.
                            const churn = u.role !== 'admin' && isUserPremium(u) && lastActiveMs(u) > 0 && daysSinceActive(u) >= 7;
                            return (
                              <span className={`inline-flex items-center gap-1 ${churn ? 'text-loss' : lastActiveMs(u) ? 'text-text-secondary' : 'text-text-muted'}`}>
                                <Clock className="w-3.5 h-3.5" />
                                {relativeActive(u.lastActive)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {u.onboardingCompleted ? (
                            <span className="text-profit">הושלם</span>
                          ) : (
                            <span className="text-text-secondary">לא הושלם</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {u.role === 'admin' ? (
                              <span className="inline-flex items-center gap-1 text-accent-primary font-medium">
                                <ShieldCheck className="w-4 h-4" /> אדמין
                              </span>
                            ) : isUserPremium(u) ? (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                                <Crown className="w-3 h-3" /> Premium
                              </span>
                            ) : (
                              <span className="text-text-secondary">משתמש</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} onUserChanged={load} />
      <CouponsModal isOpen={couponsOpen} onClose={() => setCouponsOpen(false)} users={users} />
      <AuditLogModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} users={users} />
      <AnalyticsModal isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} a={analytics} onPickUser={(u) => { setAnalyticsOpen(false); setSelectedUser(u); }} />
      <UserListModal
        data={listModal}
        onClose={() => setListModal(null)}
        onPickUser={(u) => { setListModal(null); setSelectedUser(u); }}
      />
      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        users={users}
        onPickUser={(u) => { setLeaderboardOpen(false); setSelectedUser(u); }}
      />
      <BulkNotifyModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        segments={{ all: stats.total, premium: stats.premium, newThisWeek: stats.newThisWeek, onboarded: stats.onboarded, churned }}
      />
    </motion.div>
  );
}

// ── Stat-card → user list modal ──────────────────────────────────────────────
// Opened by clicking a stat card (Premium / admins / onboarded / ...). Lists
// the users in that bucket; clicking a row opens that user's detail modal.
function UserListModal({ data, onClose, onPickUser }) {
  return (
    <Modal isOpen={!!data} onClose={onClose} title={data ? `${data.title} (${data.users.length})` : ''}>
      <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
        {data?.users?.length ? data.users.map((u) => {
          const name = u.displayName || u.email || u.id.slice(0, 8);
          const joined = toDate(u.createdAt);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onPickUser(u)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-bg-tertiary/40 border border-border-primary hover:border-accent-primary/50 transition-colors cursor-pointer text-right"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{name}</div>
                <div className="text-[11px] text-text-muted truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.role === 'admin' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary">אדמין</span>}
                {u.role !== 'admin' && isUserPremium(u) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Premium</span>}
                {joined && <span className="text-[10px] text-text-muted">{joined.toLocaleDateString('he-IL')}</span>}
              </div>
            </button>
          );
        }) : (
          <div className="text-sm text-text-muted text-center py-6">אין משתמשים בקטגוריה זו</div>
        )}
      </div>
    </Modal>
  );
}

// ── Leaderboard modal — top users by trades + activity ───────────────────────
function LeaderboardModal({ isOpen, onClose, users, onPickUser }) {
  const [rows, setRows] = useState(null); // [{ u, trades }]
  useEffect(() => {
    if (!isOpen) { setRows(null); return; }
    let cancelled = false;
    (async () => {
      const withCounts = await Promise.all(
        users.map(async (u) => {
          let trades = 0;
          try { trades = await getUserSubcollectionCount(u.id, 'trades'); } catch { /* no access / none */ }
          return { u, trades };
        })
      );
      if (!cancelled) {
        withCounts.sort((a, b) => b.trades - a.trades || lastActiveMs(b.u) - lastActiveMs(a.u));
        setRows(withCounts);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, users]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="משתמשים מובילים" maxWidth="max-w-lg">
      <div className="p-4 max-h-[65vh] overflow-y-auto">
        {!rows ? (
          <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> טוען נתונים…
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const name = r.u.displayName || r.u.email || r.u.id.slice(0, 8);
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
              return (
                <button
                  key={r.u.id}
                  type="button"
                  onClick={() => onPickUser(r.u)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-tertiary/40 border border-border-primary hover:border-accent-primary/50 transition-colors cursor-pointer text-right"
                >
                  <span className="w-7 text-center text-sm font-bold text-text-secondary shrink-0">{medal}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{name}</div>
                    <div className="text-[11px] text-text-muted">פעילות אחרונה: {relativeActive(r.u.lastActive)}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-bold text-accent-primary">{r.trades}</div>
                    <div className="text-[10px] text-text-muted">עסקאות</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Bulk push modal — send one push to a whole segment of users ──────────────
const SEGMENT_LABELS = {
  all: 'כל המשתמשים',
  premium: 'לקוחות Premium',
  newThisWeek: 'חדשים השבוע',
  onboarded: 'סיימו אונבורדינג',
  churned: 'בסיכון נטישה',
};
// One quota row — used/limit with a colour-coded progress bar (green<70%,
// amber 70–90%, red >90%). Used by the Cloudflare "תשתית" card.
function QuotaBar({ label, used, limit }) {
  const u = Number(used) || 0;
  const l = Number(limit) || 0;
  const pct = l > 0 ? Math.min(100, (u / l) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div className="rounded-xl px-3 py-2.5 border border-border-primary bg-bg-tertiary">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-xs font-semibold text-text-primary">{label}</span>
        <span className="text-[10px] font-mono text-text-muted tabular-nums">{u.toLocaleString()} / {l.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BulkNotifyModal({ isOpen, onClose, segments }) {
  const [seg, setSeg] = useState('premium');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (!isOpen) { setTitle(''); setBody(''); setUrl(''); setSeg('premium'); } }, [isOpen]);

  const targets = segments?.[seg] || [];
  const send = async () => {
    if (!title.trim() || !body.trim() || !targets.length) return;
    setSending(true);
    try {
      const uids = targets.map((u) => u.id);
      const r = await adminSendBulkNotification({ uids, title: title.trim(), body: body.trim(), url: url.trim() || '/' });
      toast.success(`נשלח ל-${r?.recipients ?? 0} משתמשים (${r?.sent ?? 0} מכשירים)`);
      onClose();
    } catch {
      toast.error('השליחה נכשלה');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="שליחת התראה קבוצתית" maxWidth="max-w-lg">
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[11px] text-text-muted block mb-1.5">קהל יעד</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SEGMENT_LABELS).map((k) => {
              const count = segments?.[k]?.length || 0;
              const active = seg === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSeg(k)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${active ? 'bg-accent-primary/15 border-accent-primary/40 text-accent-primary' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}
                >
                  {SEGMENT_LABELS[k]} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת ההתראה"
          maxLength={120}
          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="תוכן ההתראה"
          maxLength={400}
          rows={3}
          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="קישור (ברירת מחדל: דף הבית)"
          dir="ltr"
          className="w-full bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary text-right"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !title.trim() || !body.trim() || !targets.length}
          className="w-full py-2.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          שלח ל-{targets.length} משתמשים
        </button>
        <p className="text-[11px] text-text-muted text-center">נשלח רק למשתמשים שאישרו התראות Push.</p>
      </div>
    </Modal>
  );
}

// ── User detail modal ────────────────────────────────────────────────────────
function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-text-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-text-muted">{label}</div>
        <div className="text-sm text-text-primary break-words">{value || '—'}</div>
      </div>
    </div>
  );
}

const COUNT_COLLECTIONS = [
  { key: 'trades', label: 'עסקאות', icon: Activity },
  { key: 'journals', label: 'יומני מסחר', icon: BookOpen },
  { key: 'backtests', label: 'בקטסטים', icon: FlaskConical },
  { key: 'backtestJournals', label: 'יומני בקטסט', icon: FlaskConical },
  { key: 'dca', label: 'תוכניות DCA', icon: Coins },
  { key: 'tradingPlans', label: 'תוכניות מסחר', icon: FileText },
  { key: 'morningJournals', label: 'יומן בוקר', icon: Brain },
  { key: 'eveningJournals', label: 'יומן ערב', icon: Brain },
];

function UserDetailModal({ user, onClose, onUserChanged }) {
  // The signed-in admin (author of the payment record). `user` is the target
  // user being managed, so we read the admin's own identity from auth.
  const { user: adminUser } = useAuth();
  const [counts, setCounts] = useState(null);
  const [countsError, setCountsError] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [granting, setGranting] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bit');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Connection status: Web Push devices + linked exchanges (ids only).
  const [connections, setConnections] = useState(null);
  // Private admin note (adminNotes/{uid} — admins only, invisible to the user).
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(true);
  const [noteSaving, setNoteSaving] = useState(false);

  // Keyed by uid (not the object) so a background users-refresh of the SAME
  // user doesn't refetch and clobber an admin note being typed.
  const uid = user?.id;

  // A leftover confirm from the previous user must not arm the delete button
  // for the next profile opened.
  useEffect(() => { setConfirmDelete(false); }, [user]);

  // Push devices + connected exchanges via the worker — both endpoints are
  // admin-gated and return counts/ids only, never subscriptions or API keys.
  useEffect(() => {
    if (!uid) { setConnections(null); return; }
    let cancelled = false;
    setConnections(null);
    Promise.all([
      adminGetPushStatus(uid).catch(() => null),
      adminGetExchangesStatus(uid).catch(() => null),
    ]).then(([push, exch]) => {
      if (cancelled) return;
      setConnections({
        devices: push ? push.devices : null,
        exchanges: exch ? exch.exchanges : null,
      });
    });
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    if (!uid) { setNoteText(''); return; }
    let cancelled = false;
    setNoteLoading(true);
    setNoteText('');
    getAdminMeta(uid)
      .then(({ text }) => { if (!cancelled) setNoteText(text); })
      .catch(() => { /* rules not deployed / offline — leave empty */ })
      .finally(() => { if (!cancelled) setNoteLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const saveNote = async () => {
    if (!uid) return;
    setNoteSaving(true);
    try {
      await setAdminMeta(uid, { text: noteText.trim() }, adminUser?.uid);
      toast.success('ההערה נשמרה');
    } catch (e) {
      toast.error(e?.code === 'permission-denied'
        ? 'אין הרשאה — ודא שכללי ה-Firestore נפרסו'
        : 'שמירת ההערה נכשלה');
    } finally {
      setNoteSaving(false);
    }
  };

  const doDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await adminDeleteUser(user.id);
      toast.success(`המשתמש ${user.email || user.id} נמחק לצמיתות`);
      onClose();
      onUserChanged?.();
    } catch (e) {
      toast.error(e.message || 'מחיקת המשתמש נכשלה');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  useEffect(() => {
    if (!user) { setAiUsage(null); return; }
    let cancelled = false;
    fetchUserAiUsage(user.id).then((u) => { if (!cancelled) setAiUsage(u); });
    return () => { cancelled = true; };
  }, [user]);

  const grant = async (days) => {
    if (!user) return;
    setGranting(true);
    try {
      const amount = parseFloat(grantAmount);
      const paid = Number.isFinite(amount) && amount > 0 ? amount : 0;
      await adminGrantPremium(user.id, days, { amount: paid });
      // Record the payment (revenue log) if an amount was entered.
      if (paid > 0) {
        addPayment({ uid: user.id, amount: paid, days: Number.isFinite(days) ? days : null }, adminUser?.uid).catch(() => {});
      }
      const lifetime = !Number.isFinite(days);
      const expiresAt = lifetime
        ? null
        : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      toast.success(lifetime ? 'ניתן Premium ללא הגבלה' : `ניתן Premium ל-${days} ימים`);

      // Notify the user via push. Best-effort: ignore failures (e.g. user has
      // never registered a device — they'll see the change next time they open
      // the app anyway).
      const expiryStr = expiresAt
        ? expiresAt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : null;
      const body = lifetime
        ? '🎉 קיבלת Premium ללא הגבלה. כל הפיצ\'רים פתוחים — בהצלחה במסחר!'
        : `🎉 קיבלת Premium עד ${expiryStr}. כל הפיצ\'רים פתוחים — בהצלחה במסחר!`;
      adminSendNotification({
        uid: user.id,
        title: '🎁 שודרגת ל-TradeOS Premium',
        body,
        url: '/premium',
      }).catch(() => { /* best-effort */ });

      // Schedule the two expiry reminders (3 days before + day of). For
      // lifetime grants this just clears any prior schedule (planExpires=null).
      const planExpiresISO = expiresAt ? expiresAt.toISOString() : null;
      adminScheduleExpiryReminders(user.id, planExpiresISO);
      // Bust the worker's cached plan flag so premium-only AI features unlock
      // for this user immediately, not after the cache TTL.
      adminRefreshPlanCache(user.id);

      // Branded confirmation email — 'payment' when an amount was recorded,
      // 'gift' otherwise. Failure gets its own toast (Resend without a
      // verified domain only delivers to the account owner's address).
      if (sendReceipt && user.email) {
        adminSendPaymentEmail({
          email: user.email,
          name: user.displayName || '',
          kind: paid > 0 ? 'payment' : 'gift',
          amount: paid,
          method: payMethod,
          days: Number.isFinite(days) ? days : null,
          expires: expiryStr,
        })
          .then(() => toast.success('מייל האישור נשלח 📧'))
          .catch((err) => toast.error(`המייל לא נשלח: ${err.message}`));
      }

      setGrantOpen(false);
      setGrantAmount('');
      onUserChanged?.();
    } catch (e) {
      toast.error(e.code === 'permission-denied'
        ? 'אין הרשאה — ייתכן שכללי Firestore לא פורסו מחדש'
        : 'הענקת ה-Premium נכשלה');
    } finally {
      setGranting(false);
    }
  };

  const revoke = async () => {
    if (!user) return;
    if (!window.confirm('לבטל את ה-Premium של המשתמש?')) return;
    setGranting(true);
    try {
      await adminRevokePremium(user.id);
      // Cancel the queued expiry reminders so a revoked user isn't pinged
      // about a subscription they no longer have.
      adminCancelExpiryReminders(user.id);
      // Bust the worker's cached plan flag so the revoke takes effect at once.
      adminRefreshPlanCache(user.id);
      toast.success('ה-Premium בוטל');
      onUserChanged?.();
    } catch {
      toast.error('הביטול נכשל');
    } finally {
      setGranting(false);
    }
  };

  const sendNotify = async () => {
    if (!notifyTitle.trim() || !notifyBody.trim()) return;
    setNotifying(true);
    try {
      const r = await adminSendNotification({ uid: user.id, title: notifyTitle.trim(), body: notifyBody.trim() });
      if (r.sent > 0) toast.success(`ההתראה נשלחה ל-${r.sent} מכשירים`);
      else if (r.total === 0) toast.error('למשתמש אין התראות מופעלות');
      else toast.error('שליחה נכשלה');
      setNotifyOpen(false);
      setNotifyTitle(''); setNotifyBody('');
    } catch (e) {
      toast.error(e.message || 'השליחה נכשלה');
    } finally {
      setNotifying(false);
    }
  };

  useEffect(() => {
    if (!user) { setCounts(null); setCountsError(null); return; }
    let cancelled = false;
    setCounts(null);
    setCountsError(null);
    Promise.all(
      COUNT_COLLECTIONS.map((c) =>
        getUserSubcollectionCount(user.id, c.key).then((n) => [c.key, n]).catch(() => [c.key, null])
      )
    ).then((entries) => {
      if (cancelled) return;
      const map = Object.fromEntries(entries);
      setCounts(map);
      // If every count failed → rules probably haven't been redeployed yet
      if (Object.values(map).every((v) => v === null)) {
        setCountsError('לא ניתן לטעון ספירות — ודא שכללי ה-Firestore נפרסו (firebase deploy --only firestore:rules).');
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;
  const settings = user.settings || {};

  return (
    <Modal isOpen={!!user} onClose={onClose} title="פרטי משתמש" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary font-bold text-lg">
              {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-text-primary truncate">{user.displayName || '—'}</div>
            <div className="text-sm text-text-secondary truncate">{user.email || '—'}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {user.role === 'admin' ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30">
                  <ShieldCheck className="w-3 h-3" /> אדמין
                </span>
              ) : isUserPremium(user) ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                  <Crown className="w-3 h-3" /> Premium
                  {user.planExpires && <span className="text-text-muted font-normal">· עד {formatDate(user.planExpires)}</span>}
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary border border-border-primary">חינמי</span>
              )}
              {user.onboardingCompleted ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-profit/15 text-profit border border-profit/30">
                  <CheckCircle2 className="w-3 h-3" /> אונבורדינג הושלם
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary border border-border-primary">אונבורדינג לא הושלם</span>
              )}
            </div>
          </div>
        </div>

        {/* Admin actions */}
        <div className="grid grid-cols-2 gap-2">
          {user.role !== 'admin' && (
            isUserPremium(user) ? (
              <button
                onClick={revoke}
                disabled={granting}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-loss hover:border-loss/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" /> בטל Premium
              </button>
            ) : (
              <button
                onClick={() => setGrantOpen(true)}
                disabled={granting}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Crown className="w-4 h-4" /> הענק Premium
              </button>
            )
          )}
          <button
            onClick={() => setNotifyOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-sm font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" /> שלח הודעת Push
          </button>
        </div>

        {/* Grant Premium duration picker */}
        {grantOpen && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">בחר משך Premium</span>
              <button onClick={() => setGrantOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Optional amount paid — feeds revenue / MRR analytics. */}
            <div>
              <label className="text-[11px] text-text-muted block mb-1">סכום ששולם (₪) — לא חובה</label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">₪</span>
                <input
                  type="number"
                  min="0"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="לדוגמה 29"
                  className="w-full bg-bg-secondary border border-border-primary rounded-lg pr-7 pl-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500"
                />
              </div>
            </div>
            {/* Payment method — feeds the confirmation email */}
            <div>
              <label className="text-[11px] text-text-muted block mb-1">אמצעי תשלום</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'bit', label: 'ביט' },
                  { id: 'crypto', label: 'קריפטו' },
                  { id: 'transfer', label: 'העברה בנקאית' },
                  { id: 'cash', label: 'מזומן' },
                  { id: 'other', label: 'אחר' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      payMethod === m.id
                        ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-semibold'
                        : 'bg-bg-secondary border-border-primary text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Confirmation email toggle */}
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendReceipt}
                onChange={(e) => setSendReceipt(e.target.checked)}
                disabled={!user.email}
                className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
              />
              שלח מייל אישור מעוצב {user.email ? `(${user.email})` : '(אין אימייל בפרופיל)'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {[
                { d: 1, label: 'יום' },
                { d: 7, label: 'שבוע' },
                { d: 30, label: 'חודש' },
                { d: 90, label: '3 חודשים' },
                { d: 180, label: '6 חודשים' },
                { d: 365, label: 'שנה' },
              ].map((opt) => (
                <button
                  key={String(opt.d)}
                  onClick={() => grant(opt.d)}
                  disabled={granting}
                  className="text-xs px-2 py-2 rounded-lg bg-bg-secondary border border-border-primary text-text-primary hover:border-amber-500/40 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notification composer */}
        {notifyOpen && (
          <div className="bg-accent-primary/5 border border-accent-primary/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">הודעת Push למשתמש</span>
              <button onClick={() => setNotifyOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
              placeholder="כותרת"
              maxLength={120}
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
            <textarea
              value={notifyBody}
              onChange={(e) => setNotifyBody(e.target.value)}
              placeholder="גוף ההודעה"
              maxLength={400}
              rows={3}
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
            />
            <button
              onClick={sendNotify}
              disabled={notifying || !notifyTitle.trim() || !notifyBody.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {notifying ? 'שולח...' : 'שלח עכשיו'}
            </button>
          </div>
        )}

        {/* Details — two professional columns on desktop so the modal fits the
            screen without scrolling; stacks to one column on mobile. */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Left column: identity & settings */}
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> פרטים כלליים
              </div>
              <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-4 py-1 divide-y divide-border-primary/40">
                <DetailRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={user.email} />
                <DetailRow icon={<Calendar className="w-4 h-4" />} label="הצטרף" value={formatDate(user.createdAt)} />
                <DetailRow icon={<Clock className="w-4 h-4" />} label="פעילות אחרונה"
                  value={lastActiveMs(user) ? `${relativeActive(user.lastActive)} · ${formatDate(user.lastActive)}` : 'מעולם לא'} />
                {/* App version the user's client last reported (via touchLastActive).
                    Amber when it lags the current release — spots users stuck on old builds. */}
                <DetailRow icon={<Smartphone className="w-4 h-4" />} label="גרסת אפליקציה"
                  value={user.appVersion
                    ? <span className={user.appVersion !== APP_VERSION ? 'text-amber-400' : ''}>
                        {user.appVersion}{user.appVersion !== APP_VERSION ? ` · ישנה (נוכחית ${APP_VERSION})` : ' · עדכנית'}
                      </span>
                    : 'לא ידוע'} />
                <DetailRow icon={<Coins className="w-4 h-4" />} label="מטבע בסיס" value={settings.baseCurrency} />
                <DetailRow icon={<TrendingUp className="w-4 h-4" />} label="מינוף ברירת מחדל" value={settings.defaultLeverage ? `${settings.defaultLeverage}x` : null} />
                <DetailRow icon={<Percent className="w-4 h-4" />} label="סיכון ברירת מחדל" value={settings.defaultRiskPercent != null ? `${settings.defaultRiskPercent}%` : null} />
              </div>
            </div>

            {/* AI daily usage */}
            <div>
              <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> שימוש ב-AI היום
              </div>
              {aiUsage ? (() => {
                const pct = Math.min(100, (aiUsage.used / aiUsage.limit) * 100);
                const low = (aiUsage.limit - aiUsage.used) <= 3;
                const hasImg = typeof aiUsage.imageLimit === 'number' && aiUsage.imageLimit > 0;
                const imgPct = hasImg ? Math.min(100, (aiUsage.imageUsed / aiUsage.imageLimit) * 100) : 0;
                const imgLow = hasImg && (aiUsage.imageLimit - aiUsage.imageUsed) <= 1;
                return (
                  <div className="bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2.5 space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-text-secondary">בקשות שנוצלו</span>
                        <span className={`font-semibold ${low ? 'text-loss' : 'text-text-primary'}`}>{aiUsage.used} / {aiUsage.limit}</span>
                      </div>
                      <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${low ? 'bg-loss' : 'bg-accent-primary'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {hasImg && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-text-secondary flex items-center gap-1"><Image className="w-3 h-3" /> ניתוחי תמונה</span>
                          <span className={`font-semibold ${imgLow ? 'text-loss' : 'text-text-primary'}`}>{aiUsage.imageUsed} / {aiUsage.imageLimit}</span>
                        </div>
                        <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${imgLow ? 'bg-loss' : 'bg-accent-primary'}`} style={{ width: `${imgPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="text-xs text-text-muted">…</div>
              )}
            </div>

          </div>

          {/* Right column: activity counts */}
          <div className="space-y-4">
            {/* Activity counts (read-only — uses Firestore count aggregation) */}
            <div>
              <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> שימוש (קריאה בלבד)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {COUNT_COLLECTIONS.map((c) => {
                  const Icon = c.icon;
                  const n = counts?.[c.key];
                  return (
                    <div key={c.key} className="bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-text-muted truncate">{c.label}</div>
                        <div className="text-sm font-semibold text-text-primary">
                          {counts === null ? '…' : n == null ? '—' : n}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {countsError && (
                <div className="mt-2 text-[11px] text-loss">{countsError}</div>
              )}
            </div>

            {/* Connections — push devices + linked exchanges (status only;
                subscriptions and API keys never leave the worker's KV). */}
            <div>
              <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> חיבורים
              </div>
              {connections === null ? (
                <div className="text-xs text-text-muted">…</div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {connections.devices == null ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border-primary">
                      <Bell className="w-3 h-3" /> Push: —
                    </span>
                  ) : connections.devices > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/30 font-semibold">
                      <Bell className="w-3 h-3" /> Push: {connections.devices === 1 ? 'מכשיר אחד' : `${connections.devices} מכשירים`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border-primary">
                      <Bell className="w-3 h-3" /> Push: לא רשום
                    </span>
                  )}
                  {(connections.exchanges || []).map((ex) => (
                    <span key={ex} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/30 font-semibold" dir="ltr">
                      <Link2 className="w-3 h-3" /> {EXCHANGE_NAMES[ex] || ex}
                    </span>
                  ))}
                  {connections.exchanges && connections.exchanges.length === 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border-primary">
                      אין בורסות מחוברות
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Private admin note — stored at adminNotes/{uid}, never visible
                to the user (admin-only read/write per firestore.rules). */}
            <div>
              <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" /> הערת אדמין (פרטית)
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={noteLoading ? 'טוען…' : 'הערה פנימית על הלקוח — גלויה לאדמינים בלבד'}
                disabled={noteLoading}
                maxLength={2000}
                rows={3}
                className="w-full bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-none disabled:opacity-50"
              />
              <button
                onClick={saveNote}
                disabled={noteLoading || noteSaving}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:border-accent-primary/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                {noteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {noteSaving ? 'שומר…' : 'שמור הערה'}
              </button>
            </div>
          </div>
        </div>

        {/* Customer timeline — full-width row at the bottom. Combines audit
            log entries scoped to this user, payments scoped to this user,
            and synthetic events (registration, last active) into one
            chronological feed, newest first. */}
        <CustomerTimeline user={user} />

        {/* Danger zone — permanent deletion runs through the worker's service
            account (admins are read-only on other users' data client-side, and
            only the service account can delete somebody else's Auth user). */}
        {user.role !== 'admin' && (
          confirmDelete ? (
            <div className="bg-loss/5 border border-loss/30 rounded-xl p-3 space-y-2">
              <p className="text-xs text-loss leading-relaxed">
                פעולה בלתי הפיכה: כל הנתונים, רשומת הלידרבורד וחשבון ההתחברות של{' '}
                <span className="font-bold">{user.email || user.displayName || user.id}</span> יימחקו לצמיתות.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={doDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-loss text-white text-sm font-bold hover:bg-loss/80 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'מוחק…' : 'אשר מחיקה סופית'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-loss/30 text-sm text-loss/80 hover:text-loss hover:bg-loss/5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> מחק משתמש לצמיתות
            </button>
          )
        )}


      </div>
    </Modal>
  );
}

// ── Analytics modal ──────────────────────────────────────────────────────────
// A circular progress ring rendered with SVG (no chart lib → keeps the admin
// bundle light). `color` is a Tailwind text-color class used via currentColor.
function Ring({ pct, label, sub, color = 'text-accent-primary' }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="flex flex-col items-center justify-center bg-bg-tertiary/40 border border-border-primary rounded-xl py-4">
      <div className={`relative ${color}`}>
        <svg width="78" height="78" viewBox="0 0 78 78" className="-rotate-90">
          <circle cx="39" cy="39" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="opacity-15" />
          <circle cx="39" cy="39" r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-text-primary">{pct}%</span>
        </div>
      </div>
      <div className="text-xs font-medium text-text-primary mt-2">{label}</div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function AnalyticsModal({ isOpen, onClose, a, onPickUser }) {
  const maxWeek = Math.max(1, ...a.weeks.map((w) => w.count));
  const [sendingTest, setSendingTest] = useState(false);
  const sendTestDigest = async () => {
    setSendingTest(true);
    try {
      const r = await adminSendTestDigest();
      toast.success(`📧 הדוח נשלח ל-${r.sentTo}`);
    } catch (e) {
      toast.error(e.message || 'שליחת המייל נכשלה');
    } finally {
      setSendingTest(false);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="אנליטיקס לקוחות" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Test digest email button */}
        <button
          onClick={sendTestDigest}
          disabled={sendingTest}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-sm font-semibold hover:bg-accent-primary/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Mail className="w-4 h-4" />
          {sendingTest ? 'שולח…' : '📧 שלח לי את הדוח עכשיו במייל (לבדיקה)'}
        </button>

        {/* Revenue */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
            <DollarSign className="w-3.5 h-3.5 text-profit" /> הכנסות
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-profit/5 border border-profit/30 rounded-xl px-3 py-3">
              <div className="text-lg font-bold text-profit leading-none">{ILS(a.totalRevenue)}</div>
              <div className="text-[10px] text-text-muted mt-1">הכנסה כוללת</div>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-3 py-3">
              <div className="text-lg font-bold text-text-primary leading-none">{ILS(a.mrr)}</div>
              <div className="text-[10px] text-text-muted mt-1">MRR (חודשי)</div>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-3 py-3">
              <div className="text-lg font-bold text-text-primary leading-none">{ILS(a.arpu)}</div>
              <div className="text-[10px] text-text-muted mt-1">ממוצע ללקוח</div>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-3 py-3">
              <div className="text-lg font-bold text-text-primary leading-none">{ILS(a.revenueThisMonth)}</div>
              <div className="text-[10px] text-text-muted mt-1">החודש</div>
            </div>
          </div>
          {a.totalRevenue === 0 && (
            <div className="text-[11px] text-text-muted mt-1.5">💡 רשום סכום ששולם בעת הענקת Premium כדי לראות כאן נתוני הכנסה.</div>
          )}
        </div>

        {/* Key rates */}
        <div className="grid grid-cols-3 gap-2">
          <Ring pct={a.conversion} label="המרה לפרימיום" sub={`${a.premiumC}/${a.totalC}`} color="text-amber-400" />
          <Ring pct={a.openRate} label="פתחו השבוע" sub={`${a.active7} פעילים`} color="text-profit" />
          <Ring pct={a.onboardRate} label="סיימו אונבורדינג" color="text-accent-primary" />
        </div>

        {/* Signups per week */}
        <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-3">
            <BarChart3 className="w-3.5 h-3.5" /> הצטרפות חדשה — 8 שבועות אחרונים
          </div>
          <div className="flex items-end justify-between gap-1.5 h-28">
            {a.weeks.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] text-text-secondary">{w.count || ''}</span>
                <div
                  className={`w-full rounded-t ${i === a.weeks.length - 1 ? 'bg-accent-primary' : 'bg-accent-primary/40'}`}
                  style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: w.count ? '4px' : '0' }}
                  title={`${w.count} משתמשים`}
                />
                <span className="text-[9px] text-text-muted">{w.weeksAgo === 0 ? 'השבוע' : `-${w.weeksAgo}`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity snapshot */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="פעילים 7 ימים" value={a.active7} icon={<Activity className="w-4 h-4" />} />
          <MiniStat label="פעילים 30 יום" value={a.active30} icon={<Activity className="w-4 h-4" />} />
          <MiniStat label="נכנסו אי פעם" value={a.everActive} icon={<Users className="w-4 h-4" />} />
        </div>

        {/* Most active customers */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> הלקוחות הכי פעילים
          </div>
          {a.topActive.length === 0 ? (
            <div className="text-sm text-text-muted text-center py-4 border border-dashed border-border-primary rounded-xl">
              עדיין אין נתוני פעילות. הם יופיעו אחרי שמשתמשים יפתחו את האפליקציה.
            </div>
          ) : (
            <div className="space-y-1.5">
              {a.topActive.map((u, idx) => (
                <button
                  key={u.id}
                  onClick={() => onPickUser(u)}
                  className="w-full flex items-center gap-3 bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2 text-right hover:border-accent-primary/40 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-bold text-text-muted w-4">{idx + 1}</span>
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary text-xs font-semibold">
                      {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{u.displayName || u.email}</span>
                  {isUserPremium(u) && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  <span className="text-[11px] text-text-muted shrink-0">{relativeActive(u.lastActive)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, icon }) {
  return (
    <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-3 py-3 flex items-center gap-2.5">
      <div className="text-text-muted">{icon}</div>
      <div>
        <div className="text-lg font-bold text-text-primary leading-none">{value}</div>
        <div className="text-[10px] text-text-muted mt-1">{label}</div>
      </div>
    </div>
  );
}

// ── Audit log modal ──────────────────────────────────────────────────────────
const KIND_META = {
  premium_grant: { label: 'הענקת Premium', color: 'text-amber-400', Icon: Crown },
  premium_revoke: { label: 'ביטול Premium', color: 'text-loss', Icon: X },
  notify: { label: 'שליחת Push', color: 'text-accent-primary', Icon: Send },
  coupon_create: { label: 'יצירת קופון', color: 'text-amber-400', Icon: Plus },
  coupon_delete: { label: 'מחיקת קופון', color: 'text-loss', Icon: Trash2 },
  coupon_redeem: { label: 'מימוש קופון', color: 'text-profit', Icon: Ticket },
  account_deleted: { label: 'מחיקת חשבון', color: 'text-loss', Icon: Trash2 },
};
const KIND_FILTER_OPTIONS = [
  { value: '', label: 'כל הסוגים' },
  ...Object.entries(KIND_META).map(([value, m]) => ({ value, label: m.label })),
];

function AuditLogModal({ isOpen, onClose, users }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState('');

  const usersById = useMemo(() => {
    const m = {};
    for (const u of (users || [])) m[u.id] = u;
    return m;
  }, [users]);
  const userLabel = (uid) => {
    if (!uid) return '—';
    const u = usersById[uid];
    return u ? (u.displayName || u.email || uid.slice(0, 6)) : uid.slice(0, 8) + '…';
  };

  const load = async () => {
    setLoading(true);
    try {
      const ev = await adminListAuditEvents({ kind: kindFilter || undefined, limit: 300 });
      setEvents(ev);
    } catch (e) {
      toast.error(e.message || 'טעינת היומן נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) load(); /* eslint-disable-next-line */ }, [isOpen, kindFilter]);

  const fmtTs = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="יומן פעולות" maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SelectDropdown
              value={kindFilter}
              onChange={(v) => setKindFilter(v || '')}
              options={KIND_FILTER_OPTIONS.slice(1)}
              placeholder="כל הסוגים"
              allowClear
            />
          </div>
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded-lg border border-border-primary text-xs text-text-secondary hover:text-text-primary cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 inline ${loading ? 'animate-spin' : ''}`} /> רענן
          </button>
        </div>

        {loading && events.length === 0 ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : events.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-10 border border-dashed border-border-primary rounded-xl">
            אין פעולות להציג.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto pr-1 space-y-1">
            {events.map((ev, i) => {
              const meta = KIND_META[ev.kind] || { label: ev.kind, color: 'text-text-secondary', Icon: ScrollText };
              const Icon = meta.Icon;
              return (
                <div key={i} className="bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 flex items-start gap-2.5">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                      <span className="text-[10px] text-text-muted">{fmtTs(ev.ts_iso)}</span>
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5 break-words">
                      {/* Deleted accounts vanish from the users list, so the
                          snapshot email/name in the event is the identity. */}
                      {ev.kind === 'account_deleted' && (
                        <span>
                          <span className="text-text-primary">{ev.displayName || ev.email || userLabel(ev.target)}</span>
                          {ev.email && ev.displayName && <span className="font-mono"> ({ev.email})</span>}
                          <span> · {ev.source === 'self' ? 'מחק את חשבונו בעצמו' : <>נמחק ע"י <span className="text-text-primary">{userLabel(ev.actor)}</span></>}</span>
                        </span>
                      )}
                      {ev.kind !== 'account_deleted' && ev.actor && <span>בוצע ע"י <span className="text-text-primary">{userLabel(ev.actor)}</span></span>}
                      {ev.kind !== 'account_deleted' && ev.target && <span> · יעד <span className="text-text-primary">{userLabel(ev.target)}</span></span>}
                      {ev.code && <span> · קוד <span className="font-mono text-amber-400">{ev.code}</span></span>}
                      {ev.days != null && <span> · {ev.days} ימים</span>}
                      {ev.planExpires && <span> · עד {new Date(ev.planExpires).toLocaleDateString('he-IL')}</span>}
                      {ev.maxUses != null && <span> · מקסימום {ev.maxUses}</span>}
                      {ev.sent != null && <span> · נשלח ל-{ev.sent}/{ev.total}</span>}
                    </div>
                    {ev.title && (
                      <div className="text-[11px] text-text-muted mt-1 italic truncate">
                        "{ev.title}" — {ev.body}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Styled number stepper with − / + buttons. value is a string (so the field
// can be cleared); onChange receives the new string.
function NumberStepper({ value, onChange, min = 1, max = 99999, step = 1, placeholder }) {
  const num = parseInt(value, 10);
  const set = (n) => onChange(String(Math.max(min, Math.min(max, n))));
  const dec = () => set((Number.isFinite(num) ? num : min) - step);
  const inc = () => set((Number.isFinite(num) ? num : min) + step);
  return (
    <div className="flex items-stretch rounded-lg border border-border-primary overflow-hidden bg-bg-secondary">
      <button
        type="button"
        onClick={dec}
        className="w-9 flex items-center justify-center text-text-secondary hover:text-loss hover:bg-bg-tertiary transition-colors cursor-pointer border-l border-border-primary"
        aria-label="הפחת"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="flex-1 w-full text-center bg-transparent text-sm text-text-primary outline-none py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={inc}
        className="w-9 flex items-center justify-center text-text-secondary hover:text-profit hover:bg-bg-tertiary transition-colors cursor-pointer border-r border-border-primary"
        aria-label="הוסף"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Coupons modal ────────────────────────────────────────────────────────────
function CouponsModal({ isOpen, onClose, users = [] }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [usageCode, setUsageCode] = useState(null); // code whose redeemers are shown

  const load = async () => {
    setLoading(true);
    try {
      setCoupons(await adminListCoupons());
    } catch (e) {
      toast.error(e.message || 'טעינה נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  const create = async () => {
    const c = code.trim().toUpperCase();
    if (!c || !Number.isFinite(parseInt(days, 10))) return;
    setCreating(true);
    try {
      await adminCreateCoupon({
        code: c,
        days: parseInt(days, 10),
        maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
        label: label.trim() || undefined,
      });
      toast.success(`קוד ${c} נוצר`);
      setCode(''); setMaxUses(''); setLabel('');
      load();
    } catch (e) {
      toast.error(e.message || 'יצירת הקוד נכשלה');
    } finally {
      setCreating(false);
    }
  };

  // Quick-disable. The worker has no coupon "disable" flag, so the only way to
  // stop a code from being redeemed is to delete it (adminDeleteCoupon) — hence
  // the "לא ניתן לשחזר" warning. Irreversible.
  const disable = async (codeToDisable) => {
    if (!window.confirm('להשבית את הקוד? לא ניתן לשחזר')) return;
    try {
      await adminDeleteCoupon(codeToDisable);
      toast.success('הקוד הושבת');
      load();
    } catch (e) {
      toast.error(e.message || 'ההשבתה נכשלה');
    }
  };

  const copy = (c) => {
    navigator.clipboard?.writeText(c);
    toast.success(`${c} הועתק`);
  };
  const shareLink = (c) => couponShareUrl(c);
  const copyShare = (c) => {
    navigator.clipboard?.writeText(shareLink(c));
    toast.success('קישור השיתוף הועתק 🔗');
  };
  const shareNative = async (c) => {
    const url = shareLink(c);
    const text = `🎁 קוד מתנה ל-TradeOS Premium! לחצו לקבל: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'TradeOS Premium', text, url }); } catch { /* cancelled */ }
    } else {
      navigator.clipboard?.writeText(text);
      toast.success('הקישור הועתק לשיתוף');
    }
  };

  // Random A-Z0-9 code helper
  const randomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setCode(out);
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="קופוני Premium" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Create */}
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-text-primary">צור קוד חדש</div>
          <div className="space-y-3">
            {/* Code + random */}
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="קוד (לדוגמה TRADEOS7)"
                className="flex-1 min-w-0 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500 font-mono uppercase"
                dir={code ? 'ltr' : 'rtl'}
                maxLength={32}
              />
              <button onClick={randomCode} className="shrink-0 px-3 rounded-lg border border-border-primary text-xs text-text-secondary hover:text-text-primary hover:border-amber-500/50 transition-colors cursor-pointer">
                אקראי
              </button>
            </div>
            {/* Two steppers — labels forced to one line + fixed height so the
                fields below them align (the long "unlimited" hint used to wrap
                and skew the row). */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-[11px] text-text-muted flex items-center h-4 mb-1 whitespace-nowrap">ימי Premium</label>
                <NumberStepper value={String(days)} onChange={setDays} min={1} max={3650} />
              </div>
              <div>
                <label className="text-[11px] text-text-muted flex items-center h-4 mb-1 whitespace-nowrap">מקסימום שימושים</label>
                <NumberStepper value={maxUses} onChange={setMaxUses} min={1} placeholder="∞" />
              </div>
            </div>
            <p className="text-[10px] text-text-muted -mt-1">💡 השאירו "מקסימום שימושים" ריק (∞) לקוד ללא הגבלה.</p>
            {/* Internal label */}
            <div>
              <label className="text-[11px] text-text-muted block mb-1">תיוג פנימי (לא חובה)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='לדוגמה: "קמפיין אינסטגרם נובמבר"'
                maxLength={80}
                dir="rtl"
                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary text-right outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <button
            onClick={create}
            disabled={creating || !code.trim() || !days}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 text-bg-primary text-sm font-bold hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {creating ? 'יוצר…' : 'צור קוד'}
          </button>
        </div>

        {/* List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-text-primary">קודים קיימים ({coupons.length})</span>
            <button onClick={load} disabled={loading} className="text-xs text-text-muted hover:text-text-primary cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 inline ${loading ? 'animate-spin' : ''}`} /> רענן
            </button>
          </div>
          {coupons.length === 0 ? (
            <div className="text-sm text-text-muted text-center py-6 border border-dashed border-border-primary rounded-xl">
              עדיין אין קודים. צור את הראשון למעלה.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {coupons.map((c) => {
                // Usage vs quota. maxUses is a positive number or null (uncapped).
                const cap = Number.isFinite(c.maxUses) && c.maxUses > 0 ? c.maxUses : null;
                const used = Number(c.used) || 0;
                const fullyUsed = cap != null && used >= cap;
                const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < Date.now() : false;
                // A spent or expired code can never be redeemed again → dim it.
                const dimmed = fullyUsed || expired;
                const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
                return (
                  <div
                    key={c.code}
                    className={`bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 flex items-center gap-3 transition-opacity ${dimmed ? 'opacity-50' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setUsageCode(c.code)} className="font-mono text-sm font-bold text-amber-400 hover:text-amber-300 cursor-pointer underline decoration-dotted decoration-amber-400/40 underline-offset-2" dir="ltr" title="לחץ לראות מי מימש את הקוד">
                          {c.code}
                        </button>
                        <button onClick={() => copy(c.code)} className="p-0.5 -ml-0.5 text-text-muted hover:text-amber-400 cursor-pointer" title="העתק קוד">
                          <Copy className="w-3 h-3" />
                        </button>
                        <span className="text-[11px] text-text-muted">· {c.days} ימים</span>
                        {/* Utilisation vs quota (or vs ∞ when uncapped) */}
                        <span className="text-[11px] font-mono text-text-secondary" dir="ltr">{used} / {cap ?? '∞'}</span>
                        {/* Redemption / expiry badges — obvious at a glance */}
                        {fullyUsed && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> נוצל במלואו
                          </span>
                        )}
                        {expired && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-loss/10 border border-loss/40 text-loss font-semibold">
                            <AlertTriangle className="w-3 h-3" /> פג
                          </span>
                        )}
                        {!fullyUsed && !expired && used > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-profit/10 border border-profit/40 text-profit font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> מומש
                          </span>
                        )}
                      </div>
                      {/* Slim utilisation bar — only meaningful when capped */}
                      {cap != null && (
                        <div className="mt-1.5 h-1 rounded-full bg-bg-tertiary overflow-hidden" dir="ltr">
                          <div
                            className={`h-full rounded-full transition-all ${fullyUsed ? 'bg-amber-500' : 'bg-profit'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      {/* Expiry date + internal label */}
                      {(c.expiresAt || c.label) && (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {c.expiresAt && (
                            <span className={`inline-flex items-center gap-1 text-[10px] ${expired ? 'text-loss' : 'text-text-muted'}`}>
                              <Calendar className="w-3 h-3" /> תפוגה {formatDate(c.expiresAt)}
                            </span>
                          )}
                          {c.label && <span className="text-[10px] text-text-muted truncate">{c.label}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => shareNative(c.code)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-amber-400 cursor-pointer"
                      title="שתף קישור"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => copyShare(c.code)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-primary cursor-pointer"
                      title="העתק קישור שיתוף"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => disable(c.code)} className="p-1.5 rounded-lg text-text-muted hover:text-loss cursor-pointer" title="השבת קוד (מחיקה)">
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
    {usageCode && (
      <CouponUsageModal code={usageCode} users={users} onClose={() => setUsageCode(null)} />
    )}
    </>
  );
}

// ── Coupon usage (who redeemed a code) ──────────────────────────────────────
// Compact modal: pulls the audit log's `coupon_redeem` events, filters to this
// code, resolves each actor uid to a user, newest first.
function CouponUsageModal({ code, users = [], onClose }) {
  const [rows, setRows] = useState(null);
  const byId = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  useEffect(() => {
    let cancelled = false;
    adminListAuditEvents({ kind: 'coupon_redeem', limit: 500 })
      .then((ev) => {
        if (cancelled) return;
        const norm = String(code || '').toUpperCase();
        const mine = (ev || [])
          .filter((e) => String(e.code || '').toUpperCase() === norm)
          .sort((a, b) => (b.ts || 0) - (a.ts || 0));
        setRows(mine);
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md" title={(
      <span className="inline-flex items-center gap-2">
        <Ticket className="w-4 h-4 text-amber-400" />
        <span className="font-bold">מי מימש את <span className="font-mono text-amber-400" dir="ltr">{code}</span></span>
      </span>
    )}>
      {rows === null ? (
        <div className="text-sm text-text-muted text-center py-6">טוען…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-text-muted text-center py-8 border border-dashed border-border-primary rounded-xl">
          עדיין אף אחד לא מימש את הקוד הזה.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          <div className="text-[11px] text-text-muted mb-1">{rows.length} מימושים · החדש למעלה</div>
          {rows.map((e, i) => {
            const u = byId.get(e.actor);
            const name = u?.displayName || u?.email || (e.actor ? `${e.actor.slice(0, 8)}…` : 'משתמש');
            return (
              <div key={`${e.actor}-${e.ts}-${i}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-secondary border border-border-primary">
                {u?.photoURL ? (
                  <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-bg-primary border border-border-primary flex items-center justify-center text-text-secondary text-xs font-semibold shrink-0">
                    {(name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary truncate">{name}</div>
                  {u?.email && u?.displayName && <div className="text-[10px] text-text-muted truncate" dir="ltr">{u.email}</div>}
                </div>
                <div className="text-[10px] text-text-muted text-left shrink-0" title={e.ts ? fmtFullDate(e.ts) : ''}>
                  {e.ts ? fmtRelativeTime(e.ts) : ''}
                  {e.days ? <div className="text-amber-400/80">+{e.days} ימים</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ── Customer timeline ──────────────────────────────────────────────────────
// Chronological feed of everything that ever happened to one customer:
// registration, premium grants/revokes, coupon redemptions, push messages,
// payments, last active. Pulls from the audit log (filtered to this user as
// the target), the payments collection (filtered by uid), and synthetic
// events from the user profile itself. Newest first.

function fmtFullDate(ts) {
  return new Date(ts).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'הרגע';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} ד'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}

function CustomerTimeline({ user }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    if (!user) { setEvents(null); return; }
    let cancelled = false;

    // Audit log + payments are admin-only collections; both calls degrade to
    // empty arrays if rules haven't been deployed yet (rather than blowing up
    // the modal).
    Promise.all([
      adminListAuditEvents({ limit: 500 }).catch(() => []),
      getAllPayments().catch(() => []),
    ]).then(([allAudit, allPayments]) => {
      if (cancelled) return;

      const items = [];

      // Synthetic: registration.
      const createdMs = toDate(user.createdAt)?.getTime();
      if (createdMs) {
        items.push({
          ts: createdMs,
          iconNode: <UserPlus className="w-3.5 h-3.5" />,
          color: 'text-profit border-profit/30 bg-profit/10',
          title: 'נרשם ל-TradeOS',
        });
      }

      // Synthetic: last active. Only one — the most recent.
      const lastActiveMs2 = toDate(user.lastActive)?.getTime();
      if (lastActiveMs2) {
        items.push({
          ts: lastActiveMs2,
          iconNode: <Clock className="w-3.5 h-3.5" />,
          color: 'text-accent-primary border-accent-primary/30 bg-accent-primary/10',
          title: 'פעילות אחרונה באפליקציה',
        });
      }

      // Audit events scoped to this user as the target.
      for (const ev of allAudit) {
        if (ev.target !== user.id) continue;
        const ts = ev.ts_iso ? new Date(ev.ts_iso).getTime() : 0;
        if (!ts) continue;

        if (ev.kind === 'premium_grant') {
          items.push({
            ts,
            iconNode: <Crown className="w-3.5 h-3.5" />,
            color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
            title: ev.days ? `קיבל Premium ל-${ev.days} ימים` : 'קיבל Premium',
            sub: 'הוענק מהפאנל',
          });
        } else if (ev.kind === 'premium_revoke') {
          items.push({
            ts,
            iconNode: <X className="w-3.5 h-3.5" />,
            color: 'text-loss border-loss/30 bg-loss/10',
            title: 'Premium בוטל',
          });
        } else if (ev.kind === 'coupon_redeem') {
          items.push({
            ts,
            iconNode: <Ticket className="w-3.5 h-3.5" />,
            color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
            title: ev.code ? `מימש קופון ${ev.code}` : 'מימש קופון',
            sub: ev.days ? `קיבל ${ev.days} ימי Premium` : null,
          });
        } else if (ev.kind === 'notify') {
          items.push({
            ts,
            iconNode: <Send className="w-3.5 h-3.5" />,
            color: 'text-accent-primary border-accent-primary/30 bg-accent-primary/10',
            title: ev.title ? `קיבל Push: "${ev.title}"` : 'קיבל Push',
          });
        }
      }

      // Payments scoped to this user.
      for (const p of allPayments) {
        if (p.uid !== user.id) continue;
        const ts = toDate(p.createdAt)?.getTime();
        if (!ts) continue;
        items.push({
          ts,
          iconNode: <DollarSign className="w-3.5 h-3.5" />,
          color: 'text-profit border-profit/30 bg-profit/10',
          title: `שילם ${ILS(p.amount || 0)}`,
          sub: p.days ? `מנוי ${p.days} ימים` : null,
        });
      }

      items.sort((a, b) => b.ts - a.ts);
      setEvents(items);
    }).catch(() => {
      if (!cancelled) setEvents([]);
    });

    return () => { cancelled = true; };
  }, [user]);

  return (
    <div>
      <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" /> ציר זמן הלקוח
      </div>

      {events === null ? (
        <div className="text-xs text-text-muted text-center py-6">טוען היסטוריה…</div>
      ) : events.length === 0 ? (
        <div className="text-xs text-text-muted text-center py-6 border border-dashed border-border-primary rounded-xl">
          אין אירועים עדיין.
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map((ev, i) => (
            <div key={i} className="bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2 flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${ev.color}`}>
                {ev.iconNode}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{ev.title}</div>
                {ev.sub && <div className="text-[11px] text-text-muted">{ev.sub}</div>}
                <div className="text-[10px] text-text-muted mt-0.5">
                  {fmtRelativeTime(ev.ts)} · {fmtFullDate(ev.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
