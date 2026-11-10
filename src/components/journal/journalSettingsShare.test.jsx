// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const state = vi.hoisted(() => ({
  journal: { id: 'j1', name: 'MEXC', exchange: 'mexc', assetClass: 'crypto', initialBalance: 0 },
  journals: [
    { id: 'j1', name: 'MEXC', exchange: 'mexc' },
    { id: 'j2', name: 'שני', exchange: 'bybit' },
  ],
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    journals: state.journals,
    activeJournal: state.journal,
    activeJournalId: 'j1',
    updateJournal: vi.fn(async () => {}),
    deleteJournal: vi.fn(async () => {}),
    archiveJournal: vi.fn(async () => {}),
  }),
}));

import JournalSettingsModal from './JournalSettingsModal';

describe('journal settings share section', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

  it('puts the share action in settings and calls onShare', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const onShare = vi.fn();
    await act(async () => {
      root.render(<JournalSettingsModal isOpen onClose={() => {}} onShare={onShare} />);
    });
    expect(document.body.textContent).toContain('שיתוף יומן');
    expect(document.querySelector('[data-testid="guidance-feature-label"]').textContent).toBe('ליווי מקצועי');
    const button = document.querySelector('[data-testid="journal-share-open"]');
    expect(button?.textContent).toContain('שיתוף היומן');
    await act(async () => { button.click(); });
    expect(onShare).toHaveBeenCalledOnce();
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
