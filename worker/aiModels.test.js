import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

describe('Groq model ids', () => {
  it('sends chart images to the current Qwen vision model', () => {
    expect(src).toMatch(/const GROQ_VISION_MODEL = 'qwen\/qwen3\.8-27b';/);
    expect(src).toMatch(/const GROQ_VISION_FALLBACK_MODEL = 'qwen\/qwen3\.8-27b';/);
    expect(src).not.toMatch(/const GROQ_VISION_MODEL = 'qwen\/qwen3\.6-27b'/);
    expect(src).not.toMatch(/['"]qwen\/qwen3\.6-27b['"]/);
    expect(src).not.toMatch(/['"]qwen\/qwen3-32b['"]/);
  });
});
