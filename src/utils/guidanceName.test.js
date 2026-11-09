import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GUIDANCE_CHAT_WELCOME,
  GUIDANCE_COACH_IDENTITY,
  GUIDANCE_COUPON_DESCRIPTION,
  GUIDANCE_FEATURE_NAME,
  GUIDANCE_OG_DESCRIPTION,
  GUIDANCE_TWITTER_DESCRIPTION,
  GUIDANCE_WYCKOFF_IDENTITY,
  applyGuidanceMeta,
} from './guidanceName';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The old feature name, and the marketing phrase that used it.
// Split so this test file is not itself a hit for the scan below.
const OLD_FEATURE = ['מצב', 'מנטור'].join(' ');
const OLD_WORD = ['מנ', 'טור'].join('');

const ALLOW_OLD_WORD = new Set([
  'docs/redesign/00-master-plan.md',
  'CHANGELOG.md',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(js|jsx|html|md|json|xml|txt)$/.test(name)) out.push(abs);
  }
  return out;
}

describe('guidance display name', () => {
  it('is the single professional name', () => {
    expect(GUIDANCE_FEATURE_NAME).toBe('ליווי מקצועי');
    for (const text of [
      GUIDANCE_OG_DESCRIPTION,
      GUIDANCE_TWITTER_DESCRIPTION,
      GUIDANCE_COUPON_DESCRIPTION,
      GUIDANCE_CHAT_WELCOME,
      GUIDANCE_WYCKOFF_IDENTITY,
      GUIDANCE_COACH_IDENTITY,
    ]) {
      expect(text).toContain(GUIDANCE_FEATURE_NAME);
      expect(text).not.toContain(OLD_WORD);
      expect(text).not.toContain(OLD_FEATURE);
    }
  });

  it('is what the chat, the worker and the meta tags render', () => {
    const worker = readFileSync(join(ROOT, 'worker/index.js'), 'utf8');
    const chat = readFileSync(join(ROOT, 'src/components/market/AIChat.jsx'), 'utf8');
    expect(worker).toContain('GUIDANCE_WYCKOFF_IDENTITY');
    expect(worker).toContain('GUIDANCE_COACH_IDENTITY');
    expect(worker).toContain('GUIDANCE_COUPON_DESCRIPTION');
    expect(chat).toContain('GUIDANCE_CHAT_WELCOME');
  });

  it('writes the name into the static meta tags', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('__GUIDANCE_OG_DESCRIPTION__');
    expect(html).toContain('__GUIDANCE_TWITTER_DESCRIPTION__');
    expect(html).not.toContain(OLD_WORD);
    const served = applyGuidanceMeta(html);
    expect(served).toContain(`content="${GUIDANCE_OG_DESCRIPTION}"`);
    expect(served).toContain(`content="${GUIDANCE_TWITTER_DESCRIPTION}"`);
    expect(served).not.toContain('__GUIDANCE_');
    expect(served).not.toContain(OLD_WORD);
  });

  it('does not leave the old name in product copy', () => {
    const hits = [];
    for (const abs of walk(ROOT)) {
      const rel = relative(ROOT, abs).replaceAll('\\', '/');
      if (rel === 'src/utils/guidanceName.test.js') continue;
      if (ALLOW_OLD_WORD.has(rel)) continue;
      const text = readFileSync(abs, 'utf8');
      if (text.includes(OLD_WORD) || text.includes(OLD_FEATURE) || /mentor mode|mentoring/i.test(text)) {
        hits.push(rel);
      }
    }
    expect(hits).toEqual([]);
  });
});
