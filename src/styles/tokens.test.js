import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('design tokens', () => {
  const tokens = read('./tokens.css');
  const index = read('../index.css');
  const app = read('../App.jsx');
  const main = read('../main.jsx');

  it('keeps the old --color-* names pointed at the semantic tokens', () => {
    expect(tokens).toMatch(/--color-bg-primary:\s*var\(--bg-canvas\)/);
    expect(tokens).toMatch(/--color-text-primary:\s*var\(--text-primary\)/);
    expect(tokens).toMatch(/--color-profit:\s*var\(--status-profit\)/);
    expect(tokens).toMatch(/--color-accent-primary:\s*var\(--accent\)/);
    expect(tokens).toMatch(/--accent-gradient:\s*var\(--gradient-accent\)/);
  });

  it('defines a dark default and a .light theme', () => {
    expect(tokens).toMatch(/:root,\s*\[data-theme="dark"\]/);
    expect(tokens).toMatch(/\[data-theme="light"\],\s*\.light/);
    expect(tokens).toMatch(/--bg-canvas:\s*var\(--p-black\)/);
    expect(tokens).toMatch(/--bg-canvas:\s*#f3f5f9/);
  });

  it('does not pin the light theme back to the old hex palette', () => {
    const light = index.slice(index.indexOf('/* Light Theme */'));
    expect(light).not.toMatch(/--color-bg-primary:\s*#/);
    expect(light).not.toMatch(/--color-profit:\s*#/);
    expect(index).toMatch(/--color-bg-primary:\s*var\(--bg-canvas\)/);
  });

  it('self-hosts Heebo, including the 800 weight the home titles use', () => {
    expect(main).toMatch(/@fontsource\/heebo\/hebrew-800\.css/);
    expect(main).toMatch(/@fontsource\/heebo\/latin-800\.css/);
    expect(main).not.toMatch(/fonts\.googleapis/);
  });

  it('does not mount the design-system launcher as an app route', () => {
    expect(app).not.toMatch(/design-system/);
    expect(app).not.toMatch(/prototypes\/home/);
  });
});
