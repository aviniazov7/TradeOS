import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, CheckCheck, Inbox, LifeBuoy, Mail, MailOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { Panel, softBtn } from './AdminUi';
import { formatDate, relativeActive, toDate } from './adminUtils';
import {
  filterInbox, inboxCreatedMs, INBOX_TYPE_LABELS, mergeInbox, unreadByKind,
} from '../../utils/adminInbox';
import {
  markAllAdminInboxRead,
  markOperationalNoticesRead,
  subscribeAdminInboxItems,
  subscribeOperationalNotices,
  updateAdminInboxState,
  updateAdminNoticeState,
} from '../../services/adminInboxService';
import LoadingSpinner from '../shared/LoadingSpinner';

function whenLabel(value) {
  const d = toDate(value);
  if (!d) return '';
  const clock = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(value)} · ${clock}`;
}

function Chip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`h-8 px-3 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${active ? 'bg-accent-primary/15 border-accent-primary/50 text-sky-200' : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'}`}
    >
      {children}
    </button>
  );
}

function Count({ n }) {
  if (!n) return null;
  return (
    <span className="min-w-[16px] h-4 px-1 rounded-full bg-loss text-white text-[10px] font-bold grid place-items-center num-mono">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export default function AdminInbox({ onOpenUser }) {
  const [kind, setKind] = useState('feedback');
  const [archiveView, setArchiveView] = useState(false);
  const [inboxDocs, setInboxDocs] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) setLoading(false);
    };
    const unsubInbox = subscribeAdminInboxItems((rows) => {
      setInboxDocs(rows);
      setInboxError(null);
      done();
    }, (err) => {
      setInboxError(err);
      done();
    });
    const unsubNotices = subscribeOperationalNotices((rows) => {
      setNotices(rows);
      done();
    }, () => done());
    return () => {
      unsubInbox();
      unsubNotices();
    };
  }, []);

  const items = useMemo(() => mergeInbox(inboxDocs, notices), [inboxDocs, notices]);
  const visible = useMemo(
    () => filterInbox(items, { kind, archived: archiveView }),
    [items, kind, archiveView],
  );
  const selected = visible.find((item) => item.id === selectedId)
    || items.find((item) => item.id === selectedId)
    || null;
  useEffect(() => {
    if (selectedId && !visible.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  const feedbackUnread = unreadByKind(items, 'feedback');
  const systemUnread = unreadByKind(items, 'system');

  const rulesHint = inboxError?.code === 'permission-denied'
    ? 'אין הרשאת אדמין לתיבה. צריך לפרוס את חוקי Firestore ואז לרענן.'
    : (inboxError ? 'טעינת התיבה נכשלה. נסה שוב.' : null);

  const patch = async (item, flags) => {
    const apply = (rows) => rows.map((row) => (row.id === item.ref.id ? { ...row, ...flags } : row));
    if (item.ref.store === 'adminInbox') setInboxDocs((prev) => apply(prev));
    else setNotices((prev) => apply(prev));
    try {
      if (item.ref.store === 'adminInbox') await updateAdminInboxState(item.ref.id, flags);
      else await updateAdminNoticeState(item.ref.id, flags);
    } catch {
      toast.error('העדכון נכשל');
      if (item.ref.store === 'adminInbox') {
        setInboxDocs((prev) => prev.map((row) => (row.id === item.ref.id ? { ...row, read: item.read, archived: item.archived } : row)));
      } else {
        setNotices((prev) => prev.map((row) => (row.id === item.ref.id ? { ...row, read: item.read, archived: item.archived } : row)));
      }
    }
  };

  const openItem = (item) => {
    setSelectedId(item.id);
    if (!item.read && !archiveView) patch(item, { read: true });
  };

  const markAll = async () => {
    const unread = visible.filter((item) => !item.read);
    if (!unread.length || busy || archiveView) return;
    setBusy(true);
    const ids = new Set(unread.map((item) => item.ref.id));
    setInboxDocs((prev) => prev.map((row) => (ids.has(row.id) && row.kind === kind ? { ...row, read: true } : row)));
    setNotices((prev) => prev.map((row) => (ids.has(row.id) ? { ...row, read: true } : row)));
    try {
      await markAllAdminInboxRead(kind);
      if (kind === 'system') await markOperationalNoticesRead();
      toast.success('הכל סומן כנקרא');
    } catch {
      toast.error('סימון הכל נכשל');
    } finally {
      setBusy(false);
    }
  };

  const sender = selected?.userName || (selected?.kind === 'system' ? 'מערכת' : 'משתמש');

  return (
    <div dir="rtl" className="space-y-3" data-testid="admin-inbox">
      <p className="text-xs text-text-muted leading-relaxed px-1">
        משובים והודעות תפעול נשמרים כאן. הם לא נשלחים כהתראת פוש, כדי שלא יתערבבו עם התראות מסחר.
      </p>

      {rulesHint && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 text-loss text-sm p-3">{rulesHint}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-3 items-start">
        <div className={selected ? 'hidden lg:block' : ''}>
          <Panel
            title="תיבת דואר"
            badge={feedbackUnread + systemUnread > 0
              ? <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-loss/15 text-loss">{feedbackUnread + systemUnread} חדשות</span>
              : null}
            action={(
              <button
                type="button"
                onClick={markAll}
                disabled={busy || archiveView || !visible.some((item) => !item.read)}
                className={`${softBtn} h-9 px-3`}
                data-testid="admin-inbox-mark-all"
              >
                <CheckCheck className="w-4 h-4" /> סמן הכל כנקרא
              </button>
            )}
          >
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3 -mt-1">
              <Chip active={kind === 'feedback'} testId="admin-inbox-tab-feedback" onClick={() => { setKind('feedback'); setSelectedId(null); }}>
                משובים <Count n={feedbackUnread} />
              </Chip>
              <Chip active={kind === 'system'} testId="admin-inbox-tab-system" onClick={() => { setKind('system'); setSelectedId(null); }}>
                הודעות מערכת <Count n={systemUnread} />
              </Chip>
              <Chip active={archiveView} testId="admin-inbox-archive-filter" onClick={() => { setArchiveView((v) => !v); setSelectedId(null); }}>
                <Archive className="w-3.5 h-3.5" /> ארכיון
              </Chip>
            </div>

            {loading && !visible.length ? (
              <div className="py-10"><LoadingSpinner /></div>
            ) : visible.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Inbox className="w-6 h-6 mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-secondary">
                  {archiveView ? 'הארכיון ריק.' : kind === 'feedback' ? 'אין משובים.' : 'אין הודעות מערכת.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5" data-testid="admin-inbox-list">
                {visible.map((item) => {
                  const active = item.id === selectedId;
                  const who = item.userName || item.title || (item.kind === 'system' ? 'מערכת' : 'משתמש');
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        data-testid="admin-inbox-row"
                        data-read={item.read ? '1' : '0'}
                        data-kind={item.kind}
                        data-type={item.type}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-right rounded-xl border px-3 py-2.5 flex gap-2.5 items-start cursor-pointer transition-colors ${active ? 'border-accent-primary/50 bg-accent-primary/10' : item.read ? 'border-border-primary bg-bg-tertiary/30 hover:border-border-hover' : 'border-accent-primary/30 bg-bg-secondary hover:bg-accent-primary/5'}`}
                      >
                        <span className="pt-1.5 w-2 shrink-0" aria-hidden>
                          {!item.read && <span data-testid="admin-inbox-unread-dot" className="block w-2 h-2 rounded-full bg-accent-primary" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm ${item.read ? 'font-medium text-text-secondary' : 'font-bold text-text-primary'}`}>{who}</span>
                            <span className="text-[11px] text-text-muted whitespace-nowrap shrink-0">{relativeActive(inboxCreatedMs(item.createdAt))}</span>
                          </span>
                          <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <span className="text-[10px] font-bold rounded-full px-1.5 py-px bg-bg-tertiary text-text-muted border border-border-primary shrink-0">
                              {INBOX_TYPE_LABELS[item.subtype] || INBOX_TYPE_LABELS[item.type] || 'הודעה'}
                            </span>
                            <span className={`truncate text-xs ${item.read ? 'text-text-muted' : 'font-semibold text-text-secondary'}`}>{item.preview}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className={!selected ? 'hidden lg:block' : ''}>
          <Panel
            title={selected ? selected.title : 'הודעה'}
            action={selected ? (
              <button type="button" onClick={() => setSelectedId(null)} className={`${softBtn} h-9 px-3 lg:hidden`}>
                חזרה
              </button>
            ) : null}
          >
            {!selected ? (
              <div className="py-16 text-center" data-testid="admin-inbox-detail">
                <Mail className="w-6 h-6 mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-muted">בחרו הודעה כדי לקרוא אותה.</p>
              </div>
            ) : (
              <div data-testid="admin-inbox-detail" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary truncate">{sender}</p>
                    {selected.userEmail && (
                      <p className="text-xs text-text-muted truncate" dir="ltr">{selected.userEmail}</p>
                    )}
                    <p className="text-[11px] text-text-muted mt-1">{whenLabel(selected.createdAt)}</p>
                  </div>
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-bg-tertiary text-text-secondary border border-border-primary shrink-0">
                    {INBOX_TYPE_LABELS[selected.subtype] || INBOX_TYPE_LABELS[selected.type] || 'הודעה'}
                  </span>
                </div>

                <div className="rounded-xl border border-border-primary bg-bg-tertiary/40 px-4 py-3 text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                  {selected.body}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="admin-inbox-toggle-read"
                    onClick={() => patch(selected, { read: !selected.read })}
                    className={`${softBtn} h-9 px-3`}
                  >
                    {selected.read ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                    {selected.read ? 'סמן כלא נקרא' : 'סמן כנקרא'}
                  </button>
                  <button
                    type="button"
                    data-testid="admin-inbox-archive"
                    onClick={() => {
                      const next = !selected.archived;
                      patch(selected, { archived: next });
                      if (next) setSelectedId(null);
                    }}
                    className={`${softBtn} h-9 px-3`}
                  >
                    {selected.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    {selected.archived ? 'שחזר מהארכיון' : 'העבר לארכיון'}
                  </button>
                  {selected.userId && onOpenUser && (
                    <button
                      type="button"
                      onClick={() => onOpenUser(selected.userId)}
                      className={`${softBtn} h-9 px-3`}
                    >
                      <LifeBuoy className="w-4 h-4" /> כרטיס משתמש
                    </button>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
