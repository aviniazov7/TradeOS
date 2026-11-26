import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check, Pencil, Save, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../shared/PageHeader';
import { headerIconBtn } from '../../shared/headerStyles';
import Skeleton from '../../shared/Skeleton';
import JournalHistory from '../JournalHistory';
import { useAuth } from '../../../contexts/AuthContext';
import { localDayKey } from '../../../utils/calculations';
import {
  draftKey, entryTime, formsEqual, journalView, requiredProgress,
} from '../../../utils/mentalityJournalForm';
import { readDraft, writeDraft, clearDraft, pruneDrafts } from '../../../utils/journalDraft';
import { focusCls } from './journalUi';

// The frame both journals share: header with progress and the journal /
// history tabs, the guided form with an autosaved draft and a sticky save bar,
// and — once today's journal is saved — a completed summary with "ערוך".
//
// Config (per journal):
//   kind, icon, title, labels { done, save, saved, updated }
//   emptyForm(), fromEntry(entry), toPayload(form, date)
//   required: [{ key, label, done(form) }], requiredSection: { key: sectionId }
//   renderForm({ form, update, set }), renderSummary(entry), nextStep

const DRAFT_DEBOUNCE_MS = 400;

function scrollToSection(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('button, input, textarea')?.focus({ preventScroll: true });
}

function scrollPageTop() {
  try {
    document.getElementById('app-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    /* ignore */
  }
}

function ProgressMeta({ done, total }) {
  return (
    <div className="max-w-sm">
      <div className="flex items-center justify-between gap-3 mb-1.5 text-xs">
        <span className="text-text-secondary">שדות חובה</span>
        <span className="num-mono text-text-primary font-semibold" aria-hidden>{done}/{total}</span>
      </div>
      <div
        role="progressbar"
        aria-label="התקדמות בשדות החובה"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} מתוך ${total}`}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-colors duration-300 ${i < done ? 'bg-accent-primary' : 'bg-bg-tertiary border border-border-primary'}`} />
        ))}
      </div>
    </div>
  );
}

function DoneMeta({ time }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-profit/25 bg-profit/10 px-2.5 py-1 text-xs font-semibold text-profit">
      <Check className="w-3.5 h-3.5" aria-hidden />
      {time ? `הושלם היום · ${time}` : 'הושלם היום'}
    </span>
  );
}

function LoadingSections() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="טוען">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-bg-secondary border border-border-primary rounded-2xl p-5 space-y-3">
          <Skeleton className="w-32 h-5" />
          <Skeleton className="w-full h-9" />
          <Skeleton className="w-2/3 h-9" />
        </div>
      ))}
    </div>
  );
}

