import { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, ShieldCheck, CheckCircle2, Search, RefreshCw, Download, ChevronUp, ChevronDown, Mail, Calendar, Coins, TrendingUp, Percent, Sparkles, Star, BookOpen, FlaskConical, Activity, FileText, Brain, Crown, Send, X, Ticket, Plus, Minus, Trash2, Copy, ScrollText, Share2, Link2, BarChart3, AlertTriangle, Clock, StickyNote, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers, getUserSubcollectionCount, adminGrantPremium, adminRevokePremium, getAdminNote, setAdminNote } from '../../services/firestoreService';
import { fetchUserAiUsage } from '../../hooks/useAiUsage';
import { adminSendNotification, adminScheduleExpiryReminders, adminCancelExpiryReminders, adminListAuditEvents } from '../../services/pushService';
import { adminListCoupons, adminCreateCoupon, adminDeleteCoupon, couponShareUrl } from '../../services/couponService';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';
import Modal from '../shared/Modal';

// Compute effective premium status from a user doc (admins are always premium;
// otherwise plan='premium' and planExpires (if set) must be in the future).
function isUserPremium(u) {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.plan !== 'premium') return false;
  if (!u.planExpires) return true; // lifetime
  return new Date(u.planExpires).getTime() > Date.now();
}

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function formatDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

