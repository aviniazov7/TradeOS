// @vitest-environment happy-dom
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import EquityCurveChart from './EquityCurveChart';

const originalRect = Element.prototype.getBoundingClientRect;
const OriginalObserver = globalThis.ResizeObserver;

// Percentage heights report 0, the way desktop Safari does for this card.
// A definite pixel height reports that height, so a regression back to
// height:100% inside the flex column fails this test.
function rectFor(el) {
  const raw = el.style?.height || '';
  const height = raw.endsWith('px') ? parseFloat(raw) : 0;
  const width = 960;
  return {
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON() { return {}; },
  };
}

function points(n) {
  let equity = 400;
  const out = [];
  for (let i = 0; i < n; i++) {
    equity += ((i * 17) % 11) - 5;
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
    out.push({ date: `${day}/${month}`, equity: Math.round(equity * 100) / 100, drawdown: 0 });
  }
  return out;
}

async function mount(data) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<EquityCurveChart data={data} />); });
  return {
    el,
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('equity curve chart', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return rectFor(this);
    };
    globalThis.ResizeObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(target) {
        const box = rectFor(target);
        this.cb([{ target, contentRect: box }]);
      }
      unobserve() {}
      disconnect() {}
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
    globalThis.ResizeObserver = OriginalObserver;
  });

  it('draws the curve for a full journal instead of collapsing to 0 height', async () => {
    const data = points(111);
    const view = await mount(data);
    const plot = view.el.querySelector('[data-testid="equity-curve-plot"]');
    const box = view.el.querySelector('.recharts-responsive-container');
    expect(plot.style.height).toBe('260px');
    expect(box.style.height).toBe('260px');
    expect(box.style.height).not.toBe('100%');
    const curve = view.el.querySelector('.recharts-area-curve');
    expect(curve).not.toBeNull();
    expect(curve.getAttribute('d').length).toBeGreaterThan(20);
    expect(view.el.textContent).not.toContain('נדרשות לפחות 2');
    await view.unmount();
  });

  it('still explains an empty journal', async () => {
    const view = await mount([{ date: '01/01', equity: 10 }]);
    expect(view.el.textContent).toContain('נדרשות לפחות 2 עסקאות סגורות');
    expect(view.el.querySelector('.recharts-area-curve')).toBeNull();
    await view.unmount();
  });
});
