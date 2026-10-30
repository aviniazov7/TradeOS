import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// H2: googleSignIn linked any Google email to an existing Firebase user
// without checking email_verified. Nothing in the app calls it (Google
// sign-in uses the Firebase client SDK, with a Cloudflare Worker fallback
// for iOS PWAs), so the function and its token helper are gone.

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIRS = ['src', 'worker', 'workers', 'public', 'scripts'];
const SOURCE_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|html|json|yml|yaml)$/;

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (SOURCE_EXT.test(name)) acc.push(path);
  }
  return acc;
}

describe('googleSignIn cloud function (H2)', () => {
  it('is not exported and does not link Firebase users by Google email', () => {
    const src = readFileSync(join(root, 'functions/index.js'), 'utf8');
    expect(src).not.toMatch(/\bgoogleSignIn\b/);
    expect(src).not.toMatch(/\bgetUserByEmail\b/);
    expect(src).not.toMatch(/\bcreateCustomToken\b/);
    expect(src).not.toMatch(/\bcreateUser\b/);
    expect(src).not.toMatch(/google-auth-library/);
    expect(src).not.toMatch(/\bemail_verified\b/);
    expect(src).not.toMatch(/\bOAuth2Client\b/);
  });

  it('does not depend on google-auth-library', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'functions/package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(root, 'functions/package-lock.json'), 'utf8'));
    expect(pkg.dependencies?.['google-auth-library']).toBeUndefined();
    expect(pkg.devDependencies?.['google-auth-library']).toBeUndefined();
    expect(lock.packages?.['']?.dependencies?.['google-auth-library']).toBeUndefined();
  });

  it('is not called from the frontend, workers, or scripts', () => {
    const hits = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of walk(join(root, dir))) {
        const text = readFileSync(file, 'utf8');
        if (/\bgoogleSignIn\b/.test(text) || /cloudfunctions\.net/.test(text)) {
          hits.push(relative(root, file));
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
