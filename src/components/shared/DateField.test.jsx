// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import DateField from './DateField';
import { localDayKey } from '../../utils/calculations';

function render(ui) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => { root.render(ui); });
  return {
    el,
    unmount() {
      act(() => { root.unmount(); });
      el.remove();
    },
  };
}

function click(node) {
  act(() => { node.click(); });
}

describe('DateField', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.documentElement.dir = 'rtl';
  });

  it('uses the filter-chip metrics and no native date input', () => {
    const view = render(<DateField id="from" label="מתאריך" value="" onChange={() => {}} />);
    const btn = document.getElementById('from');
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('py-1.5');
    expect(btn.className).toContain('text-xs');
    expect(btn.className).toContain('font-medium');
    expect(btn.className).toContain('rounded-lg');
    expect(btn.className).not.toContain('h-8');
    expect(btn.className).not.toContain('text-sm');
    expect(btn.textContent).toContain('מתאריך');
    view.unmount();
  });

  it('sizes a form field like the sibling text inputs', () => {
    const view = render(
      <DateField id="start" size="field" label="תאריך תחילת האתגר" value="2026-08-01" onChange={() => {}} />,
    );
    const btn = document.getElementById('start');
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('py-2');
    expect(btn.className).toContain('text-sm');
    expect(btn.className).not.toContain('py-1.5');
    expect(btn.textContent).toContain('01.08.2026');
    view.unmount();
  });

  it('selects a day as YYYY-MM-DD and can clear it', () => {
    const onChange = vi.fn();
    const view = render(<DateField id="from" label="מתאריך" value="2026-03-01" onChange={onChange} />);
    click(document.getElementById('from'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.textContent).toContain('מרץ');
    expect(dialog.textContent).toContain('2026');

    click(dialog.querySelector('[aria-label="15 במרץ 2026"]'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    view.unmount();
    const filled = render(<DateField id="from" label="מתאריך" value="2026-03-15" onChange={onChange} />);
    click(document.getElementById('from'));
    click([...document.querySelectorAll('button')].find((b) => b.textContent === 'נקה'));
    expect(onChange).toHaveBeenLastCalledWith('');
    filled.unmount();
  });

  it('highlights today in the open month', () => {
    const today = localDayKey(new Date());
    const view = render(<DateField id="from" label="מתאריך" value={today} onChange={() => {}} />);
    click(document.getElementById('from'));
    const marked = document.querySelector('[role="dialog"] [data-today="true"]');
    expect(marked).toBeTruthy();
    expect(marked.getAttribute('data-iso')).toBe(today);
    expect(marked.getAttribute('aria-current')).toBe('date');
    view.unmount();
  });

  it('blocks days outside min/max and walks months', () => {
    const onChange = vi.fn();
    const view = render(
      <DateField id="to" label="עד תאריך" value="2026-03-15" min="2026-03-10" max="2026-03-20" onChange={onChange} />,
    );
    click(document.getElementById('to'));
    const dialog = document.querySelector('[role="dialog"]');
    const early = dialog.querySelector('[aria-label="9 במרץ 2026"]');
    const late = dialog.querySelector('[aria-label="21 במרץ 2026"]');
    expect(early.disabled).toBe(true);
    expect(late.disabled).toBe(true);
    click(early);
    expect(onChange).not.toHaveBeenCalled();

    click(dialog.querySelector('[aria-label="חודש הבא"]'));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('אפריל');
    click(document.querySelector('[aria-label="חודש קודם"]'));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('מרץ');
    view.unmount();
  });

  it('closes on Escape without the key reaching a parent', () => {
    let escaped = 0;
    const onDoc = (e) => { if (e.key === 'Escape') escaped += 1; };
    document.addEventListener('keydown', onDoc);
    const view = render(<DateField id="from" label="מתאריך" value="2026-03-15" onChange={() => {}} />);
    click(document.getElementById('from'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(escaped).toBe(0);
    document.removeEventListener('keydown', onDoc);
    view.unmount();
  });

  it('chooses the focused day with the arrow keys and Enter', () => {
    const onChange = vi.fn();
    const view = render(<DateField id="from" label="מתאריך" value="2026-03-15" onChange={onChange} />);
    click(document.getElementById('from'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onChange).toHaveBeenCalledWith('2026-03-16');
    view.unmount();
  });
});
