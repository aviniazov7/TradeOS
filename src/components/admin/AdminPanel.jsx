import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, ShieldCheck, CheckCircle2, Search, RefreshCw, Download, ChevronUp, ChevronDown, Mail, Calendar, Coins, TrendingUp, Percent, Sparkles, Star, BookOpen, FlaskConical, Activity, FileText, Brain } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers, getUserSubcollectionCount } from '../../services/firestoreService';
import { fetchUserAiUsage } from '../../hooks/useAiUsage';
import LoadingSpinner from '../shared/LoadingSpinner';
import SelectDropdown from '../shared/SelectDropdown';
import Modal from '../shared/Modal';

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
  { key: 'onboardingCompleted', label: 'אונבורדינג' },
  { key: 'role', label: 'תפקיד' },
];

function sortValue(u, key) {
  if (key === 'createdAt') return toDate(u.createdAt)?.getTime() || 0;
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
    for (const u of users) {
      const created = toDate(u.createdAt);
      if (created && created.getTime() >= weekAgo) newThisWeek++;
      if (u.onboardingCompleted) onboarded++;
      if (u.role === 'admin') admins++;
    }
    return { total: users.length, newThisWeek, onboarded, admins };
  }, [users, loadedAt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      if (q && !(u.displayName || '').toLowerCase().includes(q) &&
          !(u.email || '').toLowerCase().includes(q)) return false;
      if (roleFilter === 'admin' && u.role !== 'admin') return false;
      if (roleFilter === 'user' && u.role === 'admin') return false;
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
      setSortDir(key === 'createdAt' ? 'desc' : 'asc');
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
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-text-primary">פאנל ניהול</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-6 h-6" />} label="סה״כ משתמשים" value={stats.total} />
        <StatCard icon={<UserPlus className="w-6 h-6" />} label="חדשים השבוע" value={stats.newThisWeek} />
        <StatCard icon={<CheckCircle2 className="w-6 h-6" />} label="סיימו אונבורדינג" value={stats.onboarded} />
        <StatCard icon={<ShieldCheck className="w-6 h-6" />} label="אדמינים" value={stats.admins} />
      </div>

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
          <div className="text-sm text-text-secondary">
            מציג {filtered.length} מתוך {users.length} משתמשים
          </div>
          <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
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
                      <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
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
                          {u.onboardingCompleted ? (
                            <span className="text-profit">הושלם</span>
                          ) : (
                            <span className="text-text-secondary">לא הושלם</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 text-accent-primary font-medium">
                              <ShieldCheck className="w-4 h-4" /> אדמין
                            </span>
                          ) : (
                            <span className="text-text-secondary">משתמש</span>
                          )}
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

      <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
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

function UserDetailModal({ user, onClose }) {
  const [counts, setCounts] = useState(null);
  const [countsError, setCountsError] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);

  useEffect(() => {
    if (!user) { setAiUsage(null); return; }
    let cancelled = false;
    fetchUserAiUsage(user.id).then((u) => { if (!cancelled) setAiUsage(u); });
    return () => { cancelled = true; };
  }, [user]);

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
            <div className="mt-1 flex items-center gap-2">
              {user.role === 'admin' ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30">
                  <ShieldCheck className="w-3 h-3" /> אדמין
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary border border-border-primary">משתמש</span>
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

        {/* General */}
        <div className="bg-bg-tertiary/40 border border-border-primary rounded-xl px-4 py-2 divide-y divide-border-primary/40">
          <DetailRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={user.email} />
          <DetailRow icon={<Calendar className="w-4 h-4" />} label="הצטרף" value={formatDate(user.createdAt)} />
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
