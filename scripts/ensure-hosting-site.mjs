// Creates the production Hosting site (tradeos, then tradeosapp, then
// tradeos-app) in project tradeos-91a58 and adds that site's domains to
// Firebase Auth. Idempotent. Uses the CI service account in
// GOOGLE_APPLICATION_CREDENTIALS. Never prints the key or the access token.
//
// A name that already belongs to this project is reused. A name owned by
// another project is skipped. If the site that ends up available is not the
// one .firebaserc deploys to, the script exits 2 so CI does not deploy the
// app at the wrong host. Auth-domain failures are reported and do not fail
// the deploy: Hosting can still ship, and the log lists the console steps.

import { createSign } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROJECT_ID = 'tradeos-91a58';
export const SITE_CANDIDATES = ['tradeos', 'tradeosapp', 'tradeos-app'];

const HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';
const IDENTITY_API = 'https://identitytoolkit.googleapis.com/admin/v2';

export function expectedAppSite(rc, projectId = PROJECT_ID) {
  const id = rc?.targets?.[projectId]?.hosting?.app?.[0];
  if (!id || typeof id !== 'string') {
    throw new Error(`No hosting target "app" for ${projectId} in .firebaserc`);
  }
  return id;
}

export function domainsForSite(siteId) {
  return [`${siteId}.web.app`, `${siteId}.firebaseapp.com`];
}

export function mergeAuthorizedDomains(existing, additions) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map((d) => String(d).toLowerCase()));
  for (const raw of additions) {
    const domain = String(raw || '').trim();
    if (!domain || seen.has(domain.toLowerCase())) continue;
    seen.add(domain.toLowerCase());
    out.push(domain);
  }
  return out;
}

// getStatus / getAfterStatus: 200 means the site is in THIS project.
// createStatus 409 with no local site means another project owns the id.
export function classifySiteAttempt({ getStatus, createStatus, getAfterStatus }) {
  if (getStatus === 200 || getAfterStatus === 200) return 'ours';
  if (createStatus === 200 || createStatus === 201) return 'created';
  if (createStatus === 409) return 'taken';
  return 'error';
}

export function firstUsableSite(candidates, resultsById) {
  for (const id of candidates) {
    const result = resultsById[id];
    if (result === 'ours' || result === 'created') return id;
    if (result === 'taken') continue;
    return null;
  }
  return null;
}

export function manualAuthSteps(siteId, detail) {
  const domains = domainsForSite(siteId);
  return [
    `Firebase Auth authorized domains were not updated${detail ? ` (${detail})` : ''}.`,
    'Add these in Firebase Console → Authentication → Settings → Authorized domains:',
    ...domains.map((d) => `- ${d}`),
    '',
    `Google sign-in uses authDomain ${domains[0]}. Password-reset and email-verification links continue on that host (/__/auth/action).`,
    'If Google sign-in returns redirect_uri_mismatch, open the Google provider web client and add:',
    `- Authorized JavaScript origin: https://${domains[0]}`,
    `- Authorized redirect URI: https://${domains[0]}/__/auth/handler`,
    '',
    `Authorized domains: https://console.firebase.google.com/project/${PROJECT_ID}/authentication/settings`,
    `OAuth client: https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`,
    'The iOS PWA function verifies tokens for client 80529278454-eirltbaukcv1ftquu6uth5bbk3srnl7d.apps.googleusercontent.com.',
    'Also check Authentication → Sign-in method → Google → Web SDK configuration; that client is the one the popup uses.',
  ].join('\n');
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

async function accessToken() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set');
  const sa = JSON.parse(readFileSync(path, 'utf8'));
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account JSON is missing client_email or private_key');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const assertion = `${header}.${payload}.${signer.sign(sa.private_key, 'base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const reason = json.error || `HTTP ${res.status}`;
    throw new Error(`Could not mint a Google access token (${reason}).`);
  }
  return json.access_token;
}

async function api(token, url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      // Do not send x-goog-user-project. It makes Google require
      // serviceusage.services.use, which this CI service account does not
      // have (the same gap that blocks a rules deploy). The Hosting CLI
      // does not send the header, and Hosting deploy with this account works.
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text: text.slice(0, 600) };
}

