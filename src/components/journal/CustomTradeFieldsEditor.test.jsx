// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { addCustomField } from '../../utils/customTradeFields';
import { useCustomTradeFieldEditor } from './CustomTradeFieldsEditor';

vi.mock('../shared/ConfirmDialog', () => ({
  default: function Confirm({ isOpen, title, message, onConfirm, onClose, confirmText }) {
    if (!isOpen) return null;
    return (
      <div role="alertdialog">
        <p>{title}</p>
        <p>{message}</p>
        <button type="button" onClick={async () => {
          try {
            await onConfirm();
            onClose();
          } catch {
            // A failed save leaves the confirm open.
          }
        }}
        >
          {confirmText}
        </button>
        <button type="button" onClick={onClose}>ביטול</button>
      </div>
    );
  },
}));

function Host({
  doc = { fields: [], seq: 0 },
  fields = [],
  ready = true,
  onSave,
}) {
  const ui = useCustomTradeFieldEditor({
    doc, fields, ready, onSave, active: true,
  });
  return (
    <div>
      {ui.trigger}
      {ui.panel}
      <div data-testid="custom-trade-fields">
        {fields.map((field) => (
          <div key={field.id}>
            <span>{field.name}</span>
            {ui.fieldActions(field)}
          </div>
        ))}
      </div>
      {ui.confirm}
    </div>
  );
}

