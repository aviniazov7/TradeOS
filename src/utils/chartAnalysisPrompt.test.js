import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('chart analysis prompt', () => {
  it('asks for clean numbered headings and does not show the model asterisks', () => {
    const src = readFileSync(new URL('../../worker/index.js', import.meta.url), 'utf8');
    const vision = src.slice(src.indexOf('const WYCKOFF_VISION_PROMPT'), src.indexOf('async function handleAIChat'));
    expect(vision).toContain('1. מבנה כללי');
    expect(vision).toContain('בלי כוכביות');
    expect(vision).not.toContain('**');
    expect(vision).not.toContain('*');

    const client = readFileSync(new URL('../components/market/ChartAnalyzer.jsx', import.meta.url), 'utf8');
    const promptStart = client.indexOf('const ANALYSIS_PROMPT');
    const prompt = client.slice(promptStart, client.indexOf('\n', promptStart));
    expect(prompt).toContain('1. מבנה כללי');
    expect(prompt).toContain('בלי כוכביות');
    expect(prompt).not.toContain('**');
    expect(prompt).not.toContain('*');
  });
});
