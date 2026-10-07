import { useState, useEffect, useMemo } from 'react';
import { Search, Download, Send, Crown, Copy, Trash2, ChevronUp, ChevronDown, PanelLeftOpen, MousePointerClick, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../shared/Card';
import ConfirmDialog from '../shared/ConfirmDialog';
import { getUserSubcollectionCount } from '../../services/firestoreService';
import { adminGetPushStatus, adminGetExchangesStatus, adminDeleteUser } from '../../services/pushService';
import { Pill, Avatar, softBtn, primaryBtn } from './AdminUi';
import {
  DAY_MS, isUserPremium, isAtRisk, activeWithin, lastActiveMs, createdMs, relativeActive,
  formatDate, shortDate, userStatus, displayName, csvCell, EXCHANGE_NAMES,
} from './adminUtils';

const FILTERS = [
  { id: 'all', label: 'הכל', test: () => true },
  { id: 'premium', label: 'Premium', test: (u) => u.role !== 'admin' && isUserPremium(u) },
  { id: 'active', label: 'פעילים', test: (u) => activeWithin(u, 7) },
  { id: 'risk', label: 'בסיכון', test: isAtRisk },
  { id: 'new', label: 'חדשים', test: (u) => Date.now() - createdMs(u) <= 30 * DAY_MS },
];

const COLUMNS = [
  { key: 'name', label: 'משתמש' },
  { key: 'status', label: 'סטטוס' },
  { key: 'createdAt', label: 'הצטרף', wide: true },
  { key: 'lastActive', label: 'כניסה אחרונה' },
];

const sortValue = (u, key) => {
  if (key === 'createdAt') return createdMs(u);
  if (key === 'lastActive') return lastActiveMs(u);
  if (key === 'status') return userStatus(u).label;
  return displayName(u).toLowerCase();
};

const PAGE = 50;

// The user picked in the table: the key facts and every action in one place
// (desktop). Phones open the full details modal instead.
function UserPanel({ user, onOpenDetail, onDeleted }) {
  const [info, setInfo] = useState(null); // { trades, devices, exchanges }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    Promise.all([
      getUserSubcollectionCount(uid, 'trades').catch(() => null),
      adminGetPushStatus(uid).then((r) => r.devices).catch(() => null),
      adminGetExchangesStatus(uid).then((r) => r.exchanges).catch(() => null),
    ]).then(([trades, devices, exchanges]) => {
      if (!cancelled) setInfo({ trades, devices, exchanges });
    });
    return () => { cancelled = true; };
  }, [uid]);

  if (!user) {
    return (
      <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-center text-text-secondary">
        <span className="w-12 h-12 rounded-2xl bg-bg-tertiary grid place-items-center"><MousePointerClick className="w-5 h-5" /></span>
        <div className="text-sm">בחרו משתמש מהרשימה<br />כדי לראות פרטים ופעולות</div>
      </div>
    );
  }

  const status = userStatus(user);
  const premium = user.role !== 'admin' && isUserPremium(user);
  const plan = user.role === 'admin' ? 'אדמין'
    : premium ? (user.planExpires ? `Premium · עד ${shortDate(user.planExpires)}` : 'Premium · ללא הגבלה')
      : 'חינם';
  const loading = info === null;
  const exchanges = info?.exchanges;
  const devices = info?.devices;

  const copyEmail = () => {
    if (!user.email) return;
    navigator.clipboard?.writeText(user.email);
    toast.success('המייל הועתק');
  };

  const doDelete = async () => {
    try {
      await adminDeleteUser(user.id);
      toast.success(`המשתמש ${user.email || user.id} נמחק לצמיתות`);
      onDeleted?.();
    } catch (e) {
      toast.error(e.message || 'מחיקת המשתמש נכשלה');
      throw e;
    }
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-3.5">
        <Avatar user={user} size="w-14 h-14 text-lg" />
        <div className="min-w-0 flex flex-col gap-1">
          <div className="text-lg font-bold text-text-primary truncate">{displayName(user)}</div>
          {user.email && <div className="text-[13px] text-text-secondary truncate" dir="ltr" style={{ textAlign: 'right' }}>{user.email}</div>}
          <Pill className={`self-start ${status.cls}`}>{status.label}</Pill>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'עסקאות', value: loading ? '…' : info.trades ?? '—', mono: true },
          { label: 'הצטרף', value: shortDate(user.createdAt), mono: true },
          { label: 'נכנס', value: relativeActive(user.lastActive).replace('לפני ', '') },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-bg-tertiary px-3 py-2.5 flex flex-col gap-1 min-w-0">
            <span className="text-xs text-text-secondary">{s.label}</span>
            <b className={`text-[15px] leading-snug text-text-primary ${s.mono ? 'num-mono' : ''}`}>{s.value}</b>
          </div>
        ))}
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">בורסות</dt>
          <dd className="font-semibold text-text-primary text-left">
            {loading ? '…' : exchanges == null ? '—' : exchanges.length ? exchanges.map((x) => EXCHANGE_NAMES[x] || x).join(' · ') : 'לא חובר'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">מנוי</dt>
          <dd className="font-semibold text-text-primary">{plan}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">התראות לטלפון</dt>
          <dd className="font-semibold text-text-primary">
            {loading ? '…' : devices == null ? '—' : devices > 0 ? (devices === 1 ? 'מכשיר אחד' : `${devices} מכשירים`) : 'לא מאושרות'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">הגדרה ראשונית</dt>
          <dd className="font-semibold text-text-primary">{user.onboardingCompleted ? 'הושלמה' : 'לא הושלמה'}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => onOpenDetail(user, 'notify')} className={`${primaryBtn} h-11`}>
          <Send className="w-4 h-4" /> שליחת תזכורת
        </button>
        <div className="grid grid-cols-2 gap-2">
          {user.role !== 'admin' && (
            <button type="button" onClick={() => onOpenDetail(user, premium ? null : 'grant')} className={`${softBtn} h-11`}>
              <Crown className="w-4 h-4" /> {premium ? 'ניהול מנוי' : 'הענקת Premium'}
            </button>
          )}
          <button type="button" onClick={copyEmail} disabled={!user.email} className={`${softBtn} h-11 ${user.role === 'admin' ? 'col-span-2' : ''}`}>
            <Copy className="w-4 h-4" /> העתקת מייל
          </button>
        </div>
        <button type="button" onClick={() => onOpenDetail(user)} className={`${softBtn} h-11 w-full`}>
          <PanelLeftOpen className="w-4 h-4" /> כל הפרטים וההיסטוריה
        </button>
      </div>

      {user.role !== 'admin' && (
        <div className="pt-3 border-t border-border-primary flex justify-center">
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl text-[13px] font-semibold text-loss/90 hover:text-loss hover:bg-loss/10 transition-colors cursor-pointer">
            <Trash2 className="w-4 h-4" /> מחיקת משתמש
          </button>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="מחיקת משתמש לצמיתות"
        message={`כל הנתונים, רשומת הלידרבורד וחשבון ההתחברות של ${user.email || displayName(user)} יימחקו. אי אפשר לבטל.`}
        confirmText="מחיקה סופית"
      />
    </div>
  );
}

// The users tab: search, quick filters, a clean table and the side panel.
export default function AdminUsers({ users, loading, selectedId, onSelect, onOpenDetail, onUsersChanged }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, users.filter(f.test).length])), [users]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
    const list = users.filter((u) => test(u) && (!q
      || (u.displayName || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)));
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [users, search, filter, sortKey, sortDir]);


  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'createdAt' || key === 'lastActive' ? 'desc' : 'asc'); }
  };

  const exportCsv = () => {
    const header = ['שם', 'אימייל', 'סטטוס', 'הצטרף', 'כניסה אחרונה', 'הגדרה ראשונית'];
    const lines = rows.map((u) => [
      u.displayName || '', u.email || '', userStatus(u).label, formatDate(u.createdAt),
      lastActiveMs(u) ? formatDate(u.lastActive) : '', u.onboardingCompleted ? 'הושלמה' : 'לא הושלמה',
    ]);
    const csv = [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = users.find((u) => u.id === selectedId) || null;

  return (
    <div className="flex flex-wrap gap-3 items-start">
      <Card className="rounded-2xl p-3 md:p-4 flex-[999_1_560px] min-w-0 flex flex-col gap-3.5">
        <div className="flex gap-2.5 items-center">
          <label className="flex-1 flex items-center gap-2 h-11 px-3.5 rounded-xl bg-bg-tertiary border border-border-primary text-text-secondary focus-within:border-accent-primary transition-colors">
            <Search className="w-4 h-4 shrink-0" />
            <span className="sr-only">חיפוש משתמש</span>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
              placeholder="חיפוש לפי שם או מייל"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-secondary" />
          </label>
          <button type="button" onClick={exportCsv} disabled={!rows.length} aria-label="ייצוא ל-CSV" title="ייצוא ל-CSV"
            className="w-11 h-11 rounded-xl border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary grid place-items-center cursor-pointer disabled:opacity-50">
            <Download className="w-[17px] h-[17px]" />
          </button>
        </div>

        <div role="group" aria-label="סינון" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => { setFilter(f.id); setLimit(PAGE); }} aria-pressed={on}
                className={`h-9 px-3.5 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  on ? 'bg-accent-primary/15 border-accent-primary/50 text-sky-200' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                }`}>
                {f.label}
                <span className="num-mono text-xs opacity-75">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full sm:min-w-[560px] text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-xs text-text-secondary text-right">
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={`font-semibold px-2 sm:px-3 py-2 ${c.wide ? 'hidden sm:table-cell' : ''}`}>
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-text-primary cursor-pointer">
                      {c.label}
                      {sortKey === c.key && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-12 text-center text-text-secondary"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-text-secondary">לא נמצאו משתמשים</td></tr>
              ) : rows.slice(0, limit).map((u) => {
                const st = userStatus(u);
                const on = u.id === selectedId;
                const cell = `px-2 sm:px-3 py-2.5 border-t border-border-primary/60 ${on ? 'bg-accent-primary/10' : 'group-hover:bg-bg-tertiary/60'}`;
                return (
                  <tr key={u.id} onClick={() => onSelect(u)} className="group cursor-pointer">
                    <td className={`${cell} rounded-r-xl`}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(u); }}
                        className="flex items-center gap-2.5 text-right cursor-pointer min-w-0">
                        <Avatar user={u} size="w-[34px] h-[34px] text-xs" />
                        <span className="flex flex-col min-w-0">
                          <span className="font-semibold text-text-primary truncate max-w-[104px] sm:max-w-[220px]">{u.displayName || '—'}</span>
                          <span className="text-xs text-text-secondary truncate max-w-[104px] sm:max-w-[220px]" dir="ltr" style={{ textAlign: 'right' }}>{u.email || ''}</span>
                        </span>
                      </button>
                    </td>
                    <td className={cell}><Pill className={st.cls}>{st.label}</Pill></td>
                    <td className={`${cell} hidden sm:table-cell text-text-secondary num-mono`}>{shortDate(u.createdAt)}</td>
                    <td className={`${cell} rounded-l-xl sm:whitespace-nowrap ${st.key === 'risk' ? 'text-amber-400' : 'text-text-secondary'}`}>
                      {relativeActive(u.lastActive)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-text-secondary">
          <span>מציג {Math.min(limit, rows.length)} מתוך {rows.length}{rows.length !== users.length ? ` (סה״כ ${users.length})` : ''}</span>
          {rows.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="font-semibold text-accent-hover hover:text-accent-primary cursor-pointer">הצגת עוד</button>
          )}
        </div>
      </Card>

      <Card as="aside" aria-label="פרטי משתמש" className="hidden lg:block rounded-2xl p-5 flex-[1_1_300px] min-w-0 lg:sticky lg:top-4">
        <UserPanel key={selected?.id || 'none'} user={selected} onOpenDetail={onOpenDetail} onDeleted={onUsersChanged} />
      </Card>
    </div>
  );
}
