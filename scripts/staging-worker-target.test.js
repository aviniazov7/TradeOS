import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STAGING_WORKER_NAME,
  STAGING_WORKER_URL,
  assertStagingWorkerConfig,
  loadStagingWorkerConfig,
} from './staging-worker-target.mjs';

describe('assertStagingWorkerConfig', () => {
  it('accepts the staging Worker and rejects production or cron', () => {
    expect(assertStagingWorkerConfig({ name: STAGING_WORKER_NAME }).name).toBe(STAGING_WORKER_NAME);
    expect(assertStagingWorkerConfig({ name: STAGING_WORKER_NAME, triggers: {} }).name).toBe(STAGING_WORKER_NAME);
    expect(() => assertStagingWorkerConfig({ name: 'trade-os' })).toThrow(/trade-os-staging/);
    expect(() => assertStagingWorkerConfig({ name: 'tradeos-alerts' })).toThrow(/Refusing to deploy/);
    expect(() => assertStagingWorkerConfig({
      name: STAGING_WORKER_NAME,
      triggers: { crons: ['*/10 * * * *'] },
    })).toThrow(/cron/);
  });
});

describe('wrangler staging env', () => {
  it('resolves to trade-os-staging and not the production script', async () => {
    const config = await loadStagingWorkerConfig();
    expect(assertStagingWorkerConfig(config).name).toBe(STAGING_WORKER_NAME);
    expect(config.name).not.toBe('trade-os');
    expect(config.kv_namespaces?.map((ns) => ns.binding)).toContain('ALERTS_KV');
    expect(config.durable_objects?.bindings?.map((b) => b.name)).toContain('AI_QUOTA');
    expect(STAGING_WORKER_URL).toBe('https://trade-os-staging.tradeos.workers.dev');
  });

  it('keeps the top-level Worker name on trade-os', () => {
    const text = readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8');
    expect(text).toMatch(/"name": "trade-os"/);
    expect(text).toMatch(/"name": "trade-os-staging"/);
  });
});
