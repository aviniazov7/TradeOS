import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, UserPlus, Crown, Ban, CheckCheck, ChevronDown, Settings2, BellOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Panel, softBtn } from './AdminUi';
import { relativeActive } from './adminUtils';
import {
  listNotificationTypes, normalizeSettings, demoFeed,
} from '../../../functions/adminNotifications.mjs';
import {
  NOTIFICATION_PAGE_SIZE,
  subscribeAdminNotificationSettings,
  saveAdminNotificationSettings,
  fetchAdminNotificationPage,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../../services/adminNotificationService';
import LoadingSpinner from '../shared/LoadingSpinner';

const ICONS = {
  churn_risk: { Icon: AlertTriangle, tile: 'bg-amber-500/12 text-amber-400' },
  inactive_user: { Icon: Clock, tile: 'bg-bg-tertiary text-text-secondary' },
  signup: { Icon: UserPlus, tile: 'bg-accent-primary/14 text-accent-hover' },
  premium_upgrade: { Icon: Crown, tile: 'bg-amber-500/12 text-amber-400' },
  premium_cancel: { Icon: Ban, tile: 'bg-loss/12 text-loss' },
};

const inputCls = 'h-10 w-full rounded-xl border border-border-primary bg-bg-tertiary px-3 text-sm text-text-primary num-mono';

function Toggle({ on, label, description, onClick, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-right cursor-pointer disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        {description && <span className="block text-xs text-text-muted leading-relaxed">{description}</span>}
      </span>
      <span aria-hidden className={`w-10 h-5 rounded-full shrink-0 transition-colors relative ${on ? 'bg-accent-primary' : 'bg-border-primary'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function createdMs(item) {
  const v = item?.createdAt;
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v.seconds) return v.seconds * 1000;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function AdminNotifications({ demo = false, onUnreadChange, settingsInitiallyOpen = false }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const types = useMemo(() => listNotificationTypes(), []);
  const [settings, setSettings] = useState(() => normalizeSettings(null));
  const [settingsOpen, setSettingsOpen] = useState(settingsInitiallyOpen);
  const [saving, setSaving] = useState(false);
  const [draftDays, setDraftDays] = useState(null);
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState([null]);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState(null);
  const [demoItems, setDemoItems] = useState(() => demoFeed());

  useEffect(() => {
    if (demo) return undefined;
    return subscribeAdminNotificationSettings(
      (next) => setSettings(next),
      () => { /* the feed's own error covers a missing rules deploy */ },
    );
  }, [demo]);

  useEffect(() => {
    if (!demo) return;
    onUnreadChange?.(demoItems.filter((item) => !item.read).length);
  }, [demo, demoItems, onUnreadChange]);

  const loadLive = useCallback(async (pageIndex, pageCursors, filter) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminNotificationPage({
        type: filter,
        cursor: pageCursors[pageIndex] || null,
      });
      setItems(result.items);
      setHasMore(result.hasMore);
      if (result.hasMore && result.cursor) {
        setCursors((prev) => {
          const copy = prev.slice(0, pageIndex + 1);
          copy[pageIndex + 1] = result.cursor;
          return copy;
        });
      }
    } catch (err) {
      setItems([]);
      setHasMore(false);
      setError(err?.code === 'permission-denied'
        ? 'אין הרשאת אדמין לקרוא התראות. צריך לפרוס את חוקי Firestore ואז לרענן.'
        : 'טעינת ההתראות נכשלה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (demo) return;
    loadLive(page, cursors, type);
    // cursors is read for the page we are entering; storing the next cursor
    // must not refetch this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, page, type, loadLive]);

  const filteredDemo = useMemo(() => {
    const list = type === 'all' ? demoItems : demoItems.filter((item) => item.type === type);
    return [...list].sort((a, b) => createdMs(b) - createdMs(a));
  }, [demoItems, type]);

  const visible = demo
    ? filteredDemo.slice(page * NOTIFICATION_PAGE_SIZE, (page + 1) * NOTIFICATION_PAGE_SIZE)
    : items;
  const demoHasMore = demo && (page + 1) * NOTIFICATION_PAGE_SIZE < filteredDemo.length;
  const more = demo ? demoHasMore : hasMore;

  const changeType = (next) => {
    setType(next);
    setPage(0);
    setCursors([null]);
  };

  const persist = async (next, note) => {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    setDraftDays(null);
    if (demo) return normalized;
    setSaving(true);
    try {
      const saved = await saveAdminNotificationSettings(normalized, user?.uid);
      if (note) toast.success(note);
      return saved;
    } catch {
      toast.error('שמירת ההגדרות נכשלה');
      return normalized;
    } finally {
      setSaving(false);
    }
  };

  const toggleGlobal = () => persist({ ...settings, enabled: !settings.enabled });

  const churnDraft = draftDays?.churnDays ?? settings.thresholds.churnDays;
  const inactiveDraft = draftDays?.inactiveDays ?? settings.thresholds.inactiveDays;

  const saveThresholds = () => {
    const churnDays = Number(churnDraft);
    const inactiveDays = Number(inactiveDraft);
    const bumped = Number.isFinite(inactiveDays) && Number.isFinite(churnDays) && inactiveDays <= churnDays;
    persist(
      { ...settings, thresholds: { churnDays, inactiveDays } },
      bumped ? 'סף חוסר הפעילות עודכן כך שיישאר ארוך מסיכון הנטישה' : 'הסף נשמר',
    );
  };

  const markOne = async (item) => {
    if (item.read) return;
    if (demo) {
      setDemoItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
    try {
      await markAdminNotificationRead(item.id);
    } catch {
      toast.error('סימון כנקרא נכשל');
      loadLive(page, cursors, type);
    }
  };

  const markAll = async () => {
    if (demo) {
      setDemoItems((prev) => prev.map((row) => ({ ...row, read: true })));
      return;
    }
    setItems((prev) => prev.map((row) => ({ ...row, read: true })));
    try {
      await markAllAdminNotificationsRead();
      toast.success('כל ההתראות סומנו כנקראו');
    } catch {
      toast.error('סימון הכל נכשל');
      loadLive(page, cursors, type);
    }
  };

  const openDemo = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'notifications');
    next.set('demo', '1');
    setSearchParams(next);
  };

  const typeLabel = (id) => types.find((t) => t.id === id)?.label || id;
  const listBadge = !settings.enabled
    ? <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-bg-tertiary text-text-muted border border-border-primary">מושתק</span>
    : (visible.some((item) => !item.read)
      ? <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-accent-primary/15 text-accent-hover">חדש</span>
      : null);

  return (
    <div dir="rtl" className="space-y-3" data-testid="admin-notif-panel">
      {demo && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 leading-relaxed">
          תצוגת דמו — נתונים לדוגמה, בלי כתיבה ל-Firestore. ההתראות האמיתיות נוצרות בפונקציה המתוזמנת אחרי שהיא תפורס.
        </div>
      )}

      <Panel title="התראות אדמין">
        <div data-testid="admin-notif-master">
          <Toggle
            on={settings.enabled}
            label="התראות אדמין"
            description={settings.enabled
              ? 'פועל — התראות חדשות נוצרות ומגיעות לרשימה.'
              : 'כבוי — לא נוצרות התראות חדשות. הרשימה למטה נשארת כהיסטוריה.'}
            disabled={saving}
            onClick={toggleGlobal}
          />
        </div>
      </Panel>

      {!settings.enabled && (
        <div
          data-testid="admin-notif-muted"
          className="rounded-xl border border-border-primary bg-bg-tertiary px-4 py-3 flex gap-3 items-start"
        >
          <BellOff className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-secondary">התראות אדמין כבויות</p>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              לא נוצרות התראות חדשות. הרשימה למטה מוצגת כמושתקת, ורק כדי לעיין במה שכבר נשמר.
            </p>
          </div>
        </div>
      )}

      <Panel
        title="הגדרות התראות"
        action={(
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className={`${softBtn} h-9 px-3`}
          >
            <Settings2 className="w-4 h-4" />
            {settingsOpen ? 'סגירה' : 'פתיחה'}
            <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      >
        {settingsOpen && (
          <div data-testid="admin-notif-settings" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs text-text-secondary">
                ימי שקט לסיכון נטישה
                <input
                  className={`${inputCls} mt-1.5`}
                  dir="ltr"
                  inputMode="numeric"
                  aria-label="ימי שקט לסיכון נטישה"
                  value={churnDraft}
                  onChange={(e) => setDraftDays((prev) => ({
                    churnDays: e.target.value,
                    inactiveDays: prev?.inactiveDays ?? settings.thresholds.inactiveDays,
                  }))}
                />
              </label>
              <label className="block text-xs text-text-secondary">
                ימים בלי כניסה ל"לא פעיל"
                <input
                  className={`${inputCls} mt-1.5`}
                  dir="ltr"
                  inputMode="numeric"
                  aria-label="ימים בלי כניסה למשתמש לא פעיל"
                  value={inactiveDraft}
                  onChange={(e) => setDraftDays((prev) => ({
                    churnDays: prev?.churnDays ?? settings.thresholds.churnDays,
                    inactiveDays: e.target.value,
                  }))}
                />
              </label>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              סיכון נטישה: היה פעיל (עסקה, או כניסה אחרי יום ההרשמה) ואז שקט. לא פעיל: אין כניסה זמן ארוך יותר — בלי התראה כפולה על אותו שקט.
            </p>
            <button type="button" onClick={saveThresholds} disabled={saving} className={`${softBtn} h-9`}>
              שמירת סף
            </button>
          </div>
        )}
        {!settingsOpen && (
          <p className="text-xs text-text-muted">
            נטישה {settings.thresholds.churnDays} ימים
            {' · '}
            לא פעיל {settings.thresholds.inactiveDays} ימים
          </p>
        )}
      </Panel>

      <Panel
        title="התראות"
        badge={listBadge}
        action={(
          <button type="button" onClick={markAll} className={`${softBtn} h-9 px-3`} data-testid="admin-notif-mark-all">
            <CheckCheck className="w-4 h-4" /> סמן הכל כנקרא
          </button>
        )}
      >
        <div
          data-testid="admin-notif-history"
          data-muted={settings.enabled ? '0' : '1'}
          className={settings.enabled ? '' : 'opacity-60 saturate-50'}
        >
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3 -mt-1" data-testid="admin-notif-filters">
          <FilterChip active={type === 'all'} onClick={() => changeType('all')}>הכל</FilterChip>
          {types.map((t) => (
            <FilterChip key={t.id} active={type === t.id} onClick={() => changeType(t.id)}>{t.label}</FilterChip>
          ))}
        </div>

        {(!demo && loading && !visible.length) ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : (!demo && error) ? (
          <div className="rounded-xl border border-loss/30 bg-loss/10 text-loss text-sm p-3">{error}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-text-secondary">
              {type === 'all' ? 'אין התראות עדיין.' : `אין התראות מסוג "${typeLabel(type)}".`}
            </p>
            {!demo && type === 'all' && (
              <button type="button" onClick={openDemo} className={`${softBtn} mt-4`}>
                תצוגת דמו
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2" data-testid="admin-notif-feed">
            {visible.map((item) => {
              const meta = ICONS[item.type] || ICONS.inactive_user;
              const Icon = meta.Icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => markOne(item)}
                    data-testid="admin-notif-row"
                    data-read={item.read ? '1' : '0'}
                    data-type={item.type}
                    className={`w-full text-right rounded-xl border px-3 py-3 flex gap-3 items-start cursor-pointer transition-colors ${item.read ? 'border-border-primary bg-bg-tertiary/30 hover:border-border-hover' : 'border-accent-primary/35 bg-accent-primary/10 hover:bg-accent-primary/15'}`}
                  >
                    <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${meta.tile}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-text-primary truncate">{item.userName || 'משתמש'}</span>
                        <span className="text-[11px] text-text-muted whitespace-nowrap">{relativeActive(createdMs(item))}</span>
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" aria-hidden />}
                        <span className="text-[11px] font-semibold text-text-secondary shrink-0">{item.title || typeLabel(item.type)}</span>
                        <span className="sr-only">{item.read ? 'נקרא' : 'לא נקרא'}</span>
                        {item.userEmail && (
                          <span className="text-[11px] text-text-muted truncate" dir="ltr">{item.userEmail}</span>
                        )}
                      </span>
                      <span className="block text-xs text-text-secondary mt-1 leading-relaxed">{item.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {(page > 0 || more) && (
          <div className="flex items-center justify-between gap-2 mt-4">
            <button
              type="button"
              className={`${softBtn} h-9`}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              הקודם
            </button>
            <span className="text-xs text-text-muted num-mono">עמוד {page + 1}</span>
            <button
              type="button"
              className={`${softBtn} h-9`}
              data-testid="admin-notif-next"
              disabled={!more}
              onClick={() => setPage((p) => p + 1)}
            >
              הבא
            </button>
          </div>
        )}
        </div>
      </Panel>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer shrink-0 ${active ? 'bg-accent-primary/15 border-accent-primary/50 text-accent-hover' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}
    >
      {children}
    </button>
  );
}
