// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import Modal from './Modal';
import MultiSelector from './MultiSelector';

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('MultiSelector dismiss', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('closes on an outside press and on Escape without closing the dialog', () => {
    const onClose = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => {
      root.render(
        <Modal isOpen onClose={onClose} title="עסקה">
          <MultiSelector values={[]} onChange={() => {}} options={['Spring', 'LPS']} placeholder="סטאפ" />
        </Modal>,
      );
    });
    const trigger = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('סטאפ'));
    click(trigger);
    const option = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Spring');
    expect(option).toBeTruthy();

    const overlay = document.querySelector('[data-popover]');
    expect(overlay).toBeTruthy();
    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect([...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Spring')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    click(trigger);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect([...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Spring')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    act(() => { root.unmount(); });
    el.remove();
  });
});
