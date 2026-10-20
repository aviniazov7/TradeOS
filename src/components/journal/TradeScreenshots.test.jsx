// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TradeScreenshots from './TradeScreenshots';
import { listTradeImages } from '../../services/tradeImageService';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../../services/tradeImageService', () => ({
  listTradeImages: vi.fn(),
}));

const DATA = 'data:image/png;base64,aaaa';

describe('TradeScreenshots', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    listTradeImages.mockReset();
  });

  async function render() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<TradeScreenshots tradeId="t1" pair="BTCUSDT" />);
    });
    return {
      host,
      async unmount() {
        await act(async () => { root.unmount(); });
        host.remove();
      },
    };
  }

  it('shows a legacy data URL and does not offer an upload', async () => {
    listTradeImages.mockResolvedValueOnce([
      { id: 't1_0', dataUrl: DATA, kind: 'before', caption: 'כניסה' },
      { id: 't1_1', storagePath: 'users/u1/charts/t1_1', contentType: 'image/png', kind: 'after' },
    ]);
    const { host, unmount } = await render();
    await act(async () => {});
    expect(listTradeImages).toHaveBeenCalledWith('u1', 't1');
    const img = host.querySelector('img');
    expect(img.getAttribute('src')).toBe(DATA);
    expect(host.textContent).toContain('צילומי גרף שמורים');
    expect(host.textContent).toContain('לקריאה בלבד');
    expect(host.textContent).toContain('כניסה');
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.textContent).not.toContain('הוסף צילום');
    expect(host.querySelectorAll('img')).toHaveLength(1);
    await unmount();
  });

  it('renders nothing when the trade has no legacy image', async () => {
    listTradeImages.mockResolvedValueOnce([]);
    const { host, unmount } = await render();
    await act(async () => {});
    expect(host.textContent).toBe('');
    await unmount();
  });
});
