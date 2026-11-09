// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { BookOpen, FlaskConical } from 'lucide-react';
import PageHeader from '../shared/PageHeader';
import BacktestSwitcherView from './BacktestSwitcherView';

const JOURNALS = [
  { id: 'short-he', name: 'יומן' },
  { id: 'short-en', name: 'Main' },
  { id: 'long-he', name: 'אסטרטגיית פריצה על ביטקוין בלונדון' },
];

function mount(node) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => { root.render(node); });
  return {
    cleanup() {
      act(() => { root.unmount(); });
      el.remove();
    },
  };
}

function switcher(overrides = {}) {
  const setActiveJournalId = vi.fn();
  const addJournal = vi.fn();
  const active = JOURNALS.find((j) => j.id === (overrides.activeId || 'short-he'));
  const view = mount(
    <div dir="rtl">
      <PageHeader
        icon={FlaskConical}
        title="בקטסט"
        readableAside
        titleAside={(
          <BacktestSwitcherView
            compact
            journals={JOURNALS}
            activeJournal={active}
            activeJournalId={active.id}
            setActiveJournalId={setActiveJournalId}
            addJournal={addJournal}
          />
        )}
        actions={<button type="button">עסקה חדשה</button>}
      />
    </div>,
  );
  return { ...view, setActiveJournalId, addJournal };
}

describe('backtest journal label', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('keeps a short Hebrew or English name whole and caps a long one', () => {
    const view = switcher();
    const name = document.querySelector('[data-testid="backtest-journal-name"]');
    expect(name.textContent).toBe('יומן');
    expect(name.getAttribute('dir')).toBe('auto');
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-[4.5rem]');
    expect(name.className).toContain('w-max');
    expect(name.className).toContain('sm:max-w-[16rem]');
    expect(name.className).not.toContain('max-w-[220px]');
    const button = name.closest('button');
    expect(button.getAttribute('title')).toBe('יומן');
    expect(button.className).toContain('max-w-full');
    expect(button.className).not.toContain('w-max');
    const slot = button.parentElement.parentElement;
    expect(slot.className).toContain('shrink-0');
    expect(slot.className).toContain('max-w-full');
    expect(slot.className).not.toContain('overflow-hidden');
    const column = document.querySelector('h1').parentElement.parentElement;
    expect(column.className).toContain('sm:min-w-64');
    expect(document.querySelector('h1').className).toContain('shrink-0');
    view.cleanup();

    const english = switcher({ activeId: 'short-en' });
    expect(document.querySelector('[data-testid="backtest-journal-name"]').textContent).toBe('Main');
    expect(document.querySelector('[data-testid="backtest-journal-name"]').closest('button').getAttribute('title')).toBe('Main');
    english.cleanup();

    const long = switcher({ activeId: 'long-he' });
    const longName = document.querySelector('[data-testid="backtest-journal-name"]');
    expect(longName.textContent).toBe('אסטרטגיית פריצה על ביטקוין בלונדון');
    expect(longName.closest('button').getAttribute('title')).toBe(longName.textContent);
    long.cleanup();
  });

  it('still selects a journal from the menu without touching the others', () => {
    const view = switcher();
    const trigger = document.querySelector('[data-testid="backtest-journal-name"]').closest('button');
    act(() => { trigger.click(); });
    const menu = document.querySelector('[data-testid="backtest-journal-menu"]');
    expect(menu.getAttribute('dir')).toBe('rtl');
    expect(menu.className).toContain('fixed');
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(0);
    const options = [...menu.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.getAttribute('title'))).toEqual(JOURNALS.map((j) => j.name));
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    const longOption = options[2].querySelector('span');
    expect(longOption.className).toContain('truncate');
    expect(longOption.className).toContain('min-w-0');
    act(() => { options[1].click(); });
    expect(view.setActiveJournalId).toHaveBeenCalledTimes(1);
    expect(view.setActiveJournalId).toHaveBeenCalledWith('short-en');
    expect(view.addJournal).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="backtest-journal-menu"]')).toBeNull();
    view.cleanup();
  });

  it('leaves the journal header free to shrink around its stat strip', () => {
    const view = mount(
      <PageHeader
        icon={BookOpen}
        title="יומן המסחר"
        compactMobile
        center={<span data-testid="stats">R ממוצע</span>}
        titleAside={<span data-testid="journal-slot">Vantage</span>}
      />,
    );
    const slot = document.querySelector('[data-testid="journal-slot"]').parentElement;
    expect(slot.className).toContain('overflow-hidden');
    expect(slot.className).toContain('shrink');
    expect(slot.className).not.toContain('shrink-0');
    const column = document.querySelector('h1').parentElement.parentElement;
    expect(column.className).not.toContain('sm:min-w-64');
    view.cleanup();
  });
});
