// Creates the extra Firebase Hosting site (if needed) and adds its domains to
// Firebase Auth authorized domains. Uses the CI service account in
// GOOGLE_APPLICATION_CREDENTIALS. Does not print the key.
//
// Site ids, in order: tradeos-app, tradeosapp, tradeos-journal. The first one
// this project already owns wins; otherwise the first name that can be created
// wins. .firebaserc's hosting target "app" is updated to that id so the deploy
// in the same job targets it.
//
// Authorized-domain update is additive. A permission error is reported and does
// not fail the process — Hosting can still deploy, and the log says what is left.
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ID = 'tradeos-91a58';
export const SITE_CANDIDATES = ['tradeos-app', 'tradeosapp', 'tradeos-journal'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RC_PATH = resolve(ROOT, '.firebaserc');

export function siteIdFromName(name) {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1] || '';
}

export function preferredOwnedSite(ownedIds, candidates = SITE_CANDIDATES) {
  const owned = new Set(ownedIds);
  return candidates.find((id) => owned.has(id)) || null;
}

export function nameTaken(status, body) {
  if (status === 409) return true;
  const msg = `${body?.error?.status || ''} ${body?.error?.message || ''}`.toLowerCase();
  return msg.includes('already exists')
    || msg.includes('already in use')
    || msg.includes('reserved')
    || msg.includes('not available');
}

export function domainsForSite(siteId) {
  return [`${siteId}.web.app`, `${siteId}.firebaseapp.com`];
}

export function mergeAuthorizedDomains(existing, siteId) {
  const domains = Array.isArray(existing) ? [...existing] : [];
  const added = [];
  for (const domain of domainsForSite(siteId)) {
    if (!domains.includes(domain)) {
      domains.push(domain);
      added.push(domain);
    }
  }
  return { domains, added };
}

export function withAppTarget(rc, siteId, projectId = PROJECT_ID) {
  const next = structuredClone(rc);
  next.projects = next.projects || { default: projectId };
  next.targets = next.targets || {};
  next.targets[projectId] = next.targets[projectId] || {};
  next.targets[projectId].hosting = next.targets[projectId].hosting || {};
  next.targets[projectId].hosting.app = [siteId];
  if (!next.targets[projectId].hosting.legacy) {
    next.targets[projectId].hosting.legacy = [projectId];
  }
  return next;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const assertion = `${header}.${payload}.${signer.sign(sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`token ${res.status}: ${data.error || 'no access_token'} ${data.error_description || ''}`.trim());
  }
  return data.access_token;
}

async function api(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
  }
  return { ok: res.ok, status: res.status, body };
}

async function listSiteIds(token) {
  const ids = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const { ok, status, body } = await api(token, url);
    if (!ok) {
      const message = body?.error?.message || `HTTP ${status}`;
      throw new Error(`list sites failed (${status}): ${message}`);
    }
    for (const site of body?.sites || []) ids.push(siteIdFromName(site.name));
    pageToken = body?.nextPageToken || '';
  } while (pageToken);
  return ids;
}

async function createSite(token, siteId) {
  const url = `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites?siteId=${encodeURIComponent(siteId)}`;
  return api(token, url, { method: 'POST', body: '{}' });
}

async function ensureAuthorizedDomains(token, siteId) {
  const getUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
  const current = await api(token, getUrl);
  if (!current.ok) {
    const message = current.body?.error?.message || `HTTP ${current.status}`;
    console.log(`::warning::Could not read Auth config (${current.status}): ${message}`);
    console.log('AUTH_DOMAINS_STATUS=failed');
    console.log('AUTH_DOMAINS_MANUAL=Firebase Console → Authentication → Settings → Authorized domains. Add '
      + `${domainsForSite(siteId).join(' and ')}.`);
    return;
  }
  const { domains, added } = mergeAuthorizedDomains(current.body?.authorizedDomains, siteId);
  if (!added.length) {
    console.log(`AUTH_DOMAINS_STATUS=ok`);
    console.log(`AUTH_DOMAINS_ADDED=none`);
    return;
  }
  const patchUrl = `${getUrl}?updateMask=authorizedDomains`;
  const patched = await api(token, patchUrl, {
    method: 'PATCH',
    body: JSON.stringify({ authorizedDomains: domains }),
  });
  if (!patched.ok) {
    const message = patched.body?.error?.message || `HTTP ${patched.status}`;
    console.log(`::warning::Could not add authorized domains (${patched.status}): ${message}`);
    console.log('AUTH_DOMAINS_STATUS=failed');
    console.log('AUTH_DOMAINS_MANUAL=Firebase Console → Authentication → Settings → Authorized domains. Add '
      + `${added.join(' and ')}.`);
    return;
  }
  console.log('AUTH_DOMAINS_STATUS=ok');
  console.log(`AUTH_DOMAINS_ADDED=${added.join(',')}`);
}

function syncFirebaserc(siteId) {
  const rc = JSON.parse(readFileSync(RC_PATH, 'utf8'));
  const current = rc.targets?.[PROJECT_ID]?.hosting?.app?.[0] || '';
  if (current === siteId) return;
  const next = withAppTarget(rc, siteId);
  writeFileSync(RC_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`::warning::.firebaserc app target changed from "${current || '(unset)'}" to "${siteId}". Commit that file.`);
}

function manualSiteHelp() {
  console.log('Create the site manually, then re-run this deploy:');
  console.log(`  npx firebase-tools hosting:sites:create tradeos-app --project ${PROJECT_ID}`);
  console.log('If that id is taken, try tradeosapp, then tradeos-journal, and set .firebaserc targets.'
    + `${PROJECT_ID}.hosting.app to the id that was created.`);
}

async function main() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
    manualSiteHelp();
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  const token = await accessToken(sa);
  const owned = await listSiteIds(token);
  console.log(`HOSTING_SITES_OWNED=${owned.join(',')}`);

  let siteId = preferredOwnedSite(owned);
  if (!siteId) {
    for (const candidate of SITE_CANDIDATES) {
      const created = await createSite(token, candidate);
      if (created.ok) {
        siteId = candidate;
        console.log(`HOSTING_SITE_CREATED=${siteId}`);
        break;
      }
      if (nameTaken(created.status, created.body)) {
        console.log(`HOSTING_SITE_TAKEN=${candidate}`);
        continue;
      }
      const message = created.body?.error?.message || `HTTP ${created.status}`;
      console.error(`Failed to create Hosting site ${candidate} (${created.status}): ${message}`);
      manualSiteHelp();
      process.exit(1);
    }
  }
  if (!siteId) {
    console.error(`Every candidate is taken: ${SITE_CANDIDATES.join(', ')}`);
    process.exit(1);
  }
  console.log(`HOSTING_SITE=${siteId}`);
  await ensureAuthorizedDomains(token, siteId);
  const rc = JSON.parse(readFileSync(RC_PATH, 'utf8'));
  const configured = rc.targets?.[PROJECT_ID]?.hosting?.app?.[0] || '';
  if (configured !== siteId) {
    console.error(`::error::Hosting site is ${siteId}, but .firebaserc targets "${configured}". Update the repo to ${siteId} and re-run.`);
    process.exit(2);
  }
  syncFirebaserc(siteId);
  console.log('OAUTH_REDIRECT_MANUAL=Google Cloud Console → APIs & Services → Credentials → the Web client. '
    + `Add Authorized JavaScript origin https://${siteId}.web.app and redirect URI `
    + `https://${siteId}.web.app/__/auth/handler. Keep the tradeos-91a58.web.app entries. `
    + `https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
