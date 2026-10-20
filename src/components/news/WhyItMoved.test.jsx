// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import WhyItMoved from './WhyItMoved';

vi.mock('../../services/newsService', () => ({
  fetchNewsImpact: vi.fn(),
}));

import { fetchNewsImpact } from '../../services/newsService';

const QUIET = 'אף נכס לא עבר כרגע את הסף של תנועה חריגה';

async function render() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<WhyItMoved />);
  });
  return el;
}

describe('WhyItMoved', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows the quiet message when no asset cleared the gates', async () => {
    fetchNewsImpact.mockResolvedValue({ findings: [], loudest: [], windowMin: 240 });
    const el = await render();
    expect(el.textContent).toContain(QUIET);
    expect(el.textContent).toContain('למה המחיר זז');
  });

  it('shows a detected move and decodes entities in the headline', async () => {
    fetchNewsImpact.mockResolvedValue({
      findings: [{
        symbol: 'BTCUSDT',
        ticker: 'BTC',
        changePct: 1.6,
        volumeX: 3.1,
        windowMin: 240,
        cause: 'direct',
        text: 'BTC עלה 1.6% ב-4 השעות האחרונות, בווליום גבוה פי 3.1 מהרגיל. במקביל 2 מקורות מדווחים על BTC: "Bitcoin&#8217;s rally after Trump".',
      }],
      loudest: [{
        key: 'ticker:btc',
        title: 'Zcash leads as Bitcoin&#8217;s bounce holds',
        sourceCount: 5,
        ageMin: 7,
      }],
      windowMin: 240,
    });
    const el = await render();
    expect(el.textContent).not.toContain(QUIET);
    expect(el.textContent).toContain('BTC עלה 1.6%');
    expect(el.textContent).toContain('Bitcoin\u2019s rally after Trump');
    expect(el.textContent).toContain('Bitcoin\u2019s bounce holds');
    expect(el.textContent).not.toContain('&#8217;');
  });
});
