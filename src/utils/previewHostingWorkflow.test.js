import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const preview = readFileSync(fileURLToPath(new URL('../../.github/workflows/preview-hosting.yml', import.meta.url)), 'utf8');
const deploy = readFileSync(fileURLToPath(new URL('../../.github/workflows/deploy.yml', import.meta.url)), 'utf8');

function workflowOnBlock(text) {
  const start = text.indexOf('\non:');
  const end = text.indexOf('\npermissions:');
  return text.slice(start, end);
}

describe('main PR hosting preview workflow', () => {
  it('runs only for same-repo pull requests opened, updated, or reopened against main', () => {
    const on = workflowOnBlock(preview);
    expect(on).toContain('pull_request:');
    expect(on).toMatch(/types:\s*\[opened,\s*synchronize,\s*reopened\]/);
    expect(on).toMatch(/branches:\s*\[main\]/);
    expect(on).not.toContain('push:');
    expect(on).not.toContain('workflow_dispatch');
    expect(preview).toMatch(/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  });

  it('builds with the preview env and deploys Hosting target app for 7 days', () => {
    expect(preview).toMatch(/VITE_WORKER_URL:\s*https:\/\/trade-os\.tradeos\.workers\.dev/);
    expect(preview).toMatch(/VITE_ADMIN_NOTIF_PREVIEW:\s*'1'/);
    expect(preview).toMatch(/VITE_PLAN_BUILDER_DEMO:\s*'1'/);
    expect(preview).toMatch(/VITE_PUBLIC_DEMO:\s*'1'/);
    expect(preview).toMatch(/VITE_FIREBASE_AUTH_DOMAIN:\s*tradeoslive\.web\.app/);
    expect(preview).toMatch(/FirebaseExtended\/action-hosting-deploy@v0/);
    expect(preview).toMatch(/secrets\.FIREBASE_SERVICE_ACCOUNT/);
    expect(preview).toMatch(/secrets\.GITHUB_TOKEN/);
    expect(preview).toMatch(/projectId:\s*tradeos-91a58/);
    expect(preview).toMatch(/target:\s*app/);
    expect(preview).toMatch(/expires:\s*7d/);
    expect(preview).toMatch(/channelId:\s*pr-\$\{\{\s*github\.event\.number\s*\}\}/);
    expect(preview).not.toMatch(/channelId:\s*['"]?live['"]?/);
  });

  it('does not deploy Workers, rules, or functions', () => {
    expect(preview).not.toMatch(/wrangler/);
    expect(preview).not.toMatch(/firebase deploy/);
    expect(preview).not.toMatch(/firestore:rules/);
    expect(preview).not.toMatch(/--only\s+functions/);
    expect(preview).not.toMatch(/CLOUDFLARE_/);
  });

  it('leaves the production deploy on merge to main in deploy.yml', () => {
    expect(deploy).toMatch(/refs\/heads\/main/);
    expect(deploy).toMatch(/kind=production/);
    expect(deploy).toMatch(/firebase-tools deploy --only hosting:app --project tradeos-91a58/);
    expect(deploy).toMatch(/steps\.target\.outputs\.kind == 'production' && env\.CLOUDFLARE_API_TOKEN != ''/);
    expect(deploy).toMatch(/npx wrangler deploy/);
    const on = workflowOnBlock(deploy);
    expect(on).toMatch(/pull_request:[\s\S]*branches:\s*\[dev\]/);
    expect(on).not.toMatch(/branches:\s*\[main,\s*dev\]/);
    expect(on).toContain('- main');
  });
});
