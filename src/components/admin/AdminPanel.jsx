import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, ShieldCheck, CheckCircle2, Search, RefreshCw } from 'lucide-react';
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

export default function AdminPanel() {
  const { isAdmin, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

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
    const list = q
      ? users.filter((u) =>
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q))
      : users;
    return [...list].sort((a, b) => {
      const da = toDate(a.createdAt)?.getTime() || 0;
      const db = toDate(b.createdAt)?.getTime() || 0;
      return db - da;
    });
  }, [users, search]);

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

      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או אימייל…"
          className="w-full bg-bg-secondary border border-border-primary rounded-lg py-2.5 pr-10 pl-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-primary"
        />
      </div>

      {error && (
        <div className="bg-loss/10 border border-loss/30 text-loss rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : (
        <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary border-b border-border-primary text-right">
                  <th className="font-medium px-4 py-3">משתמש</th>
                  <th className="font-medium px-4 py-3">אימייל</th>
                  <th className="font-medium px-4 py-3">הצטרף</th>
                  <th className="font-medium px-4 py-3">אונבורדינג</th>
                  <th className="font-medium px-4 py-3">תפקיד</th>
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
      )}
    </div>
  );
}
