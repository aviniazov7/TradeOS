// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { NewsList } from './NewsList';

vi.mock('../../services/newsService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    translateNews: vi.fn(async () => null),
  };
});

const HE_CACHE_KEY = 'tradeos_news_he_v1';
const BUG = 'જેપીמארגן מצפה שביטקוין יעלה';

describe('NewsList Hebrew cache', () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('drops a cached headline in another script and shows the English title', async () => {
    localStorage.setItem(HE_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      map: {
        'https://example.com/a': { title: BUG, desc: '' },
        'https://example.com/b': { title: 'ביטקוין בשיא', desc: '' },
      },
    }));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <NewsList
          items={[
            { link: 'https://example.com/a', title: 'JPMorgan expects bitcoin to rise', pubDate: new Date().toISOString() },
            { link: 'https://example.com/b', title: 'Bitcoin hits a high', pubDate: new Date().toISOString() },
          ]}
        />,
      );
    });
    expect(el.textContent).toContain('JPMorgan expects bitcoin to rise');
    expect(el.textContent).toContain('ביטקוין בשיא');
    expect(el.textContent).not.toContain('જેપી');
    const stored = JSON.parse(localStorage.getItem(HE_CACHE_KEY));
    expect(stored.map['https://example.com/a']).toBeUndefined();
    expect(stored.map['https://example.com/b'].title).toBe('ביטקוין בשיא');
    await act(async () => { root.unmount(); });
    el.remove();
  });
});