async function mount(props) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<Host {...props} />); });
  return {
    el,
    rerender: async (next) => {
      await act(async () => { root.render(<Host {...next} />); });
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

function typeInto(input, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonNamed(text) {
  return [...document.querySelectorAll('button')].find((button) => button.textContent.includes(text));
}

describe('custom fields on the trade form', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows the example only after opening, and the name error only after an add attempt', async () => {
    const onSave = vi.fn(async (next) => next);
    const view = await mount({ onSave });
    expect(view.el.textContent).toContain('+ שדה משלך');
    expect(view.el.textContent).not.toContain('למשל: סטאפ — Breakout / Pullback');
    expect(view.el.querySelector('[role="alert"]')).toBeNull();

    await act(async () => { buttonNamed('+ שדה משלך').click(); });
    expect(view.el.textContent).toContain('למשל: סטאפ — Breakout / Pullback');
    expect(view.el.querySelector('[role="alert"]')).toBeNull();

    const add = () => buttonNamed('הוספת שדה');
    expect(add().disabled).toBe(false);
    await act(async () => { add().click(); });
    expect(view.el.querySelector('[role="alert"]').textContent).toBe('צריך שם עד 40 תווים');
    expect(onSave).not.toHaveBeenCalled();

    const name = () => view.el.querySelector('[aria-label="שם השדה"]');
    await act(async () => { typeInto(name(), 'סטאפ'); });
    expect(view.el.querySelector('[role="alert"]')).toBeNull();

    await act(async () => { typeInto(name(), 'א'.repeat(41)); });
    expect(view.el.querySelector('[role="alert"]').textContent).toBe('צריך שם עד 40 תווים');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => { typeInto(name(), 'א'.repeat(40)); });
    expect(view.el.querySelector('[role="alert"]')).toBeNull();
    await view.cleanup();
  });

  it('lets Premium add a select field and refuses a 13th', async () => {
    const onSave = vi.fn(async (next) => next);
    const view = await mount({ onSave });
    await act(async () => { buttonNamed('+ שדה משלך').click(); });
    await act(async () => { typeInto(view.el.querySelector('[aria-label="שם השדה"]'), 'סטאפ'); });
    const select = [...view.el.querySelectorAll('[role="radio"]')].find((node) => node.textContent === 'בחירה');
    await act(async () => { select.click(); });
    await act(async () => { buttonNamed('הוספת שדה').click(); });
    expect(view.el.querySelector('[role="alert"]').textContent).toBe('לבחירה צריך לפחות אפשרות אחת');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => { typeInto(view.el.querySelector('[aria-label="אפשרויות בחירה"]'), 'Breakout, Pullback'); });
    await act(async () => { buttonNamed('הוספת שדה').click(); });
    expect(onSave).toHaveBeenCalledWith({
      fields: [{ id: 'f1', name: 'סטאפ', type: 'select', options: ['Breakout', 'Pullback'] }],
      seq: 1,
    });

    let full = { fields: [], seq: 0 };
    for (let i = 0; i < 12; i += 1) {
      full = addCustomField(full, { name: `שדה ${i + 1}`, type: 'text' });
    }
    onSave.mockClear();
    await view.rerender({ onSave, doc: full, fields: full.fields });
    await act(async () => { buttonNamed('+ שדה משלך').click(); });
    await act(async () => { typeInto(view.el.querySelector('[aria-label="שם השדה"]'), 'עוד אחד'); });
    await act(async () => { buttonNamed('הוספת שדה').click(); });
    expect(view.el.querySelector('[role="alert"]').textContent).toBe('אפשר עד 12 שדות');
    expect(onSave).not.toHaveBeenCalled();
    await view.cleanup();
  });

  it('edits a field without changing its id, and deletes only after confirm', async () => {
    const onSave = vi.fn(async (next) => next);
    const doc = {
      fields: [{ id: 'f1', name: 'סשן', type: 'text' }],
      seq: 1,
    };
    const view = await mount({ onSave, doc, fields: doc.fields });
    expect(view.el.querySelector('[aria-label="מחיקת סשן"]')).toBeTruthy();

    await act(async () => { view.el.querySelector('[aria-label="עריכת סשן"]').click(); });
    expect(view.el.textContent).toContain('למשל: סטאפ — Breakout / Pullback');
    const name = view.el.querySelector('[aria-label="שם השדה"]');
    expect(name.value).toBe('סשן');
    await act(async () => { typeInto(name, 'סטאפ'); });
    const select = [...view.el.querySelectorAll('[role="radio"]')].find((node) => node.textContent === 'בחירה');
    await act(async () => { select.click(); });
    await act(async () => { typeInto(view.el.querySelector('[aria-label="אפשרויות בחירה"]'), 'Breakout / Pullback'); });
    await act(async () => { buttonNamed('שמירת שדה').click(); });
    expect(onSave).toHaveBeenCalledWith({
      fields: [{ id: 'f1', name: 'סטאפ', type: 'select', options: ['Breakout', 'Pullback'] }],
      seq: 1,
    });

    onSave.mockClear();
    await act(async () => { view.el.querySelector('[aria-label="מחיקת סשן"]').click(); });
    expect(onSave).not.toHaveBeenCalled();
    expect(view.el.querySelector('[role="alertdialog"]').textContent).toContain('למחוק את השדה?');
    await act(async () => { buttonNamed('ביטול').click(); });
    expect(onSave).not.toHaveBeenCalled();
    expect(view.el.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => { view.el.querySelector('[aria-label="מחיקת סשן"]').click(); });
    await act(async () => { buttonNamed('מחק').click(); });
    expect(onSave).toHaveBeenCalledWith({ fields: [], seq: 1 });
    await view.cleanup();
  });

  it('lets a free account add, edit, and delete a field', async () => {
    const onSave = vi.fn(async (next) => next);
    const doc = { fields: [{ id: 'f1', name: 'סשן', type: 'text' }], seq: 1 };
    const view = await mount({ onSave, doc, fields: doc.fields });
    expect(view.el.textContent).not.toContain('שדרג ל-Premium');
    expect(view.el.querySelector('[aria-label="מחיקת סשן"]')).toBeTruthy();
    expect(view.el.querySelector('[aria-label="עריכת סשן"]')).toBeTruthy();

    await act(async () => { buttonNamed('+ שדה משלך').click(); });
    expect(view.el.querySelector('[data-testid="custom-field-form"]')).toBeTruthy();
    expect(view.el.querySelector('[data-testid="custom-field-upgrade"]')).toBeNull();
    await act(async () => { typeInto(view.el.querySelector('[aria-label="שם השדה"]'), 'הערה'); });
    await act(async () => { buttonNamed('הוספת שדה').click(); });
    expect(onSave).toHaveBeenCalledWith({
      fields: [
        { id: 'f1', name: 'סשן', type: 'text' },
        { id: 'f2', name: 'הערה', type: 'text' },
      ],
      seq: 2,
    });
    await view.cleanup();
  });
});
