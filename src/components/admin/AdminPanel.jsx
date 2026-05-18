import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, ShieldCheck, CheckCircle2, Search, RefreshCw, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/firestoreService';
import LoadingSpinner from '../shared/LoadingSpinner';

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
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
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
            className="w-full bg-bg-secondary border border-border-primary rounded-lg py-2.5 pr-10 pl-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-primary"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-bg-secondary border border-border-primary rounded-lg py-2.5 px-3 text-sm text-text-primary focus:outline-none focus:border-accent-primary cursor-pointer"
        >
          <option value="all">כל התפקידים</option>
          <option value="admin">אדמינים בלבד</option>
          <option value="user">משתמשים בלבד</option>
        </select>
        <select
          value={onboardFilter}
          onChange={(e) => setOnboardFilter(e.target.value)}
          className="bg-bg-secondary border border-border-primary rounded-lg py-2.5 px-3 text-sm text-text-primary focus:outline-none focus:border-accent-primary cursor-pointer"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="yes">סיימו אונבורדינג</option>
          <option value="no">לא סיימו אונבורדינג</option>
        </select>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
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
                      <tr key={u.id} className="border-b border-border-primary/50 last:border-0">
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
    </div>
  );
}
