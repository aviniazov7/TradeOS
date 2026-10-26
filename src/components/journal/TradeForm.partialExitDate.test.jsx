// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import TradeForm from './TradeForm';

vi.mock('../../hooks/useUserStrategies', () => ({
  useUserStrategies: () => ({ allStrategies: [], addStrategy: () => {}, removeStrategy: () => {} }),
}));
vi.mock('../../hooks/useUserTimeframes', () => ({
  useUserTimeframes: () => ({ allTimeframes: [], addTimeframe: () => {}, removeTimeframe: () => {} }),
}));
vi.mock('../../hooks/useUserTriggers', () => ({
  useUserTriggers: () => ({ allTriggers: [], addTrigger: () => {}, removeTrigger: () => {} }),
}));
vi.mock('../../hooks/useUserTags', () => ({
  useUserTags: () => ({ allTags: [], addTag: () => {}, removeTag: () => {} }),
}));
vi.mock('../../hooks/useUserSetups', () => ({
  useUserSetups: () => ({ allSetups: [], addSetup: () => {}, removeSetup: () => {} }),
}));
vi.mock('../../hooks/useUserMistakes', () => ({
  useUserMistakes: () => ({ allMistakes: [], addMistake: () => {}, removeMistake: () => {} }),
}));
vi.mock('../../hooks/useTradingPlans', () => ({
  useTradingPlans: () => ({ plans: [] }),
}));
vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    activeJournal: { id: 'j1', exchange: 'vantage', assetClass: 'futures_cme' },
    activeJournalId: 'j1',
  }),
}));

function buttonByText(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
}

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function typeInput(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function closePickers() {
  act(() => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

function openPicker(input) {
  closePickers();
  click(input);
}

function enabledTime(label) {
  const calendars = [...document.querySelectorAll('.react-datepicker')];
  const calendar = calendars[calendars.length - 1];
  if (!calendar) return null;
  return [...calendar.querySelectorAll('.react-datepicker__time-list-item')].find((li) => (
    li.textContent.trim() === label && !li.className.includes('disabled')
  ));
}

describe('partial exit datetime', () => {
  let view;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 22, 7, 30));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => {
      root.render(
        <TradeForm
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          journalAssetClass="futures_cme"
        />,
      );
    });
    view = {
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  });

  afterEach(async () => {
    await view?.unmount();
    vi.useRealTimers();
  });

  it('defaults a new TP to the close time and keeps a time the user picked', async () => {
    click(buttonByText('יציאות חלקיות'));
    click(buttonByText('הוסף יעד'));

    const tp = document.querySelector('input[placeholder="תאריך יציאה"]');
    const entry = document.getElementById('tt-entry-date');
    expect(entry.value).toBe('26/10/26 22:07');
    expect(tp.value).toBe('26/10/26 22:07');

    vi.setSystemTime(new Date(2026, 9, 26, 22, 9, 0));
    await typeInput(document.getElementById('tt-exit'), '3991.8');

    const close = document.getElementById('tt-exit-date');
    expect(close.value).toBe('26/10/26 22:09');
    expect(tp.value).toBe('26/10/26 22:09');

    openPicker(tp);
    const picked = enabledTime('22:07');
    expect(picked).toBeTruthy();
    click(picked);
    expect(tp.value).toBe('26/10/26 22:07');
    closePickers();

    vi.setSystemTime(new Date(2026, 9, 26, 22, 20, 0));
    openPicker(close);
    const later = enabledTime('22:15');
    expect(later).toBeTruthy();
    click(later);
    expect(close.value).toBe('26/10/26 22:15');
    expect(tp.value).toBe('26/10/26 22:07');
  });

  it('allows a close time before the entry, and moves an untouched close with the entry', async () => {
    const entry = document.getElementById('tt-entry-date');
    const close = document.getElementById('tt-exit-date');
    openPicker(close);
    const earlier = enabledTime('21:00');
    const future = enabledTime('23:00');
    expect(earlier).toBeTruthy();
    expect(earlier.className).not.toContain('disabled');
    expect(future).toBeTruthy();
    expect(future.className).not.toContain('disabled');
    closePickers();

    vi.setSystemTime(new Date(2026, 9, 26, 22, 9, 0));
    await typeInput(document.getElementById('tt-exit'), '3991.8');
    expect(close.value).toBe('26/10/26 22:09');

    openPicker(entry);
    click(enabledTime('21:00'));
    expect(entry.value).toBe('26/10/26 21:00');
    expect(close.value).toBe('26/10/26 21:00');
    closePickers();

    openPicker(close);
    click(enabledTime('21:30'));
    expect(close.value).toBe('26/10/26 21:30');
    closePickers();

    openPicker(entry);
    click(enabledTime('20:00'));
    expect(entry.value).toBe('26/10/26 20:00');
    expect(close.value).toBe('26/10/26 21:30');
  });
});
