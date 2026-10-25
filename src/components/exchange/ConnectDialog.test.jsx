// @vitest-environment happy-dom
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { ConnectDialog } from './ExchangeSettings';
import { EXCHANGES } from './exchangeConfig';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isPremium: false }),
}));
vi.mock('../../contexts/JournalContext', () => ({
  useJournalContext: () => ({
    journals: [], activeJournalId: null, updateJournal: vi.fn(), addJournal: vi.fn(), setActiveJournalId: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTrades', () => ({
  useTrades: () => ({ trades: [], addTradesBulk: vi.fn() }),
}));
vi.mock('../../hooks/useExchangeImport', () => ({
  useExchangeImport: () => ({ importTrade: vi.fn(), existingExternalIds: new Set() }),
}));

const byId = (id) => EXCHANGES.find((e) => e.id === id);

function shell(node) {
  return <LazyMotion features={domAnimation} strict>{node}</LazyMotion>;
}

async function mount(exchange) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(shell(
      <ConnectDialog exchange={exchange} editing={false} data={{}} saving={false}
        onUpdate={() => {}} onSave={() => {}} onClose={() => {}} onOpenCsv={() => {}} />,
    ));
  });
  return {
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      el.remove();
    },
  };
}

describe('ConnectDialog', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const finished = Promise.resolve();
    window.HTMLElement.prototype.animate = () => ({
      cancel() {}, finish() {}, play() {}, pause() {},
      addEventListener() {}, removeEventListener() {},
      finished, ready: finished, currentTime: 0, playState: 'finished',
    });
  });

  it('shows the read-only guide above the key fields', async () => {
    const view = await mount(byId('mexc'));
    const guide = document.querySelector('[data-testid="connection-guide"]');
    const fields = document.querySelector('[data-testid="connection-fields"]');
    expect(guide.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guide.textContent).toContain('Read-Only');
    expect(guide.textContent).toContain('בלי הגבלת IP');
    expect(guide.textContent).toContain('90');
    expect(fields.querySelector('input[placeholder="API Key"]')).toBeTruthy();
    await view.cleanup();
  });

  it('offers CSV import for Binance instead of an API key form', async () => {
    const view = await mount(byId('binance'));
    expect(document.querySelector('input[placeholder="API Key"]')).toBeNull();
    expect(document.querySelector('input[placeholder="API Secret"]')).toBeNull();
    const csv = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ייבוא CSV'));
    expect(csv).toBeTruthy();
    expect(document.querySelector('[data-testid="connection-guide"]').textContent).toContain('CSV');
    await view.cleanup();
  });

  it('offers an MT5 report import for Vantage instead of an API key form', async () => {
    const view = await mount(byId('vantage'));
    expect(document.querySelector('input[placeholder="API Key"]')).toBeNull();
    expect(document.querySelector('input[placeholder="API Secret"]')).toBeNull();
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('ייבוא דוח MT5'));
    expect(button).toBeTruthy();
    const guide = document.querySelector('[data-testid="connection-guide"]').textContent;
    expect(guide).toContain('History');
    expect(guide).toContain('Report');
    expect(guide).not.toContain('Read-Only');
    await view.cleanup();
  });
});
