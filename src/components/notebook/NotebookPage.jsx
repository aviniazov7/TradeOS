import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { Crown, NotebookPen, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../shared/PageHeader';
import Card from '../shared/Card';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import DateField from '../shared/DateField';
import SelectDropdown from '../shared/SelectDropdown';
import { headerPrimaryBtn } from '../shared/headerStyles';
import { useAuth } from '../../contexts/AuthContext';
import { useJournalContext } from '../../contexts/JournalContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { pageTransition, pageVariants } from '../../utils/animations';
import { FREE_LIMITS } from '../../utils/constants';
import {
  NOTEBOOK_LIMITS,
  groupNotebookByMonth,
  notebookDayKey,
  renderNotebookBody,
  searchNotebook,
} from '../../utils/notebook';
import { buildNotebookDemoEntries } from '../../utils/notebookDemo';
import {
  NOTEBOOK_FIRESTORE_ENABLED,
  NOTEBOOK_STORAGE_MODE,
  createNotebookStore,
} from '../../services/notebookStore';
import {
  displayNotebookDay,
  notebookEntryLimit,
  notebookJournalOptions,
  notebookTagOptions,
  parseNotebookTags,
} from './notebookView';

const MotionDiv = m.div;

const PURPOSE = 'כאן כותבים הערה חופשית ליום מסחר, לשבוע, לרעיון או ללקח. זה לא הערת עסקה ולא יומן הבוקר או הערב.';
const SAVING_OFF = 'השמירה לחשבון עדיין לא מופעלת.';

const fieldClass = 'w-full min-h-11 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary transition-colors';
const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
const quietBtn = 'h-10 px-3 inline-flex items-center justify-center rounded-lg border border-border-primary bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer';
// Idle and active are separate strings. Appending accent utilities onto quietBtn
// loses: Tailwind keeps one border-color and one text color, and the base chip
// wins, so a selected tag looked identical to the others.
const tagChipIdle = 'h-10 px-3 inline-flex items-center justify-center rounded-lg border border-border-primary bg-bg-tertiary text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer transition-colors';
const tagChipActive = 'h-10 px-3 inline-flex items-center justify-center rounded-lg border border-accent-primary bg-accent-primary/15 text-xs font-semibold text-accent-hover cursor-pointer transition-colors';
const bodyClass = 'notebook-body mt-2 text-sm text-text-secondary leading-relaxed break-words [&_p]:mb-2 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-text-primary [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-text-primary [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_strong]:text-text-primary [&_a]:text-accent-hover [&_code]:text-accent-primary [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-tertiary [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pr-5 [&_blockquote]:border-r-2 [&_blockquote]:border-border-primary [&_blockquote]:pr-3';

function blankDraft(now) {
  return {
    title: '',
    body: '',
    tags: '',
    date: '',
    journalName: '',
    clock: now,
  };
}

function draftFromEntry(entry, now) {
  return {
    title: entry.title || '',
    body: entry.body || '',
    tags: (entry.tags || []).join(', '),
    date: entry.date || '',
    journalName: entry.journalName || '',
    clock: now,
  };
}

function openStore({ demo, journals, now }) {
  if (demo) return createNotebookStore('memory', buildNotebookDemoEntries({ journals, now }));
  return createNotebookStore(NOTEBOOK_STORAGE_MODE);
}

function NotebookBody({ body }) {
  const html = renderNotebookBody(body);
  if (!html) return null;
  return <div className={bodyClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function NotebookPage({
  store: storeProp = null,
  demo: demoProp = null,
  journals: journalsProp = null,
  isPremium: premiumProp = null,
  now = null,
  onEnterDemo = null,
} = {}) {
  const auth = useAuth();
  const liveDemo = useDemoMode();
  const journalCtx = useJournalContext();
  const premium = premiumProp == null ? !!auth.isPremium : premiumProp;
  // Page demo is local. The shell demo flag turns itself off as soon as the
  // account has a real trade, which made the demo controls a no-op.
  const [pageDemo, setPageDemo] = useState(false);
  const demo = demoProp == null ? (pageDemo || liveDemo.active) : demoProp;
  const journals = journalsProp == null ? (journalCtx.journals || []) : journalsProp;
  const clock = now || new Date();
  const journalKey = journals.map((journal) => journal?.name || '').join('|');
  const demoMonth = (notebookDayKey(clock) || '').slice(0, 7);
  const storeKey = storeProp ? 'injected' : demo ? `demo:${demoMonth}:${journalKey}` : 'off';

  const [bag, setBag] = useState(() => ({
    key: storeKey,
    store: storeProp || openStore({ demo, journals, now: clock }),
    entries: [],
    ready: false,
  }));
  if (bag.key !== storeKey) {
    setBag({
      key: storeKey,
      store: storeProp || openStore({ demo, journals, now: clock }),
      entries: [],
      ready: false,
    });
  }

  useEffect(() => {
    let live = true;
    bag.store.list().then((rows) => {
      if (!live) return;
      setBag((current) => (
        current.store === bag.store
          ? { ...current, entries: Array.isArray(rows) ? rows : [], ready: true }
          : current
      ));
    });
    return () => { live = false; };
  }, [bag.store]);

  const entries = bag.entries;
  const store = bag.store;
  const limit = notebookEntryLimit(entries.length, premium);
  const storageOff = store.enabled === false;
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const activeTag = premium ? tag : '';
  const visible = searchNotebook(entries, { text, tag: activeTag });
  const groups = groupNotebookByMonth(visible);
  const tags = notebookTagOptions(entries);

  const [formOpen, setFormOpen] = useState(false);
  const enterDemo = () => {
    setFormOpen(false);
    if (onEnterDemo) onEnterDemo();
    if (demoProp == null) setPageDemo(true);
  };
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(() => blankDraft(clock));
  const [formError, setFormError] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const openNew = () => {
    if ((!store.enabled && !demo) || !limit.canAdd) return;
    setEditing(null);
    setDraft(blankDraft(clock));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    if (!store.enabled) return;
    setEditing(entry);
    setDraft(draftFromEntry(entry, clock));
    setFormError('');
    setFormOpen(true);
  };

  const refresh = async () => {
    const rows = await store.list();
    setBag((current) => (current.store === store ? { ...current, entries: rows, ready: true } : current));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editing && !limit.canAdd) {
      setFormError(`במסלול החינמי אפשר עד ${FREE_LIMITS.notebookEntries} רשומות. שדרג ל-Premium לרשומות בלי הגבלה.`);
      return;
    }
    const result = await store.save({
      title: draft.title,
      body: draft.body,
      tags: parseNotebookTags(draft.tags),
      date: draft.date || null,
      journalName: draft.journalName || null,
      ...(editing ? { id: editing.id, createdAt: editing.createdAt } : {}),
      updatedAt: clock,
      ...(demo || editing?.demo ? { demo: true } : {}),
    });
    if (!result.ok) {
      setFormError(result.message || 'הרשומה לא נשמרה.');
      return;
    }
    await refresh();
    setFormOpen(false);
    toast.success(editing ? 'הרשומה עודכנה' : 'הרשומה נוספה');
  };

  const remove = async (id) => {
    const result = await store.remove(id);
    if (!result.ok) {
      toast.error(result.message || 'הרשומה לא נמחקה.');
      return;
    }
    setConfirmId(null);
    await refresh();
    toast.success('הרשומה נמחקה');
  };

  const choices = notebookJournalOptions(journals, { demo, current: draft.journalName });
  const preview = renderNotebookBody(draft.body);
  const savingOff = !NOTEBOOK_FIRESTORE_ENABLED && (demo || store.enabled === false);

  return (
    <MotionDiv
      data-testid="notebook-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      <PageHeader
        icon={NotebookPen}
        title="מחברת"
        subtitle="הערות חופשיות ליום, לשבוע, לרעיון או ללקח. בנפרד מהערת העסקה."
        meta={!premium ? (
          <p className="text-xs text-text-muted">
            <span className="num-mono">{entries.length}</span>
            {` מתוך ${FREE_LIMITS.notebookEntries} רשומות במסלול החינמי. סינון לפי תגית ורשומות בלי הגבלה ב-Premium.`}
          </p>
        ) : null}
        actions={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {storageOff && !demo && (
              <button type="button" onClick={enterDemo} data-testid="notebook-demo" className={`${quietBtn} flex-1 sm:flex-none`}>
                מצב דמו
              </button>
            )}
            {!limit.canAdd && (
              <Link to="/premium" className="h-11 px-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-bold text-accent-hover">
                <Crown className="w-4 h-4" /> שדרג ל-Premium
              </Link>
            )}
            <button type="button" onClick={openNew} disabled={(!store.enabled && !demo) || !limit.canAdd} data-testid="notebook-add" className={`${headerPrimaryBtn} flex-1 sm:flex-none`}>
              <Plus className="w-4 h-4" /> רשומה חדשה
            </button>
          </div>
        )}
      />

      {savingOff && (
        <p data-testid="notebook-storage-note" role="status" className="mb-4 rounded-xl border border-border-primary bg-bg-secondary px-3.5 py-3 text-sm text-text-secondary leading-relaxed">
          {SAVING_OFF}
        </p>
      )}

      {demo && (
        <p data-testid="notebook-demo-flag" role="status" className="mb-4 rounded-xl border border-breakeven/30 bg-breakeven/10 px-3.5 py-3 text-sm text-text-primary leading-relaxed">
          מצב דמו. אלה רשומות לדוגמה על המסך בלבד — הן לא נשמרות בחשבון.
        </p>
      )}

      {!bag.ready ? (
        <p className="text-sm text-text-muted">טוען…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="המחברת ריקה"
          description={storageOff
            ? `${PURPOSE} ${SAVING_OFF} אפשר לראות דוגמה מסומנת על המסך.`
            : PURPOSE}
          actionLabel={storageOff ? 'מצב דמו' : 'רשומה חדשה'}
          onAction={storageOff ? enterDemo : openNew}
        />
      ) : (
        <div className="space-y-4 md:space-y-5">
          <Card className="p-3 md:p-4 space-y-3">
            <label className="block" htmlFor="notebook-search">
              <span className={labelClass}>חיפוש</span>
              <input
                id="notebook-search"
                data-testid="notebook-search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="כותרת, טקסט או תגית"
                className={fieldClass}
              />
            </label>
            {premium ? (
              <div data-testid="notebook-tag-filter" role="group" aria-label="סינון לפי תגית" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={activeTag === ''}
                  onClick={() => setTag('')}
                  className={activeTag === '' ? tagChipActive : tagChipIdle}
                >
                  כל התגיות
                </button>
                {tags.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={activeTag === item}
                    onClick={() => setTag(item)}
                    className={activeTag === item ? tagChipActive : tagChipIdle}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <div data-testid="notebook-tag-lock" className="flex items-start gap-2 rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2.5">
                <Crown className="w-4 h-4 text-accent-hover shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary leading-relaxed">
                  סינון לפי תגית נפתח ב-Premium. החיפוש החופשי זמין במסלול החינמי.
                  {' '}
                  <Link to="/premium" className="font-bold text-accent-hover">שדרג ל-Premium</Link>
                </p>
              </div>
            )}
          </Card>

          {groups.length === 0 ? (
            <p className="text-sm text-text-muted">אין רשומות שמתאימות לחיפוש.</p>
          ) : groups.map((group) => (
            <section key={group.month} data-testid={`notebook-month-${group.month}`} aria-label={group.label} className="space-y-2">
              <h2 className="text-sm md:text-base font-bold text-text-primary">{group.label}</h2>
              {group.entries.map((entry) => (
                <Card key={entry.id} data-testid={`notebook-entry-${entry.id}`} className="p-3 md:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="num-mono text-text-muted" dir="ltr">
                          {entry.date ? displayNotebookDay(entry.date) : 'בלי תאריך'}
                        </span>
                        {entry.demo && <span className="text-[10px] font-bold text-breakeven">דוגמה</span>}
                      </div>
                      <h3 className="mt-1 text-base font-bold text-text-primary break-words">{entry.title}</h3>
                      {entry.journalName && (
                        <p className="mt-1 text-xs text-text-muted">יומן: {entry.journalName}</p>
                      )}
                      <NotebookBody body={entry.body} />
                      {entry.tags.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {entry.tags.map((item) => (
                            <li key={item} className="rounded-md bg-bg-tertiary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmId === entry.id ? (
                        <>
                          <button type="button" onClick={() => remove(entry.id)} className={`${quietBtn} border-loss/40 text-loss`}>אישור מחיקה</button>
                          <button type="button" onClick={() => setConfirmId(null)} className={quietBtn}>ביטול</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => openEdit(entry)} className={quietBtn}>עריכה</button>
                          <button type="button" onClick={() => setConfirmId(entry.id)} className={quietBtn}>מחיקה</button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'עריכת רשומה' : 'רשומה חדשה'}
        footer={(
          <div className="flex items-center gap-2">
            <button type="submit" form="notebook-entry-form" className={headerPrimaryBtn}>שמירה</button>
            <button type="button" onClick={() => setFormOpen(false)} className={quietBtn}>ביטול</button>
          </div>
        )}
      >
        <form id="notebook-entry-form" onSubmit={save} className="space-y-3">
          <label className="block" htmlFor="notebook-title">
            <span className={labelClass}>כותרת</span>
            <input id="notebook-title" maxLength={NOTEBOOK_LIMITS.title} className={fieldClass} value={draft.title} onChange={(event) => setField('title', event.target.value)} />
          </label>
          <label className="block" htmlFor="notebook-body">
            <span className={labelClass}>טקסט</span>
            <textarea id="notebook-body" maxLength={NOTEBOOK_LIMITS.body} rows={6} className={`${fieldClass} min-h-28 resize-y`} value={draft.body} onChange={(event) => setField('body', event.target.value)} />
          </label>
          <p className="text-xs text-text-muted leading-relaxed">טקסט רגיל או מרקדאון. HTML לא מורץ.</p>
          {preview && (
            <div data-testid="notebook-preview" className="rounded-lg border border-border-primary bg-bg-tertiary p-3">
              <p className={labelClass}>תצוגה</p>
              <NotebookBody body={draft.body} />
            </div>
          )}
          <label className="block" htmlFor="notebook-tags">
            <span className={labelClass}>תגיות</span>
            <input id="notebook-tags" className={fieldClass} value={draft.tags} onChange={(event) => setField('tags', event.target.value)} placeholder="לקח, BTC" />
          </label>
          <p className="text-xs text-text-muted">מופרדות בפסיק. עד {NOTEBOOK_LIMITS.tags}.</p>
          <DateField id="notebook-date" size="field" label="תאריך" placeholder="בלי תאריך" value={draft.date} onChange={(value) => setField('date', value)} />
          <SelectDropdown
            label="קישור ליומן"
            value={draft.journalName}
            onChange={(value) => setField('journalName', value)}
            options={choices}
          />
          <p className="text-xs text-text-muted leading-relaxed">לפי שם היומן. זה מצביע בלבד, בלי העסקאות עצמן.</p>
          {formError && <p role="alert" className="text-sm text-loss">{formError}</p>}
          {!store.enabled && (
            <button type="button" onClick={enterDemo} className="text-sm font-bold text-accent-hover">מצב דמו</button>
          )}
        </form>
      </Modal>
    </MotionDiv>
  );
}
