import { useState, useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { UserPlus, ShieldCheck, CheckCircle2, RefreshCw, Calendar, Coins, BookOpen, FlaskConical, Activity, FileText, Crown, Send, X, Ticket, Plus, Minus, Trash2, Copy, ScrollText, Share2, Link2, AlertTriangle, Clock, DollarSign, Loader2, Ban, ChevronDown, Bell } from 'lucide-react';
import { m } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import ReengageComposer from './ReengageComposer';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminGrowth from './AdminGrowth';
import AdminSystem from './AdminSystem';
import AdminNotifications from './AdminNotifications';
import { primaryBtn, softBtn, Pill, Meter, Avatar } from './AdminUi';
import {
  DAY_MS, RISK_DAYS, ILS, EXCHANGE_NAMES, KIND_META, toDate, formatDate, isUserPremium, lastActiveMs, createdMs,
  daysSinceActive, relativeActive, activeWithin, daysUntilExpiry, isAtRisk, systemChecks, userStatus,
} from './adminUtils';
import { getAllUsers, getUserSubcollectionCount, adminGrantPremium, adminRevokePremium, addPayment, getAllPayments, getAdminMeta, setAdminMeta } from '../../services/firestoreService';
import { APP_VERSION } from '../../utils/constants';
import { fetchUserAiUsage, fetchGlobalAiUsage, fetchAiStats, fetchSystemHealth, testAiProviders } from '../../hooks/useAiUsage';
import { adminSendNotification, adminScheduleExpiryReminders, adminCancelExpiryReminders, adminRefreshPlanCache, adminListAuditEvents, adminSendPaymentEmail, adminDeleteUser, adminGetPushStatus, adminGetExchangesStatus, adminGetFirebaseUsage } from '../../services/pushService';
import { adminListCoupons, adminCreateCoupon, adminDeleteCoupon, couponShareUrl } from '../../services/couponService';
import { subscribeUnreadAdminNotificationCount } from '../../services/adminNotificationService';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';
import Modal from '../shared/Modal';
import PageHeader from '../shared/PageHeader';
import TabStrip from '../shared/TabStrip';

// Mirrors the worker's AI caps (FREE_LIMITS.aiPerDay / AI_PREMIUM_LIMITS.day /
// AI_IMAGE_DAILY_LIMIT) — used only for the "close to the AI quota" to-do.
const AI_TEXT_LIMIT = { free: 20, premium: 200 };
const AI_IMAGE_LIMIT = 10; // premium only

const TAB_IDS = ['overview', 'users', 'growth', 'system', 'notifications'];
const LEVEL_DOT = {
  ok: 'bg-profit shadow-[0_0_8px_rgba(34,197,94,0.7)]',
  warn: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
  bad: 'bg-loss shadow-[0_0_8px_rgba(239,68,68,0.7)]',
};

// Phones open the full user modal straight away; desktop shows the side panel.
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

export default function AdminPanel() {
  const { isAdmin, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TAB_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const demoNotifs = searchParams.get('demo') === '1';
  const setTab = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === 'overview') next.delete('tab'); else next.set('tab', id);
    return next;
  }, { replace: true });

  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Users tab side panel selection, and the full details modal
  // ({ id, user, startWith: 'grant' | 'notify' | null }).
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [couponsKey, setCouponsKey] = useState(0);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditKey, setAuditKey] = useState(0);
  // { title, users } — a quick list opened from the overview's to-do rows.
  const [listModal, setListModal] = useState(null);
  const [bulk, setBulk] = useState(null); // { seg } while the reminder modal is open

  // Aggregate AI usage across all users today (text + image) from the worker.
  const [globalAi, setGlobalAi] = useState(null);
  // Daily AI stats (counts + real tokens) for the usage-over-time graph.
  const [aiStats, setAiStats] = useState(null);
  const [statsDays, setStatsDays] = useState(30);
  // System health (cron heartbeat, push/AI configured, Cloudflare quotas).
  const [health, setHealth] = useState(null);
  // AI provider connectivity self-test result + in-flight flag.
  const [aiTest, setAiTest] = useState(null);
  const [aiTesting, setAiTesting] = useState(false);
  const runAiTest = async () => {
    setAiTesting(true);
    try { setAiTest(await testAiProviders()); }
    finally { setAiTesting(false); }
  };
  // Firebase document counts — { counts } or { error: true }.
  const [fbUsage, setFbUsage] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [liveUnread, setLiveUnread] = useState(0);
  const [demoUnread, setDemoUnread] = useState(0);
  const unread = demoNotifs ? demoUnread : liveUnread;

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
    if (!isAdmin || demoNotifs) return undefined;
    return subscribeUnreadAdminNotificationCount(setLiveUnread, () => {});
  }, [isAdmin, demoNotifs]);

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

  // Firebase counts — best-effort: a failure shows in the system tab, it must
  // never break the panel. Refreshed with the header refresh and its own button.
  const refreshFbUsage = () => {
    setFbLoading(true);
    adminGetFirebaseUsage()
      .then((d) => setFbUsage(d))
      .catch(() => setFbUsage((prev) => prev || { error: true }))
      .finally(() => setFbLoading(false));
  };
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

  // Active users (DAU/WAU) and a 30-day signups series — both derived from
  // the already-loaded users list, no extra queries.
  const growth = useMemo(() => {
    const now = loadedAt || Date.now();
    let dau = 0, wau = 0;
    for (const u of users) {
      const ms = lastActiveMs(u);
      if (!ms) continue;
      if (now - ms <= DAY_MS) dau++;
      if (now - ms <= 7 * DAY_MS) wau++;
    }
    const buckets = {};
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY_MS);
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
    return { dau, wau, signups: series.map((s) => ({ date: s.date, count: buckets[s.key] })) };
  }, [users, loadedAt]);

  const stats = useMemo(() => {
    const weekAgo = loadedAt - 7 * DAY_MS;
    const newThisWeek = [];
    const onboarded = [];
    const premium = [];
    for (const u of users) {
      const created = toDate(u.createdAt);
      if (created && created.getTime() >= weekAgo) newThisWeek.push(u);
      if (u.onboardingCompleted) onboarded.push(u);
      if (isUserPremium(u) && u.role !== 'admin') premium.push(u);
    }
    return { total: users, newThisWeek, onboarded, premium };
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
      if (pct >= 0.8) out.push({ uid, u, pct });
    }
    return out.sort((a, b) => b.pct - a.pct);
  }, [globalAi, users]);

  // Premium customers who haven't opened the app in 7+ days — the "churn risk"
  // list. Sorted by how long they've been gone (longest first).
  const churned = useMemo(() => users
    .filter((u) => u.role !== 'admin' && isUserPremium(u) && lastActiveMs(u) > 0 && daysSinceActive(u) >= 7)
    .sort((a, b) => daysSinceActive(b) - daysSinceActive(a)), [users]);

  // Premium customers whose plan expires within the next 7 days — reach out to
  // renew them before they lapse. Sorted by soonest expiry.
  const expiringSoon = useMemo(() => users
    .filter((u) => {
      if (u.role === 'admin' || !isUserPremium(u) || !u.planExpires) return false;
      const d = daysUntilExpiry(u);
      return d >= 0 && d <= 7;
    })
    .sort((a, b) => daysUntilExpiry(a) - daysUntilExpiry(b)), [users]);

  // Who a reminder can go to — shared by the overview's to-do rows and the
  // reminder modal's audience picker.
  const segments = useMemo(() => {
    const now = Date.now();
    const customers = users.filter((u) => u.role !== 'admin');
    return {
      all: users,
      inactive: customers.filter(isAtRisk).sort((a, b) => daysSinceActive(b) - daysSinceActive(a)),
      newThisWeek: stats.newThisWeek,
      premium: stats.premium,
      churned,
      notOnboarded: customers.filter((u) => !u.onboardingCompleted && now - createdMs(u) <= 14 * DAY_MS),
      onboarded: stats.onboarded,
    };
  }, [users, stats, churned]);

  // Revenue + conversion: total from the payments log; MRR normalises each
  // active paid plan to a 30-day rate (lifetime grants are one-off → excluded).
  const analytics = useMemo(() => {
    const customers = users.filter((u) => u.role !== 'admin');
    const premiumC = customers.filter((u) => isUserPremium(u)).length;
    const totalRevenue = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    let mrr = 0;
    for (const u of customers) {
      if (!isUserPremium(u)) continue;
      const amt = Number(u.planAmount);
      const days = Number(u.planDays);
      if (amt > 0 && days > 0) mrr += (amt / days) * 30;
    }
    return {
      conversion: customers.length ? Math.round((premiumC / customers.length) * 100) : 0,
      totalRevenue,
      mrr: Math.round(mrr),
    };
  }, [users, payments]);

  // Activation funnel. Every stage derives ONLY from the already-loaded
  // `users` array — no per-user subcollection queries (a trades count per user
  // would be N Firestore count-queries against shared production data).
  // Stages are CUMULATIVE so the counts strictly decline. Admins excluded.
  const funnel = useMemo(() => {
    const registered = users.filter((u) => u.role !== 'admin');
    // Finished (or skipped past) the onboarding wizard.
    const onboarded = registered.filter((u) => u.onboardingCompleted === true);
    // Came back on a later day than the signup session (lastActive is stamped
    // on app-open, throttled hourly). Proxy for activation.
    const returned = onboarded.filter((u) => {
      const c = createdMs(u);
      const l = lastActiveMs(u);
      return c > 0 && l > 0 && l - c > DAY_MS;
    });
    // Still active in the last 7 days (retained).
    const active7 = returned.filter((u) => activeWithin(u, 7));
    const raw = [
      { key: 'registered', label: 'נרשמו', count: registered.length, note: 'מסמך משתמש קיים · role ≠ admin' },
      { key: 'onboarded', label: 'השלימו הגדרה ראשונית', count: onboarded.length, note: 'onboardingCompleted = true' },
      { key: 'returned', label: 'חזרו אחרי יום ההרשמה', count: returned.length, note: 'lastActive מאוחר ביום+ מ-createdAt' },
      { key: 'active7', label: 'פעילים השבוע', count: active7.length, note: 'lastActive בתוך 7 ימים' },
    ];
    const stages = raw.map((s, i) => ({
      ...s,
      // Share of the PREVIOUS stage lost at this step.
      dropPct: i === 0 || raw[i - 1].count === 0 ? 0 : Math.round((1 - s.count / raw[i - 1].count) * 100),
    }));
    return { total: registered.length, stages };
  }, [users]);

  // Revenue over time: monthly totals from the payments log (last 12 months).
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
        total: 0,
      });
    }
    for (const p of payments) {
      const d = toDate(p.createdAt);
      if (!d) continue;
      const at = index[`${d.getFullYear()}-${d.getMonth()}`];
      if (at === undefined) continue; // older than 12 months
      months[at].total += Number(p.amount) || 0;
    }
    return months;
  }, [payments]);

  const checks = useMemo(() => systemChecks({ health, globalAi, aiTest, fbUsage }), [health, globalAi, aiTest, fbUsage]);

  // Opening a user from anywhere: jump to the users tab with them selected;
  // phones get the full modal (no room for the side panel).
  const openUser = (u) => {
    setTab('users');
    setSelectedId(u.id);
    if (!isDesktop()) setDetail({ id: u.id, user: u, startWith: null });
  };
  const selectUser = (u) => {
    setSelectedId(u.id);
    if (!isDesktop()) setDetail({ id: u.id, user: u, startWith: null });
  };
  const openDetail = (u, startWith = null) => setDetail({ id: u.id, user: u, startWith });
  // The modal follows the refreshed users list so a grant/revoke shows at once.
  const detailUser = detail ? (users.find((u) => u.id === detail.id) || detail.user) : null;

  // Wait for the profile (and thus the role) to resolve before deciding.
  if (profile === null) return <LoadingSpinner />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const tabs = [
    { id: 'overview', label: 'סקירה' },
    { id: 'users', label: 'משתמשים' },
    { id: 'growth', label: 'צמיחה' },
    {
      id: 'system',
      label: (
        <span className="inline-flex items-center gap-1.5">
          מערכת
          {LEVEL_DOT[checks.level] && <span aria-label={checks.level === 'ok' ? 'תקין' : 'דורש בדיקה'} className={`w-[7px] h-[7px] rounded-full ${LEVEL_DOT[checks.level]}`} />}
        </span>
      ),
    },
    { id: 'notifications', label: 'התראות', mobileLabel: 'התראות', count: unread },
  ];

  return (
    <div dir="rtl" className="max-w-6xl mx-auto">
      <PageHeader
        icon={ShieldCheck}
        title="ניהול"
        subtitle={loading && !users.length ? 'טוען…' : `${users.length} משתמשים · עודכן ${relativeActive(loadedAt)}`}
        actions={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="hidden md:block rounded-xl bg-bg-tertiary border border-border-primary p-1">
              <TabStrip tabs={tabs} value={tab} onChange={setTab} layoutKey="admin-tab" />
            </div>
            <button
              type="button"
              onClick={() => setTab('notifications')}
              aria-label={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
              title="התראות"
              data-testid="admin-notif-bell"
              className="relative w-11 h-11 shrink-0 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary grid place-items-center cursor-pointer"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unread > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-loss text-white text-[10px] font-bold grid place-items-center num-mono">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <button type="button" onClick={load} disabled={loading} aria-label="רענון נתונים" title="רענון נתונים"
              className="w-11 h-11 shrink-0 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary grid place-items-center cursor-pointer disabled:opacity-50">
              <RefreshCw className={`w-[18px] h-[18px] ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => setBulk({ seg: 'all' })} className={`${primaryBtn} h-11 flex-1 sm:flex-none`}>
              <Send className="w-4 h-4" /> שליחת תזכורת
            </button>
          </div>
        )}
      />

      <div className="md:hidden -mt-1 mb-4 rounded-xl bg-bg-tertiary border border-border-primary p-1">
        <TabStrip tabs={tabs} value={tab} onChange={setTab} variant="mobile" layoutKey="admin-tab" />
      </div>

      {error && (
        <div className="mb-4 bg-loss/10 border border-loss/30 text-loss rounded-xl p-3 text-sm">{error}</div>
      )}

      <m.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
        {tab === 'overview' && (loading && !users.length ? <div className="py-16"><LoadingSpinner /></div> : (
          <AdminOverview
            users={users} now={loadedAt} stats={stats} analytics={analytics} growth={growth} segments={segments}
            expiringSoon={expiringSoon} quotaAlerts={quotaAlerts} systemIssues={checks.issues}
            onRemind={(seg) => setBulk({ seg })}
            onOpenUser={openUser}
            onShowList={(title, list) => setListModal({ title, users: list })}
            onGoTab={setTab}
          />
        ))}
        {tab === 'users' && (
          <AdminUsers
            users={users} loading={loading && !users.length} selectedId={selectedId}
            onSelect={selectUser} onOpenDetail={openDetail}
            onUsersChanged={() => { setSelectedId(null); load(); }}
          />
        )}
        {tab === 'growth' && (loading && !users.length ? <div className="py-16"><LoadingSpinner /></div> : (
          <AdminGrowth
            users={users} funnel={funnel} analytics={analytics} revenueSeries={revenueSeries}
            couponsKey={couponsKey} onOpenCoupons={() => setCouponsOpen(true)}
          />
        ))}
        {tab === 'system' && (
          <AdminSystem
            checks={checks} users={users} auditKey={auditKey}
            onOpenAudit={() => setAuditOpen(true)} onOpenUser={openUser}
            health={health} globalAi={globalAi} aiStats={aiStats} statsDays={statsDays} setStatsDays={setStatsDays}
            aiTest={aiTest} aiTesting={aiTesting} runAiTest={runAiTest}
            fbUsage={fbUsage} fbLoading={fbLoading} refreshFbUsage={refreshFbUsage}
          />
        )}
        {tab === 'notifications' && (
          <AdminNotifications demo={demoNotifs} onUnreadChange={demoNotifs ? setDemoUnread : undefined} />
        )}
      </m.div>

      <UserDetailModal
        user={detailUser}
        startWith={detail?.startWith || null}
        onClose={() => { setDetail(null); setAuditKey((k) => k + 1); }}
        onUserChanged={load}
      />
      <CouponsModal isOpen={couponsOpen} onClose={() => { setCouponsOpen(false); setCouponsKey((k) => k + 1); }} users={users} />
      <AuditLogModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} users={users} />
      <UserListModal
        data={listModal}
        onClose={() => setListModal(null)}
        onPickUser={(u) => { setListModal(null); openUser(u); }}
      />
      <BulkNotifyModal
        isOpen={!!bulk}
        initialSegment={bulk?.seg || 'all'}
        onClose={() => { setBulk(null); setAuditKey((k) => k + 1); }}
        segments={segments}
      />
    </div>
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

// ── Reminder modal — push and/or email to a whole segment of users ─────────
const SEGMENT_LABELS = {
  all: 'כל המשתמשים',
  inactive: `לא נכנסו ${RISK_DAYS}+ ימים`,
  newThisWeek: 'חדשים השבוע',
  premium: 'לקוחות Premium',
  churned: 'Premium בסיכון',
  notOnboarded: 'לא השלימו הגדרה ראשונית',
  onboarded: 'השלימו הגדרה ראשונית',
};

function BulkNotifyModal({ isOpen, onClose, segments, initialSegment = 'all' }) {
  // Each opening starts on the audience it was opened for, until another is picked.
  const [picked, setPicked] = useState(null);
  // People taken off this send by hand (ids), and whether the list is open.
  const [excluded, setExcluded] = useState(() => new Set());
  const [listOpen, setListOpen] = useState(false);
  const seg = picked ?? initialSegment;
  const pick = (k) => { setPicked(k); setExcluded(new Set()); };
  const close = () => { setPicked(null); setExcluded(new Set()); setListOpen(false); onClose(); };
  const toggle = (id) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const targets = segments?.[seg] || [];
  const chosen = targets.filter((u) => !excluded.has(u.id));
  // `marketing`: the user opted in to email updates — the only ones a campaign reaches.
  const recipients = chosen.map((u) => ({ id: u.id, email: u.email || '', name: u.displayName || '', marketing: u.marketingEmails === true }));
  const withEmail = chosen.filter((u) => u.email && u.marketingEmails === true).length;

  return (
    <Modal isOpen={isOpen} onClose={close} title="שליחת תזכורת למשתמשים" maxWidth="max-w-xl">
      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs text-text-secondary block mb-1.5">למי לשלוח</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SEGMENT_LABELS).map((k) => {
              const count = segments?.[k]?.length || 0;
              if (!count && k !== seg && k !== 'all') return null;
              const active = seg === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${active ? 'bg-accent-primary/15 border-accent-primary/50 text-sky-200' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}
                >
                  {SEGMENT_LABELS[k]} <span className="num-mono opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Exactly who gets it — open the list to see everyone and take
            people off before sending. */}
        <div className="rounded-xl border border-border-primary bg-bg-tertiary/50">
          <button type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}
            className="w-full flex items-center gap-3 px-3.5 py-3 text-right cursor-pointer">
            <span className="flex -space-x-2 space-x-reverse shrink-0">
              {chosen.slice(0, 5).map((u) => (
                <span key={u.id} className="rounded-full ring-2 ring-bg-primary"><Avatar user={u} size="w-7 h-7 text-[10px]" /></span>
              ))}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-primary">
                {chosen.length === 0 ? 'אין נמענים' : `${chosen.length} נמענים`}
                {excluded.size > 0 && <span className="text-text-secondary font-normal"> · {excluded.size} הוסרו</span>}
              </span>
              <span className="block text-xs text-text-secondary truncate">
                {chosen.slice(0, 3).map((u) => u.displayName || u.email).join(', ')}{chosen.length > 3 ? ` ועוד ${chosen.length - 3}` : ''}
                {chosen.length > 0 && ` · ${withEmail} אישרו דיוור במייל`}
              </span>
            </span>
            <span className="text-xs font-semibold text-accent-hover shrink-0">{listOpen ? 'סגירה' : 'הצגת הרשימה'}</span>
            <ChevronDown className={`w-4 h-4 text-text-secondary shrink-0 transition-transform ${listOpen ? 'rotate-180' : ''}`} />
          </button>
          {listOpen && (
            <div className="border-t border-border-primary max-h-64 overflow-y-auto px-1.5 py-1.5">
              {targets.map((u) => {
                const on = !excluded.has(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-bg-tertiary transition-opacity ${on ? '' : 'opacity-45'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(u.id)} className="w-4 h-4 accent-blue-500 cursor-pointer shrink-0" />
                    <Avatar user={u} size="w-7 h-7 text-[10px]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-text-primary truncate">{u.displayName || u.email || '—'}</span>
                      <span className="block text-xs text-text-secondary truncate" dir="ltr" style={{ textAlign: 'right' }}>{u.email || 'אין מייל — רק התראה'}</span>
                    </span>
                    <span className="text-xs text-text-secondary whitespace-nowrap">{relativeActive(u.lastActive)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <ReengageComposer recipients={recipients} onSent={close} />
      </div>
    </Modal>
  );
}

// ── User detail modal ────────────────────────────────────────────────────────
const COUNT_COLLECTIONS = [
  { key: 'trades', label: 'עסקאות', icon: Activity },
  { key: 'journals', label: 'יומני מסחר', icon: BookOpen },
  { key: 'backtests', label: 'בקטסטים', icon: FlaskConical },
  { key: 'backtestJournals', label: 'יומני בקטסט', icon: FlaskConical },
  { key: 'dca', label: 'תוכניות DCA', icon: Coins },
  { key: 'tradingPlans', label: 'תוכניות מסחר', icon: FileText },
  // The mental journals (morning/evening) are owner-only in the rules — admins
  // can't read them, not even to count them.
];

function UserDetailModal({ user, onClose, onUserChanged, startWith = null }) {
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

  // Opened from the users tab's side panel straight on an action.
  useEffect(() => {
    if (!uid) return;
    setGrantOpen(startWith === 'grant');
    setNotifyOpen(startWith === 'notify');
  }, [uid, startWith]);

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
  const status = userStatus(user);
  const premium = user.role !== 'admin' && isUserPremium(user);
  const plan = user.role === 'admin' ? null
    : premium ? (user.planExpires ? `Premium · עד ${formatDate(user.planExpires)}` : 'Premium · ללא הגבלה')
      : 'חינם';
  const count = (k) => (counts === null ? '…' : counts[k] == null ? '—' : counts[k]);
  // Everything beyond trades/journals, folded into one quiet line.
  const extraUsage = counts ? COUNT_COLLECTIONS
    .filter((c) => !['trades', 'journals'].includes(c.key) && counts[c.key] > 0)
    .map((c) => `${counts[c.key]} ${c.label}`) : null;
  const outdated = user.appVersion && user.appVersion !== APP_VERSION;
  const copyEmail = () => {
    if (!user.email) return;
    navigator.clipboard?.writeText(user.email);
    toast.success('המייל הועתק');
  };
  const section = 'rounded-2xl border border-border-primary bg-bg-tertiary/40 p-4';
  const row = 'flex items-center justify-between gap-3 py-2.5 border-t border-border-primary/70 first:border-t-0 text-sm';

  return (
    <Modal isOpen={!!user} onClose={onClose} title="פרטי משתמש" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Who + the two actions that matter */}
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={user} size="w-16 h-16 text-xl" />
          <div className="flex-1 basis-56 min-w-0 flex flex-col gap-1.5">
            <div className="text-xl font-bold text-text-primary truncate">{user.displayName || user.email || '—'}</div>
            {user.email && (
              <button type="button" onClick={copyEmail} title="העתקת מייל"
                className="self-start inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary cursor-pointer max-w-full">
                <span className="truncate" dir="ltr">{user.email}</span>
                <Copy className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
            <div className="flex flex-wrap gap-1.5">
              {premium
                ? <Pill className="text-violet-300 bg-violet-500/15">{plan}</Pill>
                : <Pill className={status.cls}>{status.label}</Pill>}
              <Pill className={user.onboardingCompleted ? 'text-profit bg-profit/12' : 'text-text-secondary bg-bg-tertiary'}>
                {user.onboardingCompleted ? 'השלים הגדרה ראשונית' : 'לא השלים הגדרה ראשונית'}
              </Pill>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button type="button" onClick={() => { setNotifyOpen((v) => !v); setGrantOpen(false); }} className={`${primaryBtn} h-11 flex-1 sm:flex-none`}>
              <Send className="w-4 h-4" /> שליחת תזכורת
            </button>
            {user.role !== 'admin' && (premium ? (
              <button type="button" onClick={revoke} disabled={granting} className={`${softBtn} h-11 flex-1 sm:flex-none`}>
                <X className="w-4 h-4" /> ביטול Premium
              </button>
            ) : (
              <button type="button" onClick={() => { setGrantOpen((v) => !v); setNotifyOpen(false); }} disabled={granting} className={`${softBtn} h-11 flex-1 sm:flex-none`}>
                <Crown className="w-4 h-4" /> הענקת Premium
              </button>
            ))}
          </div>
        </div>

        {/* Grant Premium duration picker */}
        {grantOpen && (
          <div className={`${section} space-y-3`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text-primary">הענקת Premium</span>
              <button onClick={() => setGrantOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer" aria-label="סגירה">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {/* Optional amount paid — feeds revenue / MRR analytics. */}
              <div>
                <label className="text-xs text-text-secondary block mb-1">סכום ששולם (₪) — לא חובה</label>
                <input
                  type="number"
                  min="0"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="לדוגמה 29"
                  className="w-full h-10 bg-bg-tertiary border border-border-primary rounded-lg px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
                />
              </div>
              {/* Payment method — feeds the confirmation email */}
              <div>
                <label className="text-xs text-text-secondary block mb-1">אמצעי תשלום</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'bit', label: 'ביט' },
                    { id: 'crypto', label: 'קריפטו' },
                    { id: 'transfer', label: 'העברה' },
                    { id: 'cash', label: 'מזומן' },
                    { id: 'other', label: 'אחר' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayMethod(m.id)}
                      className={`h-8 text-xs px-3 rounded-full border transition-colors cursor-pointer ${
                        payMethod === m.id
                          ? 'bg-accent-primary/15 border-accent-primary/50 text-sky-200 font-semibold'
                          : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Confirmation email toggle */}
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendReceipt}
                onChange={(e) => setSendReceipt(e.target.checked)}
                disabled={!user.email}
                className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
              />
              שליחת מייל אישור {user.email ? `ל-${user.email}` : '(אין מייל בפרופיל)'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
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
                  type="button"
                  onClick={() => grant(opt.d)}
                  disabled={granting}
                  className={`${softBtn} px-2`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reminder composer — push and/or email to this user. */}
        {notifyOpen && (
          <div className={`${section} space-y-3`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text-primary">תזכורת ל{(user.displayName || '').split(' ')[0] || 'משתמש'}</span>
              <button onClick={() => setNotifyOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer" aria-label="סגירה">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ReengageComposer
              recipients={[{ id: user.id, email: user.email || '', name: user.displayName || '', marketing: user.marketingEmails === true }]}
              onSent={() => setNotifyOpen(false)}
            />
          </div>
        )}

        {/* The four numbers worth a glance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'עסקאות', value: count('trades'), mono: true },
            { label: 'יומני מסחר', value: count('journals'), mono: true },
            { label: 'הצטרף', value: formatDate(user.createdAt), mono: true },
            { label: 'כניסה אחרונה', value: relativeActive(user.lastActive) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-bg-tertiary border border-border-primary px-3.5 py-3 flex flex-col gap-1 min-w-0">
              <span className="text-xs text-text-secondary">{s.label}</span>
              <b className={`text-lg leading-snug text-text-primary ${s.mono ? 'num-mono' : ''}`}>{s.value}</b>
            </div>
          ))}
        </div>
        {countsError && <div className="text-xs text-loss">{countsError}</div>}

        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {/* Account: connections, version, AI today, other usage */}
          <section className={section}>
            <h3 className="text-sm font-bold text-text-primary mb-1">חשבון</h3>
            <div className={row}>
              <span className="text-text-secondary">בורסות</span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {connections === null ? '…'
                  : !connections.exchanges ? '—'
                    : connections.exchanges.length === 0 ? <span className="text-text-secondary">לא חובר</span>
                      : connections.exchanges.map((ex) => (
                        <Pill key={ex} className="text-profit bg-profit/12"><span dir="ltr">{EXCHANGE_NAMES[ex] || ex}</span></Pill>
                      ))}
              </span>
            </div>
            <div className={row}>
              <span className="text-text-secondary">התראות לטלפון</span>
              <span className="font-semibold text-text-primary">
                {connections === null ? '…'
                  : connections.devices == null ? '—'
                    : connections.devices > 0 ? (connections.devices === 1 ? 'מכשיר אחד' : `${connections.devices} מכשירים`) : 'לא מאושרות'}
              </span>
            </div>
            <div className={row}>
              <span className="text-text-secondary">גרסת אפליקציה</span>
              {user.appVersion ? (
                <span className={`font-semibold ${outdated ? 'text-amber-400' : 'text-text-primary'}`}>
                  <span className="num-mono">{user.appVersion}</span>{outdated ? ' · ישנה' : ''}
                </span>
              ) : <span className="text-text-secondary">לא ידוע</span>}
            </div>
            <div className={`${row} flex-col items-stretch`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">AI היום</span>
                <span className="font-semibold text-text-primary num-mono" dir="ltr">
                  {aiUsage ? `${aiUsage.used} / ${aiUsage.limit}` : '…'}
                </span>
              </div>
              {aiUsage && <Meter pct={(aiUsage.used / aiUsage.limit) * 100} className="mt-2" />}
              {aiUsage && typeof aiUsage.imageLimit === 'number' && aiUsage.imageLimit > 0 && (
                <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
                  <span>ניתוחי תמונה</span><span className="num-mono" dir="ltr">{aiUsage.imageUsed} / {aiUsage.imageLimit}</span>
                </div>
              )}
            </div>
            <div className={`${row} items-start`}>
              <span className="text-text-secondary shrink-0">עוד בשימוש</span>
              <span className="text-text-primary text-left">
                {extraUsage === null ? '…' : extraUsage.length ? extraUsage.join(' · ') : 'אין'}
              </span>
            </div>
          </section>

          {/* Private note + what happened with this customer */}
          <div className="space-y-4">
            <section className={section}>
              <h3 className="text-sm font-bold text-text-primary mb-2">הערה פנימית</h3>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={noteLoading ? 'טוען…' : 'רק אדמינים רואים את זה'}
                disabled={noteLoading}
                maxLength={2000}
                rows={3}
                className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary resize-none disabled:opacity-50"
              />
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={saveNote} disabled={noteLoading || noteSaving} className={softBtn}>
                  {noteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {noteSaving ? 'שומר…' : 'שמירה'}
                </button>
              </div>
            </section>
            <section className={section}>
              <CustomerTimeline user={user} />
            </section>
          </div>
        </div>

        {/* Danger zone — permanent deletion runs through the worker's service
            account (admins are read-only on other users' data client-side, and
            only the service account can delete somebody else's Auth user). */}
        {user.role !== 'admin' && (
          <div className="pt-4 border-t border-border-primary flex flex-col items-center gap-3">
            {confirmDelete ? (
              <>
                <p className="text-sm text-loss text-center max-w-md leading-relaxed">
                  כל הנתונים, רשומת הלידרבורד וחשבון ההתחברות של{' '}
                  <span className="font-bold">{user.email || user.displayName || user.id}</span> יימחקו. אי אפשר לבטל.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={doDelete} disabled={deleting}
                    className="h-10 px-5 inline-flex items-center gap-1.5 rounded-xl bg-loss text-white text-sm font-bold hover:bg-loss/85 transition-colors cursor-pointer disabled:opacity-50">
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {deleting ? 'מוחק…' : 'מחיקה סופית'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className={softBtn}>ביטול</button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl text-[13px] font-semibold text-loss/90 hover:text-loss hover:bg-loss/10 transition-colors cursor-pointer">
                <Trash2 className="w-4 h-4" /> מחיקת משתמש
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Audit log modal ──────────────────────────────────────────────────────────
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
  if (days < 14) return 'לפני שבוע';
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}

function CustomerTimeline({ user }) {
  const [events, setEvents] = useState(null);
  const [showAll, setShowAll] = useState(false);

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

  const shown = events && !showAll ? events.slice(0, 5) : events;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold text-text-primary">היסטוריה</h3>
        {events && events.length > 5 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">
            {showAll ? 'פחות' : `הכל (${events.length})`}
          </button>
        )}
      </div>
      {events === null ? (
        <div className="text-xs text-text-secondary py-3">טוען…</div>
      ) : events.length === 0 ? (
        <div className="text-xs text-text-secondary py-3">אין אירועים עדיין</div>
      ) : (
        <div>
          {shown.map((ev, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-t border-border-primary/70 first:border-t-0" title={fmtFullDate(ev.ts)}>
              <span className={`w-7 h-7 rounded-lg border grid place-items-center shrink-0 ${ev.color}`}>{ev.iconNode}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{ev.title}</div>
                {ev.sub && <div className="text-xs text-text-secondary truncate">{ev.sub}</div>}
              </div>
              <span className="text-xs text-text-secondary whitespace-nowrap">{fmtRelativeTime(ev.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
