// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import ExchangeSearch from './ExchangeSearch';

describe('ExchangeSearch Vantage', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function render(props = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const onChange = props.onChange || (() => {});
    await act(async () => { root.render(<ExchangeSearch value="" onChange={onChange} {...props} />); });
    return {
      el,
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  async function type(input, value) {
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('finds Vantage from the shared broker list and uses the local mark', async () => {
    document.documentElement.classList.remove('light');
    const view = await render();
    const input = view.el.querySelector('input');
    await type(input, 'vantage');
    expect(view.el.textContent).toContain('Vantage');
    expect(view.el.textContent).toContain('ברוקרים');
    const img = view.el.querySelector('img');
    expect(img.getAttribute('src')).toBe('/logos/exchanges/vantage.svg');
    expect(img.closest('span').className).not.toContain('bg-white/10');
    const option = [...view.el.querySelectorAll('button')].find((b) => b.textContent.includes('Vantage'));
    expect(option).toBeTruthy();
    await view.unmount();
  });
});
