// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import SelectDropdown from './SelectDropdown';

function render(ui) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => { root.render(ui); });
  return {
    unmount() {
      act(() => { root.unmount(); });
      el.remove();
    },
  };
}

const options = [
  { value: 'a', label: 'אחת' },
  { value: 'b', label: 'שתיים' },
];

function key(target, keyName) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
  });
}

describe('SelectDropdown', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('opens from the keyboard and chooses the next row with Enter', () => {
    const onChange = vi.fn();
    const view = render(
      <SelectDropdown id="pick" ariaLabel="בחירה" value="a" onChange={onChange} options={options} />,
    );
    const btn = document.getElementById('pick');
    key(btn, 'ArrowDown');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="listbox"]')).toBeTruthy();
    key(document, 'ArrowDown');
    key(document, 'Enter');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    view.unmount();
  });

  it('closes on Escape without the key reaching a parent dialog', () => {
    const onChange = vi.fn();
    let escaped = 0;
    const onDoc = (e) => { if (e.key === 'Escape') escaped += 1; };
    document.addEventListener('keydown', onDoc);
    const view = render(
      <SelectDropdown id="pick" ariaLabel="בחירה" value="a" onChange={onChange} options={options} />,
    );
    act(() => { document.getElementById('pick').click(); });
    key(document, 'Escape');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(escaped).toBe(0);
    document.removeEventListener('keydown', onDoc);
    view.unmount();
  });
});
