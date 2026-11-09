// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const state = vi.hoisted(() => ({
  journal: {
    id: 'j1',
    name: 'MEXC',
    exchange: 'mexc',
    assetClass: 'crypto',
    initialBalance: 10000,
  },
  updateJournal: vi.fn(async () => {}),
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});
vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    journals: [state.journal, { id: 'j2', name: 'שני' }],
    activeJournal: state.journal,
    activeJournalId: 'j1',
    updateJournal: state.updateJournal,
    deleteJournal: vi.fn(async () => {}),
    archiveJournal: vi.fn(async () => {}),
  }),
}));

import toast from 'react-hot-toast';
import JournalSettingsModal from './JournalSettingsModal';

const freshJournal = () => ({
  id: 'j1',
  name: 'MEXC',
  exchange: 'mexc',
  assetClass: 'crypto',
  initialBalance: 10000,
});

describe('journal risk rules settings', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => {
    state.journal = freshJournal();
    state.updateJournal.mockClear();
    toast.mockClear();
    toast.success.mockClear();
    toast.error.mockClear();
  });

  async function render(props = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<JournalSettingsModal isOpen onClose={() => {}} {...props} />);
    });
    return {
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  function switches() {
    return [...document.querySelectorAll('[data-testid="journal-risk-rules"] input[type="checkbox"]')];
  }

  async function typeInto(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function save() {
    const button = document.querySelector('button[type="submit"]');
    await act(async () => { button.click(); });
  }

  it('keeps every rule off and does not write riskRules when nothing was enabled', async () => {
    const view = await render();
    const boxes = switches();
    expect(boxes).toHaveLength(5);
    expect(boxes.every((box) => box.checked === false)).toBe(true);
    expect(document.querySelector('[data-testid="journal-risk-rules"] input[type="number"]')).toBeNull();
    expect(document.body.textContent).toContain('הרישום נשאר פתוח');
    expect(document.body.textContent).toContain('אפשר להסתיר את הבאנר להיום');
    await save();
    expect(state.updateJournal).toHaveBeenCalledOnce();
    const payload = state.updateJournal.mock.calls[0][1];
    expect(payload).not.toHaveProperty('riskRules');
    expect(payload.name).toBe('MEXC');
    await view.unmount();
  });

  it('saves the rules that were switched on, and leaves the others off', async () => {
    const view = await render();
    await act(async () => { document.querySelector('[data-testid="journal-risk-weekly-loss-on"]').click(); });
    await act(async () => { document.querySelector('[data-testid="journal-risk-max-trades-on"]').click(); });
    await typeInto(document.querySelector('[data-testid="journal-risk-weekly-loss"]'), '250');
    await typeInto(document.querySelector('[data-testid="journal-risk-max-trades"]'), '4');
    await save();
    expect(state.updateJournal.mock.calls[0][0]).toBe('j1');
    expect(state.updateJournal.mock.calls[0][1].riskRules).toEqual({
      weeklyLoss: { enabled: true, amount: 250 },
      dailyLossPercent: { enabled: false, percent: null },
      weeklyLossPercent: { enabled: false, percent: null },
      maxTradesPerDay: { enabled: true, count: 4 },
      tradingHours: { enabled: false, start: null, end: null },
    });
    await view.unmount();
  });

  it('loads stored rules and can switch one off without dropping its value', async () => {
    state.journal = {
      ...freshJournal(),
      riskRules: {
        weeklyLoss: { enabled: true, amount: 250 },
        maxTradesPerDay: { enabled: true, count: 4 },
      },
    };
    const view = await render();
    const weekly = document.querySelector('[data-testid="journal-risk-weekly-loss-on"]');
    const trades = document.querySelector('[data-testid="journal-risk-max-trades-on"]');
    expect(weekly.checked).toBe(true);
    expect(trades.checked).toBe(true);
    expect(document.querySelector('[data-testid="journal-risk-weekly-loss"]').value).toBe('250');
    await act(async () => { weekly.click(); });
    await save();
    expect(state.updateJournal.mock.calls[0][1].riskRules.weeklyLoss).toEqual({ enabled: false, amount: 250 });
    expect(state.updateJournal.mock.calls[0][1].riskRules.maxTradesPerDay).toEqual({ enabled: true, count: 4 });
    await view.unmount();
  });

  it('does not store a rule that was switched on without a value', async () => {
    const view = await render();
    await act(async () => { document.querySelector('[data-testid="journal-risk-daily-percent-on"]').click(); });
    await save();
    expect(state.updateJournal.mock.calls[0][1]).not.toHaveProperty('riskRules');
    expect(toast.error).toHaveBeenCalledWith('הזינו ערך תקין לכלל שהפעלתם');
    await view.unmount();
  });

  it('does not save risk rules while demo mode is on', async () => {
    const view = await render({ demoActive: true });
    await act(async () => { document.querySelector('[data-testid="journal-risk-max-trades-on"]').click(); });
    await typeInto(document.querySelector('[data-testid="journal-risk-max-trades"]'), '3');
    await save();
    expect(state.updateJournal.mock.calls[0][1]).not.toHaveProperty('riskRules');
    expect(toast).toHaveBeenCalledWith('במצב דמו כללי הסיכון לא נשמרים.');
    await view.unmount();
  });
});
