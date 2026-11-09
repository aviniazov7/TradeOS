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
    initialBalance: 1000,
    description: 'יומן בדיקה',
    riskType: 'percent',
    riskValue: 1,
  },
  journals: [
    { id: 'j1', name: 'MEXC' },
    { id: 'j2', name: 'שני' },
  ],
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
    journals: state.journals,
    activeJournal: state.journal,
    activeJournalId: 'j1',
    updateJournal: state.updateJournal,
    deleteJournal: vi.fn(async () => {}),
    archiveJournal: vi.fn(async () => {}),
  }),
}));

import JournalSettingsModal from './JournalSettingsModal';

const freshJournal = () => ({
  id: 'j1',
  name: 'MEXC',
  exchange: 'mexc',
  assetClass: 'crypto',
  initialBalance: 1000,
  description: 'יומן בדיקה',
  riskType: 'percent',
  riskValue: 1,
});

describe('journal settings layout', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  beforeEach(() => {
    state.journal = freshJournal();
    state.journals = [
      { id: 'j1', name: 'MEXC' },
      { id: 'j2', name: 'שני' },
    ];
    state.updateJournal.mockClear();
    document.body.innerHTML = '';
  });

  async function render(props = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<JournalSettingsModal isOpen onClose={() => {}} {...props} />);
    });
    return {
      async rerender(next) {
        await act(async () => {
          root.render(<JournalSettingsModal isOpen onClose={() => {}} {...props} {...next} />);
        });
      },
      async unmount() {
        await act(async () => { root.unmount(); });
        el.remove();
      },
    };
  }

  function sections() {
    return [...document.querySelectorAll('[data-section-n]')];
  }

  it('opens wide, with numbered sections, a two-column desktop grid and a sticky footer', async () => {
    const view = await render();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.className).toContain('max-w-5xl');
    expect(dialog.className).toContain('w-full');
    expect(dialog.querySelector('h2').textContent).toBe('הגדרות יומן');
    expect(dialog.querySelector('[aria-label="סגור"]')).toBeTruthy();
    expect(dialog.querySelector('.overflow-y-auto')).toBeTruthy();

    const form = document.querySelector('[data-testid="journal-settings-form"]');
    expect(form.className).toContain('grid-cols-1');
    expect(form.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
    expect(form.className).toContain('lg:grid-cols-[minmax(0,1fr)_288px]');

    expect(sections().map((section) => (
      `${section.getAttribute('data-section-n')} ${section.getAttribute('data-section-title')}`
    ))).toEqual([
      '1 פרטים בסיסיים',
      '2 סוג וגודל סיכון',
      '3 כללי סיכון',
      '4 עמלות',
      '5 חשבון פרופ',
      '6 שיתוף יומן',
      '7 ייבוא / ייצוא עסקאות',
      '8 אזור מסוכן',
    ]);
    expect(sections()[0].textContent).toContain('01');
    expect(sections()[7].textContent).toContain('08');

    for (const id of [
      'journal-settings-basics-grid',
      'journal-settings-commission-grid',
      'journal-risk-rules-grid',
    ]) {
      const grid = document.querySelector(`[data-testid="${id}"]`);
      expect(grid.className).toContain('grid-cols-1');
      expect(grid.className).toContain('lg:grid-cols-2');
    }

    const footer = document.querySelector('[data-testid="journal-settings-footer"]');
    expect(footer.closest('.sticky')?.className).toContain('bottom-0');
    expect(footer.textContent).toContain('ביטול');
    expect(footer.textContent).toContain('שמור שינויים');
    expect(footer.querySelector('button[type="submit"]').getAttribute('form')).toBe('journal-settings-form');

    const basics = document.querySelector('[data-testid="journal-settings-section-basics"]');
    expect(basics.textContent).toContain('שם היומן');
    expect(basics.textContent).toContain('סוג נכס');
    expect(basics.textContent).toContain('קריפטו');
    expect(basics.textContent).toContain('חוזים עתידיים');
    expect(basics.textContent).toContain('בורסה / ברוקר / תיק ממומן');
    expect(basics.textContent).toContain('יתרה התחלתית ($)');
    expect(basics.textContent).toContain('תיאור (אופציונלי)');
    expect(basics.querySelector('input').className).toContain('bg-bg-tertiary');
    expect(basics.querySelector('input').className).toContain('border-border-primary');
    expect(basics.querySelector('.text-accent-primary')).toBeTruthy();
    expect(form.innerHTML).not.toMatch(/bg-black|text-white|#[0-9a-fA-F]{3,8}/);

    const rules = document.querySelector('[data-testid="journal-settings-section-risk-rules"]');
    const alert = rules.querySelector('[data-testid="journal-daily-loss-alert"]');
    const ruleList = rules.querySelector('[data-testid="journal-risk-rules"]');
    expect(alert.compareDocumentPosition(ruleList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rules.textContent).toContain('הפסד שבועי מקסימלי');
    expect(document.body.textContent).toContain('חשבון פרופ');
    expect(document.body.textContent).toContain('שיתוף היומן');
    expect(document.body.textContent).toContain('ייבוא עסקאות מ-CSV');
    expect(document.body.textContent).toContain('ייצוא עסקאות ל-CSV');
    expect(document.body.textContent).toContain('העברה לארכיון');
    expect(document.body.textContent).toContain('מחיקת יומן');
    await view.unmount();
  });

  it('keeps the daily-loss alert, commission presets and save/cancel behavior', async () => {
    const onClose = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<JournalSettingsModal isOpen onClose={onClose} canExport onImport={vi.fn()} onExport={vi.fn()} />);
    });

    const alert = document.querySelector('[data-testid="journal-daily-loss-alert"]');
    expect(alert.checked).toBe(false);
    expect(document.body.textContent).not.toContain('הפסד יומי מקסימלי ($)');
    await act(async () => { alert.click(); });
    expect(document.body.textContent).toContain('הפסד יומי מקסימלי ($)');

    expect(document.body.textContent).toContain('Maker (% מהנומינלי)');
    const futures = [...document.querySelectorAll('[role="radio"]')].find((button) => button.textContent.includes('חוזים עתידיים'));
    await act(async () => { futures.click(); });
    expect(document.body.textContent).toContain('$ לחוזה לכל צד');
    expect(document.body.textContent).not.toContain('Maker (% מהנומינלי)');

    const name = document.querySelector('input[placeholder="שם היומן שלך"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(name, 'יומן חדש');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      document.querySelector('[data-testid="journal-settings-footer"] button[type="submit"]').click();
    });
    expect(state.updateJournal).toHaveBeenCalledOnce();
    expect(state.updateJournal.mock.calls[0][1].name).toBe('יומן חדש');
    expect(state.updateJournal.mock.calls[0][1].assetClass).toBe('futures_cme');
    expect(onClose).toHaveBeenCalled();

    await act(async () => { root.unmount(); });
    el.remove();
  });

  it('hides delete when this is the only journal, and still exports when allowed', async () => {
    state.journals = [{ id: 'j1', name: 'MEXC' }];
    const onClose = vi.fn();
    const onExport = vi.fn();
    const onImport = vi.fn();
    const view = await render({ onClose, onExport, onImport, canExport: true });
    expect(document.body.textContent).not.toContain('מחיקת יומן');
    const exportButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('ייצוא עסקאות ל-CSV'));
    expect(exportButton.disabled).toBe(false);
    await act(async () => { exportButton.click(); });
    expect(onExport).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    const importButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('ייבוא עסקאות מ-CSV'));
    await act(async () => { importButton.click(); });
    expect(onImport).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it('shows stock commission fields when the journal asset class is stocks', async () => {
    state.journal = { ...freshJournal(), assetClass: 'stocks' };
    const view = await render();
    expect(document.body.textContent).toContain('$ למניה');
    expect(document.body.textContent).toContain('מינימום $ להוראה');
    const grid = document.querySelector('[data-testid="journal-settings-commission-grid"]');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-2');
    await view.unmount();
  });
});
