import { describe, expect, it } from 'vitest';
import { clearResponseCaches } from './responseCache';

describe('clearResponseCaches', () => {
  it('deletes every Cache Storage bucket', async () => {
    const deleted = [];
    const previous = globalThis.caches;
    globalThis.caches = {
      keys: async () => ['tradeos-v323', 'other'],
      delete: async (name) => { deleted.push(name); return true; },
    };
    try {
      await clearResponseCaches();
    } finally {
      globalThis.caches = previous;
    }
    expect(deleted).toEqual(['tradeos-v323', 'other']);
  });
});
