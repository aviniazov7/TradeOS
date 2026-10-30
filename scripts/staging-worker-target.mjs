// Resolves `wrangler.jsonc` --env staging and refuses to continue unless the
// Worker name is trade-os-staging. The Vite plugin writes
// .wrangler/deploy/config.json during `npm run build`; a bare `wrangler deploy`
// follows that file and uploads trade-os. Passing `config` here does not.

import { pathToFileURL } from 'node:url';

export const STAGING_WORKER_NAME = 'trade-os-staging';
export const STAGING_WORKER_URL = 'https://trade-os-staging.tradeos.workers.dev';
export const PRODUCTION_WORKER_NAME = 'trade-os';

export function assertStagingWorkerConfig(config) {
  const name = config?.name;
  if (name === PRODUCTION_WORKER_NAME || name !== STAGING_WORKER_NAME) {
    throw new Error(
      `Refusing to deploy Worker "${name ?? ''}". Staging must be ${STAGING_WORKER_NAME} so ${PRODUCTION_WORKER_NAME} stays untouched.`,
    );
  }
  const crons = config?.triggers?.crons;
  if (Array.isArray(crons) && crons.length > 0) {
    throw new Error(`Refusing to deploy ${STAGING_WORKER_NAME} with cron triggers (${crons.join(', ')}).`);
  }
  return config;
}

export async function loadStagingWorkerConfig() {
  const { unstable_readConfig } = await import('wrangler');
  return unstable_readConfig({
    config: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
    env: 'staging',
  });
}

function fileURLToPath(url) {
  return decodeURIComponent(url.pathname);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const config = await loadStagingWorkerConfig();
  assertStagingWorkerConfig(config);
  console.log(`staging worker target: ${config.name}`);
}
