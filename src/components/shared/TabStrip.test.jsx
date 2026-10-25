// @vitest-environment happy-dom
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import TabStrip from './TabStrip';

const originalRect = Element.prototype.getBoundingClientRect;

function rect(left, top, width, height) {
  return {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() { return {}; },
  };
}

function mount(ui) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  return {
    el,
    render: async (node) => { await act(async () => { root.render(node); }); },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('sliding tab pill', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.getAttribute?.('role') === 'tablist') return rect(10, 20, 400, 40);
      const id = this.getAttribute?.('data-tab-id');
      // Physical boxes, as RTL flex would report them: the first tab sits on
      // the right, the second further left. The pill must follow the box,
      // not assume the document direction.
      if (id === 'trades') return rect(210, 24, 90, 32);
      if (id === 'exchange') return rect(40, 24, 120, 32);
      return rect(0, 0, 0, 0);
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it('slides the blue pill to the selected tab using physical coordinates', async () => {
    const view = mount(null);
    const tabs = [
      { id: 'trades', label: 'עסקאות' },
      { id: 'exchange', label: 'בורסה' },
    ];
    let value = 'trades';
    const render = () => view.render(
      <TabStrip tabs={tabs} value={value} onChange={(id) => { value = id; }} layoutKey="journal-tab" />,
    );
    await render();
    const pill = () => view.el.querySelector('[data-tab-pill]');
    expect(pill()).toBeTruthy();
    expect(pill().className).toContain('bg-accent-primary/15');
    expect(pill().style.transform).toBe('translate3d(200px, 4px, 0)');
    expect(view.el.querySelector('[aria-selected="true"]').textContent).toBe('עסקאות');

    value = 'exchange';
    await render();
    expect(pill().style.transform).toBe('translate3d(30px, 4px, 0)');
    expect(pill().style.width).toBe('120px');
    expect(view.el.querySelector('[data-layout-key]').getAttribute('data-layout-key')).toBe('journal-tab');
    await view.cleanup();
  });

  it('keeps an underline strip free of the pill', async () => {
    const view = mount(null);
    await view.render(
      <TabStrip
        variant="underline"
        tabs={[{ id: 'a', label: 'א' }, { id: 'b', label: 'ב' }]}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(view.el.querySelector('[data-tab-pill]')).toBeNull();
    expect(view.el.querySelector('[aria-selected="true"]').className).toContain('border-accent-primary');
    await view.cleanup();
  });
});
