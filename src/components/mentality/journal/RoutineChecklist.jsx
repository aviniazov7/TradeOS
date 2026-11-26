import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { focusCls, inputCls } from './journalUi';
import {
  MAX_ROUTINE_ITEMS,
  ROUTINE_LABEL_MAX,
  addRoutineItem,
  moveRoutineItem,
  removeRoutineItem,
  updateRoutineItem,
} from '../../../utils/morningRoutine';

const iconBtn =
  'w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary hover:border-border-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer';

// Daily checks (the ids stored on today's journal) plus the account's routine
// list: rename, add, delete, and reorder. Editing the list is a separate mode
// so a tap on a row still means "I did this today".
export default function RoutineChecklist({
  doc,
  checked,
  onCheckedChange,
  onReplace,
  disabled = false,
  startEditing = false,
}) {
  const labelId = useId();
  const [editing, setEditing] = useState(startEditing);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState('');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => (Array.isArray(doc?.items) ? doc.items : []), [doc]);
  const selected = Array.isArray(checked) ? checked : [];
  const signature = items.map((item) => `${item.id}\t${item.label}`).join('\n');

  useEffect(() => {
    setDrafts((prev) => {
      const next = {};
      for (const item of items) {
        next[item.id] = Object.prototype.hasOwnProperty.call(prev, item.id) ? prev[item.id] : item.label;
      }
      const sameSize = Object.keys(prev).length === items.length;
      if (sameSize && items.every((item) => prev[item.id] === next[item.id])) return prev;
      return next;
    });
  }, [signature, items]);

  useEffect(() => {
    if (!pendingDelete) return;
    if (!items.some((item) => item.id === pendingDelete)) setPendingDelete(null);
  }, [items, pendingDelete]);

  const persist = async (result) => {
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (result.changed === false) {
      setError('');
      return true;
    }
    setError('');
    setBusy(true);
    try {
      await onReplace(result.doc);
      return true;
    } catch {
      setError('השמירה נכשלה. נסו שוב.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => {
    if (disabled || busy) return;
    if (selected.includes(id)) onCheckedChange(selected.filter((value) => value !== id));
    else onCheckedChange([...selected, id]);
  };

  const commitLabel = async (id) => {
    const item = items.find((row) => row.id === id);
    if (!item || disabled) return;
    const typed = drafts[id] ?? '';
    const result = updateRoutineItem(doc, id, typed);
    if (!result.ok) {
      setError(result.error);
      setDrafts((prev) => ({ ...prev, [id]: item.label }));
      return;
    }
    const ok = await persist(result);
    if (!ok) setDrafts((prev) => ({ ...prev, [id]: item.label }));
    else setDrafts((prev) => ({ ...prev, [id]: result.doc.items.find((row) => row.id === id)?.label || item.label }));
  };

  const submitAdd = async (event) => {
    event.preventDefault();
    if (disabled || busy) return;
    const result = addRoutineItem(doc, adding);
    const ok = await persist(result);
    if (ok) setAdding('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete || disabled || busy) return;
    const ok = await persist(removeRoutineItem(doc, pendingDelete));
    if (ok) setPendingDelete(null);
  };

  const move = async (id, direction) => {
    if (disabled || busy) return;
    await persist(moveRoutineItem(doc, id, direction));
  };

  const locked = disabled || busy;

  return (
    <div data-testid="routine-checklist">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p id={labelId} className="text-sm font-semibold text-text-primary">שגרת בוקר שביצעתי</p>
        <button
          type="button"
          data-testid="routine-edit-toggle"
          aria-pressed={editing}
          disabled={locked}
          onClick={() => {
            setError('');
            setPendingDelete(null);
            setEditing((on) => !on);
          }}
          className={`h-9 px-2.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 ${focusCls} ${
            editing
              ? 'bg-accent-primary text-bg-primary'
              : 'text-accent-primary hover:text-accent-hover'
          }`}
        >
          {editing ? 'סיום' : 'עריכת הרשימה'}
        </button>
      </div>

      {editing && (
        <p className="text-[11px] text-text-muted leading-relaxed mb-2">
          השינוי נשמר לחשבון ומופיע גם בימים הבאים. סימוני ימים קודמים נשארים.
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-text-muted rounded-xl border border-dashed border-border-primary px-3 py-3">
          אין פריטים ברשימה. הוסיפו את הראשון.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-labelledby={labelId}>
          {items.map((item, index) => {
            const on = selected.includes(item.id);
            if (!editing) {
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    data-testid={`routine-item-${item.id}`}
                    disabled={locked}
                    onClick={() => toggle(item.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-right text-sm transition-colors cursor-pointer disabled:opacity-50 ${focusCls} ${
                      on
                        ? 'border-accent-primary/50 bg-accent-primary/8 text-text-primary'
                        : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-border-hover hover:text-text-primary'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${
                        on ? 'bg-accent-primary border-accent-primary' : 'border-text-muted'
                      }`}
                      aria-hidden
                    >
                      {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 break-words">{item.label}</span>
                  </button>
                </li>
              );
            }

            if (pendingDelete === item.id) {
              return (
                <li key={item.id} className="flex items-center gap-2 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2" data-testid={`routine-confirm-${item.id}`}>
                  <p className="min-w-0 flex-1 text-sm text-text-primary truncate">{item.label}</p>
                  <span className="text-xs text-text-secondary shrink-0">למחוק?</span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={confirmDelete}
                    className={`h-9 px-2.5 rounded-lg text-xs font-semibold text-loss cursor-pointer disabled:opacity-40 ${focusCls}`}
                  >
                    מחק
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setPendingDelete(null)}
                    className={`h-9 px-2.5 rounded-lg text-xs font-semibold text-text-secondary cursor-pointer disabled:opacity-40 ${focusCls}`}
                  >
                    ביטול
                  </button>
                </li>
              );
            }

            return (
              <li key={item.id} className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={on ? `בטל סימון: ${item.label}` : `סמן כבוצע: ${item.label}`}
                  data-testid={`routine-item-${item.id}`}
                  disabled={locked}
                  onClick={() => toggle(item.id)}
                  className={`w-9 h-9 shrink-0 rounded-lg border grid place-items-center cursor-pointer disabled:opacity-40 ${focusCls} ${
                    on ? 'bg-accent-primary border-accent-primary' : 'bg-bg-tertiary border-border-primary'
                  }`}
                >
                  {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} aria-hidden />}
                </button>
                <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={drafts[item.id] ?? item.label}
                  maxLength={ROUTINE_LABEL_MAX}
                  disabled={locked}
                  aria-label={`עריכת ${item.label}`}
                  data-testid={`routine-label-${item.id}`}
                  enterKeyHint="done"
                  autoComplete="off"
                  onChange={(event) => {
                    const value = event.target.value;
                    setDrafts((prev) => ({ ...prev, [item.id]: value }));
                    if (error) setError('');
                  }}
                  onBlur={() => { commitLabel(item.id); }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      setDrafts((prev) => ({ ...prev, [item.id]: item.label }));
                      event.currentTarget.blur();
                    }
                  }}
                  className={`${inputCls} h-9 py-0`}
                />
                </div>
                <button
                  type="button"
                  aria-label="הזז למעלה"
                  data-testid={`routine-up-${item.id}`}
                  disabled={locked || index === 0}
                  onClick={() => move(item.id, -1)}
                  className={`${iconBtn} ${focusCls}`}
                >
                  <ChevronUp className="w-4 h-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="הזז למטה"
                  data-testid={`routine-down-${item.id}`}
                  disabled={locked || index === items.length - 1}
                  onClick={() => move(item.id, 1)}
                  className={`${iconBtn} ${focusCls}`}
                >
                  <ChevronDown className="w-4 h-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`מחיקת ${item.label}`}
                  data-testid={`routine-delete-${item.id}`}
                  disabled={locked}
                  onClick={() => { setError(''); setPendingDelete(item.id); }}
                  className={`${iconBtn} hover:text-loss hover:border-loss/40 ${focusCls}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <form onSubmit={submitAdd} className="flex items-center gap-1.5 mt-2 min-w-0">
          <div className="min-w-0 flex-1">
          <input
            type="text"
            value={adding}
            maxLength={ROUTINE_LABEL_MAX}
            disabled={locked || items.length >= MAX_ROUTINE_ITEMS}
            placeholder="פריט חדש לשגרה"
            aria-label="פריט חדש לשגרה"
            data-testid="routine-add-input"
            enterKeyHint="done"
            autoComplete="off"
            onChange={(event) => {
              setAdding(event.target.value);
              if (error) setError('');
            }}
            className={`${inputCls} h-9 py-0`}
          />
          </div>
          <button
            type="submit"
            data-testid="routine-add-submit"
            disabled={locked || items.length >= MAX_ROUTINE_ITEMS}
            className={`h-9 px-3 shrink-0 rounded-xl bg-accent-primary text-bg-primary text-sm font-semibold cursor-pointer disabled:opacity-40 ${focusCls}`}
          >
            הוסף
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-loss" data-testid="routine-error">{error}</p>
      )}
    </div>
  );
}
