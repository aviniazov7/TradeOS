import { expect, it } from 'vitest';
import worker from './index.js';
import { GUIDANCE_COUPON_DESCRIPTION, GUIDANCE_FEATURE_NAME } from '../src/utils/guidanceName.js';

const oldWord = ['מנ', 'טור'].join('');

it('coupon crawler card uses the guidance display name', async () => {
  const kv = { get: async () => null };
  const res = await worker.fetch(new Request('https://trade-os.test/r/PREVIEW', {
    headers: { 'User-Agent': 'Twitterbot/1.0' },
  }), { ALERTS_KV: kv });
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain(GUIDANCE_FEATURE_NAME);
  expect(html).toContain(GUIDANCE_COUPON_DESCRIPTION);
  expect(html).not.toContain(oldWord);
});
