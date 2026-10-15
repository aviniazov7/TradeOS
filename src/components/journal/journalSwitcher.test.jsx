// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalSwitcher from './JournalSwitcher';

const journals = [
  { id: 'j1', name: 'Bybit', exchange: 'bybit', assetClass: 'crypto' },
  { id: 'j2', name: 'Alpha', exchange: 'other', assetClass: 'crypto' },
  { id: 'j3', name: 'ריק', exchange: '', assetClass: 'crypto' },
  { id: 'j4', name: 'בלי', exchange: null, assetClass: 'stocks' },
  { id: 'j5', name: 'אין', exchange: 'none', assetClass: 'crypto' },
  { id: 'j6', name: 'אחר', exchange: 'אחר', assetClass: 'crypto' },
];

vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isPremium: true, profile: { settings: { assetClasses: ['crypto'] } } }),
}));

vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    journals,
    archivedJournals: [],
    activeJournal: journals[0],
    activeJournalId: 'j1',
    setActiveJournalId: () => {},
    addJournal: async () => {},
    toggleStarJournal: () => {},
    unarchiveJournal: async () => {},
    deleteJournal: async () => {},
  }),
}));

vi.mock('./JournalFormModal', () => ({ default: () => null }));
vi.mock('../shared/Modal', () => ({ default: () => null }));
vi.mock('../shared/ConfirmDialog', () => ({ default: () => null }));

describe('JournalSwitcher menu', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });

  it('portals the menu inside the viewport and uses a real Bybit mark', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<JournalSwitcher compact />); });
    const button = el.querySelector('button');
    button.getBoundingClientRect = () => ({ right: 200, bottom: 80, left: 40, top: 40, width: 160, height: 40, x: 40, y: 40, toJSON() {} });
    await act(async () => { button.click(); });
    const menu = document.querySelector('[data-testid="journal-switcher-menu"]');
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(el.contains(menu)).toBe(false);
    const left = Number.parseFloat(menu.style.left);
    const width = Number.parseFloat(menu.style.width);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(390 - 8);
    expect(menu.style.maxWidth).toBe('calc(100vw - 16px)');
    const imgs = [...menu.querySelectorAll('img')].map((n) => n.getAttribute('src'));
    expect(imgs).toEqual(['/logos/exchanges/bybit.png']);
    const letters = [...menu.querySelectorAll('[data-testid="journal-letter"]')].map((n) => n.textContent);
    expect(letters).toEqual(expect.arrayContaining(['A', 'ר', 'ב', 'א']));
    expect(letters).not.toContain('O');
    expect(menu.textContent).not.toContain('BookOpen');
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
