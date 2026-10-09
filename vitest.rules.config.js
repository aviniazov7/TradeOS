// Firestore security-rules tests. They need the Firestore emulator, so they are
// kept out of the default `npm test` run (their files are named *.rules.js,
// which the default *.test.js pattern doesn't match).
// Run with: npm run test:rules
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.rules.js'],
    environment: 'node',
    // One emulator shared by every file — run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
