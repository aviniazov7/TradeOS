// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalSwitcher from './JournalSwitcher';

const journals = [
  { id: 'j1', name: 'היומן שלי', exchange: 'binance', assetClass: 'crypto' },
  { id: 'j2', name: 'Alpha', exchange: '', assetClass: 'crypto' },
  { id: 'j3', name: 'MEXC', exchange: 'mexc', assetClass: 'crypto' },
  { id: 'j4', name: 'MEXC', exchange: '', assetClass: 'crypto' },
];

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('../../hooks/useExchangeConnected', () => ({ useExchangeConnected: () => false }));
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

describe('manual journal switcher', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('uses a neutral name and icon when nothing is connected', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<JournalSwitcher compact />); });
    expect(el.textContent).toContain('יומן ידני');
    expect(el.textContent).not.toContain('Binance');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid="journal-manual"]')).toBeTruthy();
    await act(async () => { root.unmount(); });
    el.remove();
  });

  it('keeps the real MEXC mark when the API is not connected, and does not invent one from the name', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<JournalSwitcher compact />); });
    const button = el.querySelector('button');
    button.getBoundingClientRect = () => ({ right: 200, bottom: 80, left: 40, top: 40, width: 160, height: 40, x: 40, y: 40, toJSON() {} });
    await act(async () => { button.click(); });
    const menu = document.querySelector('[data-testid="journal-switcher-menu"]');
    const imgs = [...menu.querySelectorAll('img')].map((n) => n.getAttribute('src'));
    expect(imgs).toEqual(['/logos/exchanges/mexc.svg']);
    const letters = [...menu.querySelectorAll('[data-testid="journal-letter"]')].map((n) => n.textContent);
    expect(letters).toEqual(['A', 'M']);
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
