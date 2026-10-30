import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const staging = readFileSync(fileURLToPath(new URL('../../.github/workflows/deploy-dev.yml', import.meta.url)), 'utf8');
const deploy = readFileSync(fileURLToPath(new URL('../../.github/workflows/deploy.yml', import.meta.url)), 'utf8');

function workflowOnBlock(text) {
  const start = text.indexOf('\non:');
  const end = text.indexOf('\npermissions:');
  return text.slice(start, end);
}

function pushBranches(onBlock) {
  const push = onBlock.match(/push:\s*\n\s*branches:\s*\n([\s\S]*?)(?=\n\s{2}[a-z_]|\n[a-z]|$)/);
  return push ? push[1] : '';
}

describe('dev staging workflow', () => {
  it('runs only on push to dev', () => {
    const on = workflowOnBlock(staging);
    expect(on).toContain('push:');
    expect(pushBranches(on)).toMatch(/-\s*dev\b/);
    expect(pushBranches(on)).not.toMatch(/-\s*main\b/);
    expect(on).not.toContain('pull_request:');
    expect(on).not.toContain('workflow_dispatch');
  });

  it('builds the site against the staging Worker and deploys the fixed dev channel', () => {
    expect(staging).toMatch(/VITE_WORKER_URL:\s*https:\/\/trade-os-staging\.tradeos\.workers\.dev/);
    expect(staging).toMatch(/VITE_FIREBASE_AUTH_DOMAIN:\s*tradeoslive\.web\.app/);
    expect(staging).not.toMatch(/VITE_ADMIN_NOTIF_PREVIEW:\s*'1'/);
    expect(staging).toMatch(/secrets\.FIREBASE_SERVICE_ACCOUNT/);
    expect(staging).toMatch(/project tradeos-91a58/);
    expect(staging).toMatch(/hosting:channel:deploy dev[\s\S]*--only app[\s\S]*--expires 30d/);
    expect(staging).not.toMatch(/firebase-tools deploy --only hosting:app/);
    expect(staging).not.toMatch(/channelId:\s*live/);
    expect(staging).not.toMatch(/--expires 7d/);
  });

  it('deploys wrangler env staging as trade-os-staging and not the production Worker', () => {
    expect(staging).toMatch(/node scripts\/staging-worker-target\.mjs/);
    expect(staging).toMatch(/wrangler deploy --config wrangler\.jsonc --env staging/);
    expect(staging).toMatch(/wrangler secret put "\$name" --config wrangler\.jsonc --env staging/);
    expect(staging).not.toMatch(/wrangler deploy --config wrangler\.toml/);
    expect(staging).not.toMatch(/kind=production/);
    expect(staging).not.toMatch(/refs\/heads\/main/);
    const bare = staging.replaceAll('wrangler deploy --config wrangler.jsonc --env staging', '');
    expect(bare).not.toMatch(/wrangler deploy\b/);
  });

  it('fails the deploy if the log shows the production Worker URL', () => {
    expect(staging).toMatch(/https:\/\/trade-os-staging\.tradeos\.workers\.dev/);
    expect(staging).toMatch(/https:\/\/trade-os\.tradeos\.workers\.dev/);
    expect(staging).toMatch(/production worker was targeted/);
  });
});

describe('production deploy stays on main', () => {
  it('still promotes Hosting and both Workers only for a push to main', () => {
    const on = workflowOnBlock(deploy);
    expect(pushBranches(on)).toMatch(/-\s*main\b/);
    expect(pushBranches(on)).not.toMatch(/-\s*dev\b/);
    expect(on).toMatch(/pull_request:[\s\S]*branches:\s*\[dev\]/);
    expect(on).not.toMatch(/branches:\s*\[main,\s*dev\]/);
    expect(deploy).toMatch(/github\.ref != 'refs\/heads\/dev'/);
    expect(deploy).toMatch(/kind=production/);
    expect(deploy).toMatch(/worker_url=https:\/\/trade-os\.tradeos\.workers\.dev/);
    expect(deploy).toMatch(/firebase-tools deploy --only hosting:app --project tradeos-91a58/);
    expect(deploy).toMatch(/steps\.target\.outputs\.kind == 'production' && env\.CLOUDFLARE_API_TOKEN != ''/);
    expect(deploy).toMatch(/working-directory: worker\n\s+run: npx wrangler deploy\n/);
    expect(deploy).not.toMatch(/wrangler[^\n]*--env staging/);
    expect(deploy).toMatch(/hosting:channel:deploy "\$CHANNEL" \\\s*\n\s*--only app /);
    expect(deploy).toMatch(/--expires 7d/);
    expect(deploy).toMatch(/push to dev is deployed by \.github\/workflows\/deploy-dev\.yml/);
  });
});