export default function JournalPage({
  kind, icon, title, labels, entries, todayEntry, loading, onSave, onDelete,
  emptyForm, fromEntry, toPayload, required, requiredSection = {}, renderForm, renderSummary, nextStep,
  routineItems, routineRetired,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dayKey = localDayKey();
  const dKey = draftKey(user?.uid, kind, dayKey);

  const [activeTab, setActiveTab] = useState('form');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // What was just saved, shown until the listener delivers the doc (and kept
  // if it never does, e.g. a slow network) — the page never falls back to an
  // empty form after a successful save.
  const [savedEntry, setSavedEntry] = useState(null);
  const [form, setForm] = useState(() => readDraft(dKey) || emptyForm());

  const shownEntry = todayEntry || (savedEntry?.date === dayKey ? savedEntry : null);
  const view = journalView({ loading, entry: shownEntry, editing });
  const baseline = useMemo(() => (shownEntry && editing ? fromEntry(shownEntry) : emptyForm()), [shownEntry, editing, fromEntry, emptyForm]);
  const progress = requiredProgress(required, form);
  const dirty = !formsEqual(form, baseline);
  const hasDraft = !editing && !!readDraft(dKey) && !!shownEntry;

  // Drafts of other days can't be restored — drop them once.
  useEffect(() => {
    pruneDrafts(dKey);
  }, [dKey]);

  // Autosave the draft while the form is open and differs from where it started.
  useEffect(() => {
    if (view !== 'form') return undefined;
    const t = setTimeout(() => {
      if (dirty) writeDraft(dKey, form);
      else clearDraft(dKey);
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [form, dirty, dKey, view]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const startEdit = () => {
    setForm(readDraft(dKey) || fromEntry(shownEntry));
    setEditing(true);
    setActiveTab('form');
    scrollPageTop();
  };

  const cancelEdit = () => {
    clearDraft(dKey);
    setEditing(false);
    scrollPageTop();
  };

  const save = async () => {
    if (!progress.complete || saving) return;
    setSaving(true);
    const payload = toPayload(form, dayKey);
    try {
      const id = await onSave(payload, shownEntry?.id);
      clearDraft(dKey);
      setSavedEntry({
        ...payload,
        id: id || shownEntry?.id || null,
        createdAt: shownEntry?.createdAt || new Date(),
        updatedAt: new Date(),
      });
      const wasEdit = !!shownEntry;
      setEditing(false);
      setForm(emptyForm());
      toast.success(wasEdit ? labels.updated : labels.saved);
      scrollPageTop();
    } catch (err) {
      console.error(err);
      toast.error('השמירה נכשלה. הטיוטה נשמרה במכשיר, נסה שוב.');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await onDelete(id);
    if (id && id === shownEntry?.id) setSavedEntry(null);
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  };

  const createdTime = entryTime(shownEntry?.createdAt);
  const updatedTime = entryTime(shownEntry?.updatedAt);
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  let meta = null;
  if (view === 'completed') meta = <DoneMeta time={createdTime} />;
  else if (view === 'form') meta = <ProgressMeta done={progress.done} total={progress.total} />;

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto w-full"
    >
      <PageHeader
        icon={icon}
        title={title}
        subtitle={editing ? `${dateStr} · עריכת היומן של היום` : dateStr}
        meta={activeTab === 'form' ? meta : null}
        tabs={{ tabs: [{ id: 'form', label: title }, { id: 'history', label: 'היסטוריה' }], value: activeTab, onChange: setActiveTab, layoutKey: `${kind}-tab` }}
        actions={(
          <button onClick={() => navigate('/mentality')} className={headerIconBtn} title="חזרה לאזור המנטלי" aria-label="חזרה לאזור המנטלי">
            <ArrowRight className="w-[18px] h-[18px]" />
          </button>
        )}
      />

      {activeTab === 'history' ? (
        <JournalHistory
          entries={entries}
          type={kind}
          onDeleteEntry={handleDelete}
          routineItems={routineItems}
          routineRetired={routineRetired}
        />
      ) : view === 'loading' ? (
        <LoadingSections />
      ) : view === 'completed' ? (
        <section aria-labelledby={`${kind}-done-title`} className="space-y-4">
          <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-11 h-11 rounded-xl grid place-items-center bg-profit/12 border border-profit/25 shrink-0" aria-hidden>
                <Check className="w-5 h-5 text-profit" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`${kind}-done-title`} className="text-base md:text-lg font-bold text-text-primary leading-tight">{labels.done}</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {createdTime ? `נשמר ב-${createdTime}` : 'נשמר היום'}
                  {updatedTime && createdTime && updatedTime !== createdTime ? ` · עודכן ב-${updatedTime}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={startEdit}
                className={`h-10 inline-flex items-center gap-1.5 px-4 rounded-xl border border-border-primary bg-bg-tertiary text-sm font-semibold text-text-primary hover:border-border-hover transition-colors cursor-pointer ${focusCls}`}
              >
                <Pencil className="w-4 h-4" aria-hidden />
                {hasDraft ? 'המשך עריכה' : 'ערוך'}
              </button>
            </div>
            {hasDraft && (
              <p className="mt-3 text-xs text-text-secondary bg-bg-tertiary border border-border-primary rounded-xl px-3 py-2">
                יש שינויים שלא נשמרו מהעריכה הקודמת. "המשך עריכה" יפתח אותם.
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-border-primary">
              {renderSummary(shownEntry)}
            </div>
          </div>
          {nextStep && (
            <Link
              to={nextStep.to}
              className={`group flex items-center justify-between gap-3 bg-bg-secondary border border-border-primary rounded-2xl px-4 py-3.5 hover:border-border-hover transition-colors ${focusCls}`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">{nextStep.title}</span>
                <span className="block text-xs text-text-muted mt-0.5">{nextStep.text}</span>
              </span>
              <ArrowLeft className="w-4 h-4 text-text-secondary shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          )}
        </section>
      ) : (
        <div onKeyDown={onKeyDown}>
          <div className="space-y-4">
            {renderForm({ form, update, set: setForm })}
          </div>

          {/* Save bar — sticks above the phone tab bar; solid fill so the form
              doesn't show through. */}
          <div className="sticky bottom-24 lg:bottom-4 z-20 mt-4">
            <div
              className="flex items-center gap-3 rounded-2xl border border-border-primary px-3 md:px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
              style={{ background: 'var(--modal-header-solid)' }}
            >
              <div className="min-w-0 flex-1" aria-live="polite">
                {progress.complete ? (
                  <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-accent-primary shrink-0" aria-hidden />
                    {editing && !dirty ? 'אין שינויים' : 'מוכן לשמירה'}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary leading-snug">
                    <span className="font-semibold text-text-primary">חסר: </span>
                    {progress.missing.map((m, i) => (
                      <span key={m.key}>
                        <span className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => scrollToSection(requiredSection[m.key])}
                            className={`underline decoration-dotted underline-offset-2 hover:text-text-primary cursor-pointer rounded ${focusCls}`}
                          >
                            {m.label}
                          </button>
                          {i < progress.missing.length - 1 && ','}
                        </span>
                        {' '}
                      </span>
                    ))}
                  </p>
                )}
                <p className="hidden sm:block text-[11px] text-text-muted mt-0.5">הטיוטה נשמרת אוטומטית במכשיר · Ctrl+Enter לשמירה</p>
              </div>
              {editing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className={`h-10 w-10 sm:w-auto sm:px-3 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer ${focusCls}`}
                  aria-label="ביטול עריכה"
                >
                  <X className="w-4 h-4" aria-hidden />
                  <span className="hidden sm:inline">ביטול</span>
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!progress.complete || saving || (editing && !dirty)}
                className={`h-10 px-4 sm:px-5 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent-primary text-white text-sm font-bold hover:bg-accent-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${focusCls}`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
                {saving ? 'שומר…' : editing ? 'שמור שינויים' : labels.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </m.div>
  );
}
