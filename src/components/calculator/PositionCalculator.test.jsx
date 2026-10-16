// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PositionCalculator from './PositionCalculator';

const mexc = {
  id: 'j-mexc', name: 'MEXC', exchange: 'mexc', initialBalance: 50,
  riskType: 'percent', riskValue: 1,
};
const bybit = {
  id: 'j-bybit', name: 'סקלפינג', exchange: 'bybit', initialBalance: 80.456,
  riskType: 'fixed', riskValue: 25,
};

let wallets = { mexc: 394.14223635, bybit: 1000.2 };
let ctx = { journals: [mexc, bybit], activeJournal: mexc };

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ctx,
}));

vi.mock('../../hooks/useLinkedExchangeBalance', () => ({
  useLinkedExchangeBalance: (id) => (id ? (wallets[id] ?? null) : null),
}));

function tree(open = true) {
  return (
    <MemoryRouter>
      <PositionCalculator isOpen={open} onClose={() => {}} />
    </MemoryRouter>
  );
}

async function mount(open = true) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(tree(open)); });
  return {
    rerender: async (nextOpen = true) => {
      await act(async () => { root.render(tree(nextOpen)); });
    },
    balance: () => document.getElementById('calc-balance'),
    journal: () => document.getElementById('calc-journal'),
    pickJournal: async (label) => {
      await act(async () => { document.getElementById('calc-journal').click(); });
      const option = [...document.querySelectorAll('[role="option"]')].find((el) => el.textContent === label);
      await act(async () => { option.click(); });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('position calculator balance', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('fills the app-selected journal and rounds the wallet to 2 decimals', async () => {
    wallets = { mexc: 394.14223635, bybit: 1000.2 };
    ctx = { journals: [mexc, bybit], activeJournal: mexc };
    const view = await mount();
    const select = view.journal();
    expect(select.tagName).toBe('BUTTON');
    expect(select.getAttribute('aria-haspopup')).toBe('listbox');
    expect(select.textContent).toContain('MEXC');
    expect(document.querySelector('select')).toBeNull();
    await act(async () => { select.click(); });
    const options = [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent);
    expect(options).toEqual(['MEXC', 'סקלפינג · Bybit']);
    expect(view.balance().value).toBe('394.14');
    expect(document.body.textContent).toContain('ארנק MEXC');
    await view.unmount();
  });

  it('switches the balance and the risk settings to the other journal', async () => {
    wallets = { mexc: 394.14223635, bybit: null };
    ctx = { journals: [mexc, bybit], activeJournal: mexc };
    const view = await mount();
    await view.pickJournal('סקלפינג · Bybit');
    expect(view.journal().textContent).toContain('סקלפינג');
    expect(view.balance().value).toBe('80.46');
    expect(document.body.textContent).toContain('יתרה התחלתית · סקלפינג · Bybit');
    const risk = document.querySelector('input[placeholder="50"]');
    expect(risk.value).toBe('25');
    await view.unmount();
  });

  it('does not overwrite a balance the user typed when the wallet refreshes', async () => {
    wallets = { mexc: 394.14223635 };
    ctx = { journals: [mexc], activeJournal: mexc };
    const view = await mount();
    expect(view.journal()).toBeNull();
    expect(document.querySelector('[data-testid="calculator-journal"]').textContent).toContain('MEXC');
    const input = view.balance();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '500');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.balance().value).toBe('500');
    wallets = { mexc: 999.999 };
    await view.rerender(true);
    expect(view.balance().value).toBe('500');
    await view.unmount();
  });

  it('leaves the field empty when that journal has no balance', async () => {
    wallets = { mexc: null };
    ctx = { journals: [{ ...mexc, initialBalance: 0 }], activeJournal: { ...mexc, initialBalance: 0 } };
    const view = await mount();
    expect(view.balance().value).toBe('');
    expect(view.balance().getAttribute('placeholder')).toBe('הזן יתרה');
    await view.unmount();
  });

  it('defaults again to the app journal the next time the calculator opens', async () => {
    wallets = { mexc: 394.14223635, bybit: 1000.2 };
    ctx = { journals: [mexc, bybit], activeJournal: mexc };
    const view = await mount();
    await view.pickJournal('סקלפינג · Bybit');
    expect(view.balance().value).toBe('1000.20');
    await view.rerender(false);
    await view.rerender(true);
    expect(view.journal().textContent).toContain('MEXC');
    expect(view.balance().value).toBe('394.14');
    await view.unmount();
  });
});