const DAY_MS = 24 * 60 * 60 * 1000;
function lastActiveMs(u) {
  return toDate(u?.lastActive)?.getTime() || 0;
}
function daysSinceActive(u) {
  const t = lastActiveMs(u);
  return t ? Math.floor((Date.now() - t) / DAY_MS) : Infinity;
}
// Hebrew relative "last seen" label.
function relativeActive(v) {
  const d = toDate(v);
  if (!d) return 'מעולם לא';
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return 'עכשיו';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} ד'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע'`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}
// Active = opened the app within the last `days` days.
function activeWithin(u, days) {
  return daysSinceActive(u) <= days;
}

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 flex items-center gap-4">
      <div className="bg-accent-primary/10 text-accent-primary rounded-lg p-3">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        <div className="text-sm text-text-secondary">{label}</div>
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

function csvCell(v) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminPanel() {
  const { isAdmin, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [onboardFilter, setOnboardFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedUser, setSelectedUser] = useState(null);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkGrantOpen, setBulkGrantOpen] = useState(false);
  const [bulkNotifyOpen, setBulkNotifyOpen] = useState(false);
  const [bulkNotifyTitle, setBulkNotifyTitle] = useState('');
  const [bulkNotifyBody, setBulkNotifyBody] = useState('');

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
    getAllUsers()
      .then((data) => { setUsers(data); setLoadedAt(Date.now()); })
      .catch((e) => setError(e?.code === 'permission-denied'
        ? 'אין הרשאת אדמין — ודא שהשדה role מוגדר ל-admin במסמך המשתמש שלך.'
        : 'טעינת המשתמשים נכשלה. נסה שוב.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) Promise.resolve().then(load);
  }, [isAdmin]);

  const stats = useMemo(() => {
    const weekAgo = loadedAt - 7 * 24 * 60 * 60 * 1000;
    let newThisWeek = 0;
    let onboarded = 0;
    let admins = 0;
    let premium = 0;
    for (const u of users) {
      const created = toDate(u.createdAt);
      if (created && created.getTime() >= weekAgo) newThisWeek++;
      if (u.onboardingCompleted) onboarded++;
      if (u.role === 'admin') admins++;
      if (isUserPremium(u) && u.role !== 'admin') premium++;
    }
    return { total: users.length, newThisWeek, onboarded, admins, premium };
  }, [users, loadedAt]);

  // Premium customers who haven't opened the app in 7+ days — the "churn risk"
  // list. Sorted by how long they've been gone (longest first).
  const churned = useMemo(() => {
    return users
      .filter((u) => u.role !== 'admin' && isUserPremium(u) && lastActiveMs(u) > 0 && daysSinceActive(u) >= 7)
      .sort((a, b) => daysSinceActive(b) - daysSinceActive(a));
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
    };
  }, [users]);

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
  }, [users, search, roleFilter, onboardFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'createdAt' || key === 'lastActive' ? 'desc' : 'asc');
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const visibleIds = filtered.map((u) => u.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  };

  // Run an async action over every selected user with a small concurrency
  // cap so we don't pile a hundred parallel network requests at once. The
  // progress ref is read by the UI to render 'sending… (3/12)'.
  const bulkSentCountRef = useRef(0);
  const runBulk = async (fn) => {
    setBulkBusy(true);
    bulkSentCountRef.current = 0;
    const ids = Array.from(selectedIds);
    const CONCURRENCY = 4;
    let i = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (i < ids.length) {
        const idx = i++;
        try { await fn(ids[idx]); } catch { /* per-user error already logged */ }
        bulkSentCountRef.current += 1;
      }
    });
    await Promise.all(workers);
    setBulkBusy(false);
  };

  const bulkGrantPremium = async (days) => {
    const lifetime = !Number.isFinite(days);
    const expiresAt = lifetime ? null : new Date(Date.now() + days * 86400000);
    const planExpiresISO = expiresAt ? expiresAt.toISOString() : null;
    await runBulk(async (uid) => {
      await adminGrantPremium(uid, days);
      adminScheduleExpiryReminders(uid, planExpiresISO);
      const body = lifetime
        ? '🎉 קיבלת Premium ללא הגבלה. כל הפיצ\'רים פתוחים — בהצלחה במסחר!'
        : `🎉 קיבלת Premium ל-${days} ימים. כל הפיצ\'רים פתוחים — בהצלחה במסחר!`;
      adminSendNotification({ uid, title: '🎁 שודרגת ל-TradeOS Premium', body, url: '/premium' }).catch(() => {});
    });
    toast.success(`${selectedIds.size} משתמשים שודרגו ל-Premium`);
    setBulkGrantOpen(false);
    setSelectedIds(new Set());
    load();
  };

  const bulkSendNotify = async () => {
    const title = bulkNotifyTitle.trim();
    const body = bulkNotifyBody.trim();
    if (!title || !body) return;
    let totalSent = 0;
    await runBulk(async (uid) => {
      const r = await adminSendNotification({ uid, title, body });
      if (r?.sent) totalSent += r.sent;
    });
    toast.success(`ההודעה נשלחה ל-${totalSent} מכשירים (${selectedIds.size} משתמשים)`);
    setBulkNotifyOpen(false);
    setBulkNotifyTitle(''); setBulkNotifyBody('');
    setSelectedIds(new Set());
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
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold text-text-primary">פאנל ניהול</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-primary/10 border border-accent-primary/30 text-accent-primary hover:bg-accent-primary/20 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
            אנליטיקס
          </button>
          <button
            onClick={() => setAuditOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <ScrollText className="w-4 h-4" />
            יומן פעולות
          </button>
          <button
            onClick={() => setCouponsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
          >
            <Ticket className="w-4 h-4" />
            קופונים
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={<Users className="w-6 h-6" />} label="סה״כ משתמשים" value={stats.total} />
        <StatCard icon={<UserPlus className="w-6 h-6" />} label="חדשים השבוע" value={stats.newThisWeek} />
        <StatCard icon={<CheckCircle2 className="w-6 h-6" />} label="סיימו אונבורדינג" value={stats.onboarded} />
        <StatCard icon={<Crown className="w-6 h-6 text-amber-400" />} label="לקוחות Premium" value={stats.premium} />
        <StatCard icon={<ShieldCheck className="w-6 h-6" />} label="אדמינים" value={stats.admins} />
      </div>

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
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className="flex items-center gap-3 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-right hover:border-loss/40 transition-colors cursor-pointer"
              >
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary text-sm font-semibold">
                    {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{u.displayName || u.email}</div>
                  <div className="text-[11px] text-loss">לא נכנס {daysSinceActive(u)} ימים</div>
                </div>
                <Send className="w-4 h-4 text-text-muted shrink-0" />
              </button>
            ))}
          </div>
          {churned.length > 6 && (
            <div className="text-[11px] text-text-muted mt-2">ועוד {churned.length - 6}… (מיין לפי "פעילות אחרונה" בטבלה)</div>
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
        <div className="md:w-48">
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
        <div className="md:w-56">
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-text-secondary">
              מציג {filtered.length} מתוך {users.length} משתמשים
            </div>
            <div className="flex items-center gap-2 text-xs">
              {!selectMode ? (
                <button
                  onClick={() => setSelectMode(true)}
                  className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary cursor-pointer inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> בחירה מרובה
                </button>
              ) : (
                <>
                  <span className="text-text-secondary">{selectedIds.size} נבחרו</span>
                  {selectedIds.size > 0 && (
                    <>
                      <button
                        onClick={() => setBulkGrantOpen(true)}
                        disabled={bulkBusy}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Crown className="w-3.5 h-3.5" /> הענק Premium לכולם
                      </button>
                      <button
                        onClick={() => setBulkNotifyOpen(true)}
                        disabled={bulkBusy}
                        className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/30 text-accent-primary hover:bg-accent-primary/20 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" /> שלח Push לכולם
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="px-3 py-1.5 rounded-lg text-text-muted hover:text-text-primary cursor-pointer inline-flex items-center gap-1"
                    title="סיום בחירה"
                  >
                    <X className="w-3.5 h-3.5" /> סיום
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bulk grant: pick a duration and apply to all selected. */}
          {bulkGrantOpen && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">הענק Premium ל-{selectedIds.size} משתמשים</span>
                <button onClick={() => setBulkGrantOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {[
                  { d: 1, label: 'יום' },
                  { d: 7, label: 'שבוע' },
                  { d: 30, label: 'חודש' },
                  { d: 90, label: '3 חודשים' },
                  { d: 180, label: '6 חודשים' },
                  { d: 365, label: 'שנה' },
                  { d: Infinity, label: 'ללא הגבלה' },
                ].map((opt) => (
                  <button
                    key={String(opt.d)}
                    onClick={() => bulkGrantPremium(opt.d)}
                    disabled={bulkBusy}
                    className="text-xs px-2 py-2 rounded-lg bg-bg-secondary border border-border-primary text-text-primary hover:border-amber-500/40 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bulk notify: shared title+body to all selected. */}
          {bulkNotifyOpen && (
            <div className="bg-accent-primary/5 border border-accent-primary/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Push ל-{selectedIds.size} משתמשים</span>
                <button onClick={() => setBulkNotifyOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                value={bulkNotifyTitle}
                onChange={(e) => setBulkNotifyTitle(e.target.value)}
                placeholder="כותרת"
                maxLength={120}
                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
              />
              <textarea
                value={bulkNotifyBody}
                onChange={(e) => setBulkNotifyBody(e.target.value)}
                placeholder="גוף ההודעה"
                maxLength={400}
                rows={3}
                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
              />
              <button
                onClick={bulkSendNotify}
                disabled={bulkBusy || !bulkNotifyTitle.trim() || !bulkNotifyBody.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-bold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {bulkBusy ? `שולח... (${bulkSentCountRef.current}/${selectedIds.size})` : 'שלח עכשיו'}
              </button>
            </div>
          )}

          <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-secondary border-b border-border-primary text-right">
                    {selectMode && (
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          onChange={toggleSelectAll}
                          checked={filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id))}
                          ref={(el) => {
                            if (!el) return;
                            const some = filtered.some((u) => selectedIds.has(u.id));
                            const all = filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));
                            el.indeterminate = some && !all;
                          }}
                          className="w-4 h-4 cursor-pointer accent-accent-primary"
                          aria-label="בחר הכל"
                        />
                      </th>
                    )}
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
                      <td colSpan={selectMode ? 7 : 6} className="px-4 py-10 text-center text-text-secondary">
                        לא נמצאו משתמשים
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => (selectMode ? toggleSelected(u.id) : setSelectedUser(u))}
                        className={`border-b border-border-primary/50 last:border-0 cursor-pointer hover:bg-bg-tertiary/40 transition-colors ${selectMode && selectedIds.has(u.id) ? 'bg-accent-primary/5' : ''}`}
                      >
                        {selectMode && (
                          <td className="px-3 py-3" onClick={(e) => { e.stopPropagation(); toggleSelected(u.id); }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(u.id)}
                              onChange={() => {}}
                              className="w-4 h-4 cursor-pointer accent-accent-primary"
                              aria-label="בחר משתמש"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary font-semibold">
                                {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-text-primary font-medium">{u.displayName || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{u.email || '—'}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const churn = u.role !== 'admin' && isUserPremium(u) && daysSinceActive(u) >= 7;
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
      <CouponsModal isOpen={couponsOpen} onClose={() => setCouponsOpen(false)} />
      <AuditLogModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} users={users} />
      <AnalyticsModal isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} a={analytics} onPickUser={(u) => { setAnalyticsOpen(false); setSelectedUser(u); }} />
    </div>
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
  const { user: adminUser } = useAuth();
  const [counts, setCounts] = useState(null);
  const [countsError, setCountsError] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [granting, setGranting] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [note, setNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Load the admin-only private note for this user (separate collection so the
  // user themselves can never see it).
  useEffect(() => {
    if (!user) { setNote(''); setNoteLoaded(''); return; }
    let cancelled = false;
    getAdminNote(user.id)
      .then((t) => { if (!cancelled) { setNote(t); setNoteLoaded(t); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const saveNote = async () => {
    if (!user) return;
    setNoteSaving(true);
    try {
      await setAdminNote(user.id, note.trim(), adminUser?.uid);
      setNoteLoaded(note.trim());
      toast.success('ההערה נשמרה');
    } catch {
      toast.error('שמירת ההערה נכשלה');
    } finally {
      setNoteSaving(false);
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
      await adminGrantPremium(user.id, days);
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

      setGrantOpen(false);
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
  const fav = Array.isArray(settings.favoriteCoins) ? settings.favoriteCoins : [];
  const strategies = Array.isArray(settings.strategies) ? settings.strategies : [];

  return (
    <Modal isOpen={!!user} onClose={onClose} title="פרטי משתמש" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary font-bold text-lg">
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
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-text-primary">בחר משך Premium</span>
              <button onClick={() => setGrantOpen(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {[
                { d: 1, label: 'יום' },
                { d: 7, label: 'שבוע' },
                { d: 30, label: 'חודש' },
                { d: 90, label: '3 חודשים' },
                { d: 180, label: '6 חודשים' },
                { d: 365, label: 'שנה' },
                { d: Infinity, label: 'ללא הגבלה' },
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

        {/* Private admin note — only admins can see this (separate collection). */}
        <div>
          <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5 text-amber-400" /> הערה פרטית (רק אתה רואה)
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='לדוגמה: "שילם בביט", "מבקש החזר", "חבר של דני"…'
            rows={3}
            maxLength={1000}
            className="w-full bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-amber-500/50 resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-text-muted">{note.trim() !== noteLoaded.trim() ? 'יש שינויים שלא נשמרו' : 'נשמר'}</span>
            <button
              onClick={saveNote}
              disabled={noteSaving || note.trim() === noteLoaded.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> {noteSaving ? 'שומר…' : 'שמור הערה'}
            </button>
          </div>
        </div>

        {/* General */}
        <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-4 py-2 divide-y divide-border-primary/40">
          <DetailRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={user.email} />
          <DetailRow icon={<Calendar className="w-4 h-4" />} label="הצטרף" value={formatDate(user.createdAt)} />
          <DetailRow icon={<Clock className="w-4 h-4" />} label="פעילות אחרונה" value={relativeActive(user.lastActive)} />
          <DetailRow icon={<Coins className="w-4 h-4" />} label="מטבע בסיס" value={settings.baseCurrency} />
          <DetailRow icon={<TrendingUp className="w-4 h-4" />} label="מינוף ברירת מחדל" value={settings.defaultLeverage ? `${settings.defaultLeverage}x` : null} />
          <DetailRow icon={<Percent className="w-4 h-4" />} label="סיכון ברירת מחדל" value={settings.defaultRiskPercent != null ? `${settings.defaultRiskPercent}%` : null} />
        </div>

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
                  <Icon className="w-4 h-4 text-text-muted" />
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

        {/* AI daily usage */}
        <div>
          <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> שימוש ב-AI היום
          </div>
          {aiUsage ? (() => {
            const pct = Math.min(100, (aiUsage.used / aiUsage.limit) * 100);
            const low = (aiUsage.limit - aiUsage.used) <= 3;
            return (
              <div className="bg-bg-tertiary/40 border border-border-primary rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-text-secondary">בקשות שנוצלו</span>
                  <span className={`font-semibold ${low ? 'text-loss' : 'text-text-primary'}`}>{aiUsage.used} / {aiUsage.limit}</span>
                </div>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${low ? 'bg-loss' : 'bg-accent-primary'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })() : (
            <div className="text-xs text-text-muted">…</div>
          )}
        </div>

        {/* Favorites */}
        {fav.length > 0 && (
          <div>
            <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> מטבעות מועדפים
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fav.map((c) => (
                <span key={c} className="text-xs px-2 py-1 rounded-md bg-bg-tertiary border border-border-primary text-text-primary">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Strategies */}
        {strategies.length > 0 && (
          <div>
            <div className="text-[11px] text-text-muted mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> אסטרטגיות
            </div>
            <div className="flex flex-wrap gap-1.5">
              {strategies.map((s) => (
                <span key={s} className="text-xs px-2 py-1 rounded-md bg-bg-tertiary border border-border-primary text-text-primary">{s}</span>
              ))}
            </div>
          </div>
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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="אנליטיקס לקוחות" maxWidth="max-w-2xl">
      <div className="space-y-5">
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
                    <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-text-secondary text-xs font-semibold">
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
                      {ev.actor && <span>בוצע ע"י <span className="text-text-primary">{userLabel(ev.actor)}</span></span>}
                      {ev.target && <span> · יעד <span className="text-text-primary">{userLabel(ev.target)}</span></span>}
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
function CouponsModal({ isOpen, onClose }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

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

  const del = async (codeToDelete) => {
    if (!window.confirm(`למחוק את הקוד ${codeToDelete}?`)) return;
    try {
      await adminDeleteCoupon(codeToDelete);
      toast.success('הקוד נמחק');
      load();
    } catch (e) {
      toast.error(e.message || 'המחיקה נכשלה');
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
    <Modal isOpen={isOpen} onClose={onClose} title="קופוני Premium" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Create */}
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-text-primary">צור קוד חדש</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="קוד (לדוגמה TRADEOS7)"
                className="flex-1 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500 font-mono uppercase"
                dir="ltr"
                maxLength={32}
              />
              <button onClick={randomCode} className="px-3 rounded-lg border border-border-primary text-xs text-text-secondary hover:text-text-primary cursor-pointer">
                אקראי
              </button>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">ימי Premium</label>
              <NumberStepper value={String(days)} onChange={setDays} min={1} max={3650} />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">מקסימום שימושים (ריק = ללא הגבלה)</label>
              <NumberStepper value={maxUses} onChange={setMaxUses} min={1} placeholder="∞" />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-text-muted">תיוג פנימי (לא חובה)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='לדוגמה: "קמפיין אינסטגרם נובמבר"'
                maxLength={80}
                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber-500"
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
              {coupons.map((c) => (
                <div key={c.code} className="bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => copy(c.code)} className="font-mono text-sm font-bold text-amber-400 hover:text-amber-300 cursor-pointer flex items-center gap-1" dir="ltr">
                        {c.code} <Copy className="w-3 h-3" />
                      </button>
                      <span className="text-[11px] text-text-muted">· {c.days} ימים</span>
                      {c.maxUses && (
                        <span className="text-[11px] text-text-muted">· {c.used}/{c.maxUses}</span>
                      )}
                      {!c.maxUses && (
                        <span className="text-[11px] text-text-muted">· נוצל {c.used} פעמים</span>
                      )}
                    </div>
                    {c.label && <div className="text-[10px] text-text-muted truncate">{c.label}</div>}
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
                  <button onClick={() => del(c.code)} className="p-1.5 rounded-lg text-text-muted hover:text-loss cursor-pointer" title="מחק">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
