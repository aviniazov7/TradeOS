import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import {
  CUSTOM_NAME_MAX,
  addCustomField,
  removeCustomField,
  updateCustomField,
} from '../../utils/customTradeFields';

const TYPES = [
  { id: 'text', label: 'טקסט' },
  { id: 'number', label: 'מספר' },
  { id: 'select', label: 'בחירה' },
];

const EMPTY_DRAFT = { name: '', type: 'text', options: '' };
const inputClass = 'w-full h-10 rounded-xl bg-bg-secondary border border-border-primary px-3 text-sm text-text-primary outline-none focus:border-accent-primary';

function sourceDoc(doc, fields) {
  if (doc && Array.isArray(doc.fields)) return doc;
  return { fields: fields || [], seq: 0 };
}

// Create, edit, and delete the journal's optional fields from the trade
// ticket. The list is still users/{uid}/settings/customTradeFields — this
// only moves the controls next to the answers.
export function useCustomTradeFieldEditor({
  isPremium = false,
  doc,
  fields = [],
  ready = true,
  active = true,
  onSave,
  onUpgrade,
  onRequestOpen,
}) {
  const [mode, setMode] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [nameAttempted, setNameAttempted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const panelRef = useRef(null);
  const nameRef = useRef(null);

  const close = useCallback(() => {
    setMode(null);
    setDraft(EMPTY_DRAFT);
    setNameAttempted(false);
    setError('');
  }, []);

  useEffect(() => {
    if (active) return;
    close();
    setDeleteTarget(null);
  }, [active, close]);

  useEffect(() => {
    if (!mode) return;
    if (mode.kind !== 'upgrade') nameRef.current?.focus();
    panelRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [mode]);

  useCloseOnEscape(!!mode && !deleteTarget, close);

  useEffect(() => {
    if (!mode) return undefined;
    const onPointer = (event) => {
      if (deleteTarget) return;
      const el = event.target;
      if (!(el instanceof Element)) return;
      if (panelRef.current?.contains(el)) return;
      if (el.closest('[data-custom-field-trigger], [data-custom-field-action]')) return;
      close();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [mode, deleteTarget, close]);

  const openAdd = () => {
    onRequestOpen?.();
    setNameAttempted(false);
    setError('');
    setDraft(EMPTY_DRAFT);
    setMode((current) => {
      if (!isPremium) return current?.kind === 'upgrade' ? null : { kind: 'upgrade' };
      return current?.kind === 'add' ? null : { kind: 'add' };
    });
  };

  const openEdit = (field) => {
    if (!isPremium) return;
    onRequestOpen?.();
    setNameAttempted(false);
    setError('');
    setDraft({
      name: field.name,
      type: field.type,
      options: field.type === 'select' ? (field.options || []).join(', ') : '',
    });
    setMode({ kind: 'edit', id: field.id });
  };

  const nameMissing = !draft.name.trim();
  const nameTooLong = draft.name.length > CUSTOM_NAME_MAX;
  // Empty is only an error after הוספת שדה / שמירת שדה. Too long shows as they type.
  const nameError = (nameTooLong || (nameAttempted && nameMissing)) ? 'צריך שם עד 40 תווים' : '';

  const persist = async (next) => {
    if (!onSave) throw new Error('no save');
    await onSave(next);
  };

  const submit = async () => {
    if (busy || !ready || !mode || mode.kind === 'upgrade') return;
    if (nameMissing || nameTooLong) {
      setNameAttempted(true);
      return;
    }
    const result = mode.kind === 'edit'
      ? updateCustomField(sourceDoc(doc, fields), mode.id, draft, { isPremium })
      : addCustomField(sourceDoc(doc, fields), draft, { isPremium });
    if (!result.ok) {
      setNameAttempted(true);
      setError(result.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persist({ fields: result.fields, seq: result.seq });
      close();
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !isPremium) return;
    const next = removeCustomField(sourceDoc(doc, fields), deleteTarget.id);
    setBusy(true);
    setError('');
    try {
      await persist(next);
      if (mode?.kind === 'edit' && mode.id === deleteTarget.id) close();
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
      throw new Error('save failed');
    } finally {
      setBusy(false);
    }
  };

  const onDraftKeyDown = (event) => {
    if (event.key !== 'Enter' || event.target?.tagName !== 'INPUT') return;
    event.preventDefault();
    event.stopPropagation();
    submit();
  };

  const trigger = (
    <button
      type="button"
      data-custom-field-trigger=""
      data-testid="add-custom-field"
      aria-expanded={mode?.kind === 'add' || mode?.kind === 'upgrade'}
      onClick={openAdd}
      className="inline-flex items-center h-8 px-2.5 rounded-lg border border-border-primary bg-bg-tertiary text-[11px] font-semibold text-text-primary hover:border-border-hover cursor-pointer shrink-0"
    >
      + שדה משלך
    </button>
  );

  let panel = null;
  if (mode?.kind === 'upgrade') {
    panel = (
      <div
        ref={panelRef}
        data-popover={deleteTarget ? undefined : ''}
        data-testid="custom-field-upgrade"
        dir="rtl"
        className="w-full max-w-sm rounded-xl border border-border-primary bg-bg-tertiary p-3 space-y-2"
      >
        <p className="text-[11px] text-text-muted leading-relaxed">למשל: סטאפ — Breakout / Pullback</p>
        {onUpgrade ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="flex items-center gap-1.5 text-[11px] text-accent-primary hover:underline cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            הגדרת שדות חדשים — שדרג ל-Premium
          </button>
        ) : (
          <a href="/premium" className="inline-flex items-center gap-1.5 text-[11px] text-accent-primary hover:underline">
            <Crown className="w-3.5 h-3.5" />
            הגדרת שדות חדשים — שדרג ל-Premium
          </a>
        )}
      </div>
    );
  } else if (mode) {
    panel = (
      <div
        ref={panelRef}
        data-popover={deleteTarget ? undefined : ''}
        data-testid="custom-field-form"
        dir="rtl"
        onKeyDown={onDraftKeyDown}
        className="w-full max-w-sm rounded-xl border border-border-primary bg-bg-tertiary p-3 space-y-2"
      >
        <p className="text-[11px] text-text-muted leading-relaxed">למשל: סטאפ — Breakout / Pullback</p>
        <input
          ref={nameRef}
          value={draft.name}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, name: value }));
            setError('');
            if (value.trim() && value.length <= CUSTOM_NAME_MAX) setNameAttempted(false);
          }}
          placeholder="שם השדה"
          aria-label="שם השדה"
          aria-invalid={nameError ? true : undefined}
          className={inputClass}
        />
        <div className="flex gap-1.5" role="radiogroup" aria-label="סוג השדה">
          {TYPES.map((item) => {
            const on = draft.type === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setDraft((current) => ({ ...current, type: item.id }));
                  setError('');
                }}
                className={`flex-1 h-9 rounded-xl border text-xs font-semibold cursor-pointer ${
                  on
                    ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                    : 'border-border-primary text-text-secondary hover:border-border-hover'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {draft.type === 'select' && (
          <input
            value={draft.options}
            onChange={(event) => {
              setDraft((current) => ({ ...current, options: event.target.value }));
              setError('');
            }}
            placeholder="אפשרויות, מופרדות בפסיק"
            aria-label="אפשרויות בחירה"
            className={inputClass}
          />
        )}
        {(nameError || error) && <p role="alert" className="text-[11px] text-loss">{nameError || error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !ready}
            className="h-10 px-3 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? 'שומר...' : mode.kind === 'edit' ? 'שמירת שדה' : 'הוספת שדה'}
          </button>
          <button
            type="button"
            onClick={close}
            className="h-10 px-3 rounded-xl border border-border-primary text-sm text-text-secondary cursor-pointer"
          >
            ביטול
          </button>
        </div>
      </div>
    );
  }

  const fieldActions = (field) => {
    if (!isPremium) return null;
    return (
      <span className="inline-flex items-center shrink-0">
        <button
          type="button"
          data-custom-field-action=""
          aria-label={`עריכת ${field.name}`}
          onClick={() => openEdit(field)}
          className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-custom-field-action=""
          aria-label={`מחיקת ${field.name}`}
          onClick={() => setDeleteTarget(field)}
          className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-loss cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  };

  const confirm = (
    <ConfirmDialog
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={confirmDelete}
      title="למחוק את השדה?"
      message={deleteTarget
        ? `«${deleteTarget.name}» יוסר מטופס העסקה ומהסטטיסטיקות. ערכים שכבר נשמרו נשארים על העסקאות עד העריכה הבאה.`
        : ''}
      confirmText="מחק"
      cancelText="ביטול"
    />
  );

  return { trigger, panel, fieldActions, confirm, close };
}