function errorDetail(result) {
  const msg = result.json?.error?.message || result.json?.error || result.text || `HTTP ${result.status}`;
  return `${result.status} ${String(msg).slice(0, 300)}`;
}

async function ensureOneSite(token, siteId) {
  const get = await api(token, `${HOSTING_API}/projects/${PROJECT_ID}/sites/${siteId}`);
  if (get.status === 200) return { result: 'ours', detail: '' };
  if (get.status !== 404 && get.status !== 403) {
    return { result: 'error', detail: `lookup ${siteId}: ${errorDetail(get)}` };
  }
  const create = await api(token, `${HOSTING_API}/projects/${PROJECT_ID}/sites?siteId=${encodeURIComponent(siteId)}`, {
    method: 'POST',
    body: {},
  });
  if (create.status === 200 || create.status === 201) return { result: 'created', detail: '' };
  const message = `${create.json?.error?.message || ''} ${create.text || ''}`;
  const takenStatus = create.status === 409 || /already exists/i.test(message);
  if (!takenStatus) return { result: 'error', detail: `create ${siteId}: ${errorDetail(create)}` };
  const again = await api(token, `${HOSTING_API}/projects/${PROJECT_ID}/sites/${siteId}`);
  if (again.status === 200) return { result: 'ours', detail: '' };
  return { result: 'taken', detail: '' };
}

async function ensureAuthDomains(token, siteId) {
  const wanted = domainsForSite(siteId);
  const get = await api(token, `${IDENTITY_API}/projects/${PROJECT_ID}/config`);
  if (get.status !== 200) {
    return { ok: false, detail: `read config: ${errorDetail(get)}` };
  }
  const existing = get.json?.authorizedDomains || [];
  const merged = mergeAuthorizedDomains(existing, wanted);
  const added = merged.filter((d) => !existing.some((e) => String(e).toLowerCase() === d.toLowerCase()));
  if (added.length === 0) return { ok: true, domains: merged, added };
  const patch = await api(
    token,
    `${IDENTITY_API}/projects/${PROJECT_ID}/config?update_mask=authorizedDomains`,
    { method: 'PATCH', body: { authorizedDomains: merged } },
  );
  if (patch.status !== 200) {
    return { ok: false, detail: `update config: ${errorDetail(patch)}` };
  }
  return { ok: true, domains: patch.json?.authorizedDomains || merged, added };
}

function noteSummary(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

async function main() {
  const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
  const expected = expectedAppSite(rc);
  const token = await accessToken();
  const resultsById = {};
  let failure = '';
  for (const id of SITE_CANDIDATES) {
    const attempt = await ensureOneSite(token, id);
    resultsById[id] = attempt.result;
    console.log(`site ${id}: ${attempt.result}`);
    if (attempt.result === 'error') {
      failure = attempt.detail;
      break;
    }
    if (attempt.result === 'ours' || attempt.result === 'created') break;
  }
  if (failure) {
    console.error(`::error::${failure}`);
    process.exit(1);
  }
  const chosen = firstUsableSite(SITE_CANDIDATES, resultsById);
  if (!chosen) {
    console.error(`::error::None of ${SITE_CANDIDATES.join(', ')} is available in project ${PROJECT_ID}.`);
    process.exit(1);
  }
  console.log(`HOSTING_SITE=${chosen}`);
  console.log(`HOSTING_URL=https://${chosen}.web.app`);
  if (chosen !== expected) {
    console.error(`::error::.firebaserc deploys the app to "${expected}", but that id is taken. The available site is "${chosen}". Update the hosting target, redirects, and hardcoded URLs to ${chosen}, then re-run.`);
    process.exit(2);
  }
  const auth = await ensureAuthDomains(token, chosen);
  if (!auth.ok) {
    const steps = manualAuthSteps(chosen, auth.detail);
    console.error(`::warning::${auth.detail}`);
    console.error(steps);
    noteSummary(`### Authorized domains still pending\n\n${steps}\n`);
    console.log('AUTHORIZED_DOMAINS=pending');
    return;
  }
  console.log(`AUTHORIZED_DOMAINS=ok added=${auth.added?.length ? auth.added.join(',') : 'none'}`);
  noteSummary(`Hosting site \`${chosen}\` is ready. Authorized domains include ${domainsForSite(chosen).join(' and ')}.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`::error::${err.message || err}`);
    process.exit(1);
  });
}
