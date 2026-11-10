// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CustomTradeFieldsSettings from './CustomTradeFieldsSettings';

const saveDoc = vi.fn(async (next) => next);
let auth = { isPremium: false };
let fieldsState = { doc: { fields: [], seq: 0 }, fields: [], ready: true, saveDoc };

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../hooks/useCustomTradeFields', () => ({
  useCustomTradeFields: () => fieldsState,
}));

async function mount() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CustomTradeFieldsSettings />
      </MemoryRouter>,
    );
  });
  return {
    el,
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

describe('custom field settings', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows saved fields to a free user and does not offer a new field', async () => {
    auth = { isPremium: false };
    fieldsState = {
      doc: { fields: [{ id: 'f1', name: 'סשן', type: 'text' }], seq: 1 },
      fields: [{ id: 'f1', name: 'סשן', type: 'text' }],
      ready: true,
      saveDoc,
    };
    const view = await mount();
    expect(view.el.textContent).toContain('שדות נוספים לעסקה');
    expect(view.el.textContent).toContain('הוסף שדות משלך לטופס העסקה');
    expect(view.el.textContent).toContain('סשן');
    expect(view.el.textContent).not.toContain('שדות מותאמים');
    expect(view.el.querySelector('[data-testid="custom-field-form"]')).toBeNull();
    expect(view.el.querySelector('[aria-label="מחיקת סשן"]')).toBeNull();
    expect(view.el.textContent).toContain('שדרג ל-Premium');
    await view.cleanup();
  });

  it('lets Premium define a field', async () => {
    auth = { isPremium: true };
    saveDoc.mockClear();
    fieldsState = { doc: { fields: [], seq: 0 }, fields: [], ready: true, saveDoc };
    const view = await mount();
    expect(view.el.textContent).toContain('עוד לא הוספת שדות.');
    expect(view.el.textContent).toContain('סטאפ (בחירה)');
    const name = view.el.querySelector('[aria-label="שם השדה"]');
    expect(name.getAttribute('placeholder')).toBe('שם השדה, למשל: סטאפ');
    await act(async () => { typeInto(name, 'סשן'); });
    const number = [...view.el.querySelectorAll('[role="radio"]')].find((node) => node.textContent === 'מספר');
    await act(async () => { number.click(); });
    const form = view.el.querySelector('[data-testid="custom-field-form"]');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(saveDoc).toHaveBeenCalledWith({
      fields: [{ id: 'f1', name: 'סשן', type: 'number' }],
      seq: 1,
    });
    await view.cleanup();
  });
});
