// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import JournalSwitcher from './JournalSwitcher';

const journals = [
  { id: 'j1', name: 'היומן שלי', exchange: 'binance', assetClass: 'crypto' },
  { id: 'j2', name: 'Alpha', exchange: '', assetClass: 'crypto' },
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
});
