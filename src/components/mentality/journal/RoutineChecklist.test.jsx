// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import RoutineChecklist from './RoutineChecklist';
import { normalizeRoutineDoc, storedRoutineDoc } from '../../../utils/morningRoutine';

function Harness({ initialChecked = ['news', 'ghost'] }) {
  const [doc, setDoc] = useState(() => storedRoutineDoc(normalizeRoutineDoc(null)));
  const [checked, setChecked] = useState(initialChecked);
  return (
    <div dir="rtl">
      <RoutineChecklist
        doc={doc}
        checked={checked}
        onCheckedChange={setChecked}
        onReplace={async (next) => { setDoc(storedRoutineDoc(next)); }}
      />
      <output data-testid="checked">{checked.join(',')}</output>
    </div>
  );
}

async function render(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(node); });
  return {
    host,
    async unmount() {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('RoutineChecklist', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('checks the seeded list and leaves an unknown id untouched', async () => {
    const view = await render(<Harness />);
    expect(view.host.querySelector('[data-testid="routine-checklist"]').textContent).toContain('בדיקת חדשות כלכליות');
    expect(view.host.querySelector('[data-testid="routine-checklist"]').textContent).toContain('תכנון עסקאות');
    const news = view.host.querySelector('[data-testid="routine-item-news"]');
    expect(news.getAttribute('aria-checked')).toBe('true');
    await act(async () => { news.click(); });
    expect(view.host.querySelector('[data-testid="checked"]').textContent).toBe('ghost');
    expect(view.host.querySelector('[data-testid="routine-checklist"]').textContent).not.toContain('ghost');
    await view.unmount();
  });

  it('renames, adds, reorders, and deletes with a confirm', async () => {
    const view = await render(<Harness initialChecked={['meditation']} />);
    await act(async () => { view.host.querySelector('[data-testid="routine-edit-toggle"]').click(); });
    const charts = view.host.querySelector('[data-testid="routine-label-charts"]');
    await act(async () => { typeInto(charts, 'סקירת גרף יומי'); });
    await act(async () => { charts.dispatchEvent(new FocusEvent('blur', { bubbles: true })); });
    expect(view.host.querySelector('[data-testid="routine-label-charts"]').value).toBe('סקירת גרף יומי');

    const add = view.host.querySelector('[data-testid="routine-add-input"]');
    await act(async () => { typeInto(add, 'כוס מים'); });
    await act(async () => { view.host.querySelector('[data-testid="routine-add-submit"]').click(); });
    expect(view.host.querySelector('[data-testid="routine-label-r1"]').value).toBe('כוס מים');

    await act(async () => { view.host.querySelector('[data-testid="routine-up-r1"]').click(); });
    const labels = [...view.host.querySelectorAll('[data-testid^="routine-label-"]')].map((input) => input.value);
    expect(labels.at(-1)).not.toBe('כוס מים');
    expect(labels.at(-2)).toBe('כוס מים');

    await act(async () => { view.host.querySelector('[data-testid="routine-delete-meditation"]').click(); });
    expect(view.host.querySelector('[data-testid="routine-confirm-meditation"]').textContent).toContain('למחוק?');
    await act(async () => {
      [...view.host.querySelectorAll('button')].find((button) => button.textContent === 'מחק').click();
    });
    expect(view.host.querySelector('[data-testid="routine-label-meditation"]')).toBeNull();
    expect(view.host.querySelector('[data-testid="checked"]').textContent).toBe('meditation');

    await act(async () => { view.host.querySelector('[data-testid="routine-add-submit"]').click(); });
    expect(view.host.querySelector('[data-testid="routine-error"]').textContent).toMatch(/80/);
    await view.unmount();
  });
});
