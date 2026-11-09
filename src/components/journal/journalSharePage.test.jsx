// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoggedOutAuth } from '../../contexts/AuthContext';
import JournalSharePage from './JournalSharePage';
import { SHARE_VIEW_MISSING, SHARE_VIEW_UNAVAILABLE } from '../../services/journalShareService';

const VIEW = {
  journalId: 'j1',
  liveBalance: 99999,
  apiKey: 'tos_secret',
  balances: { initialBalance: 1000, propAccountSize: 5000, exchangeAddress: '0xSECRETADDRESS' },
  stats: { closed: 1, open: 0, net: 10, wins: 1, losses: 0, winRate: 100, avgR: 1 },
  trades: [
    {
      id: 't1',
      pair: 'BTCUSDT',
      direction: 'long',
      status: 'closed',
      result: 'win',
      netPnl: 10,
      notes: 'SECRET-NOTE',
      apiKey: 'tos_trade_secret',
      tradingViewUrls: ['https://www.tradingview.com/chart/SECRET'],
      entryDate: '2026-01-01T12:00:00.000Z',
    },
  ],
};

async function mount(load, token = 'abc') {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/share/${token}`]}>
        <LoggedOutAuth>
          <Routes>
            <Route path="/share/:token" element={<JournalSharePage load={load} />} />
          </Routes>
        </LoggedOutAuth>
      </MemoryRouter>,
    );
  });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe('shared journal page', () => {
  it('shows the filtered fields and the end date, and skips anything the copy should not display', async () => {
    const seen = [];
    const view = await mount(async (token) => {
      seen.push(token);
      return { ok: true, share: VIEW, expiresAt: '2026-07-01T09:00:00.000Z' };
    });
    expect(seen).toEqual(['abc']);
    expect(document.querySelector('[data-testid="share-end"]').textContent).toContain('בתוקף עד');
    expect(document.querySelector('[data-testid="share-end"]').textContent).toContain('01/07/2026');
    expect(document.body.textContent).toContain('BTCUSDT');
    expect(document.body.textContent).toContain('SECRET-NOTE');
    expect(document.body.textContent).toContain('1000');
    expect(document.body.textContent).toContain('5000');
    expect(document.body.textContent).not.toContain('99999');
    expect(document.body.textContent).not.toContain('0xSECRETADDRESS');
    expect(document.body.textContent).not.toContain('tos_secret');
    expect(document.body.textContent).not.toContain('tos_trade_secret');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.body.textContent).not.toContain('הוסף הערה');
    expect(document.querySelector('meta[name="robots"]').content).toBe('noindex, nofollow');
    expect(document.querySelector('meta[name="referrer"]').content).toBe('no-referrer');
    await view.cleanup();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('uses one wording for a revoked, expired or unknown link', async () => {
    const texts = [];
    for (const label of ['revoked', 'expired', 'unknown']) {
      const view = await mount(async () => ({ ok: false, unavailable: false, label }));
      texts.push(document.querySelector('[data-testid="share-missing"]').textContent);
      expect(document.body.textContent).not.toContain(label);
      await view.cleanup();
    }
    expect(texts).toEqual([SHARE_VIEW_MISSING, SHARE_VIEW_MISSING, SHARE_VIEW_MISSING]);
  });

  it('says the service is down without calling the link empty', async () => {
    const view = await mount(async () => ({ ok: false, unavailable: true }));
    expect(document.querySelector('[data-testid="share-missing"]')).toBeNull();
    expect(document.body.textContent).toContain(SHARE_VIEW_UNAVAILABLE);
    await view.cleanup();
  });
});
