// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import Modal from './Modal';

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

function backdrop() {
  return document.querySelector('.bg-black\\/55');
}

function pointer(type, target) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }));
  });
}

function escape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('Modal dismiss', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('closes when a press starts and ends on the backdrop', () => {
    const onClose = vi.fn();
    const view = render(<Modal isOpen onClose={onClose} title="בדיקה"><p>גוף</p></Modal>);
    const dim = backdrop();
    pointer('pointerdown', dim);
    pointer('pointerup', dim);
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does not close when the press started inside the dialog', () => {
    const onClose = vi.fn();
    const view = render(<Modal isOpen onClose={onClose} title="בדיקה"><p>גוף</p></Modal>);
    pointer('pointerdown', document.querySelector('[role="dialog"]'));
    pointer('pointerup', backdrop());
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not close while a popover is open', () => {
    const onClose = vi.fn();
    const pop = document.createElement('div');
    pop.setAttribute('data-popover', '');
    document.body.appendChild(pop);
    const view = render(<Modal isOpen onClose={onClose} title="בדיקה"><p>גוף</p></Modal>);
    const dim = backdrop();
    pointer('pointerdown', dim);
    pointer('pointerup', dim);
    escape();
    expect(onClose).not.toHaveBeenCalled();
    pop.remove();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('closes on Escape when nothing else is open', () => {
    const onClose = vi.fn();
    const view = render(<Modal isOpen onClose={onClose} title="בדיקה"><p>גוף</p></Modal>);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
