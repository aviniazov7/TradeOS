// One-time KV migration: copy every key (value + expiration) from the old
// Cloudflare account's ALERTS_KV to the new account's namespace.
// Read-only against the source; idempotent (re-running overwrites the same
// keys). Driven by .github/workflows/migrate-cf.yml.
//
// Env: OLD_ACCOUNT, NEW_ACCOUNT, OLD_KV, NEW_KV, CF_TOKEN_OLD, CF_TOKEN_NEW

const {
  OLD_ACCOUNT, NEW_ACCOUNT, OLD_KV, NEW_KV, CF_TOKEN_OLD, CF_TOKEN_NEW,
} = process.env;

if (!OLD_ACCOUNT || !NEW_ACCOUNT || !OLD_KV || !NEW_KV || !CF_TOKEN_OLD || !CF_TOKEN_NEW) {
  console.error('missing env');
  process.exit(1);
}

const API = 'https://api.cloudflare.com/client/v4';
const oldHeaders = { Authorization: `Bearer ${CF_TOKEN_OLD}` };
const newHeaders = { Authorization: `Bearer ${CF_TOKEN_NEW}` };

async function listAllKeys() {
  const keys = [];
  let cursor = '';
  for (let page = 0; page < 100; page++) {
    const url = `${API}/accounts/${OLD_ACCOUNT}/storage/kv/namespaces/${OLD_KV}/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url, { headers: oldHeaders });
    const j = await res.json();
    if (!j.success) throw new Error(`list failed: ${JSON.stringify(j.errors)}`);
    keys.push(...j.result);
    cursor = j.result_info?.cursor || '';
    if (!cursor) break;
  }
  return keys;
}

async function copyKey(k) {
  const name = encodeURIComponent(k.name);
  const getRes = await fetch(
    `${API}/accounts/${OLD_ACCOUNT}/storage/kv/namespaces/${OLD_KV}/values/${name}`,
    { headers: oldHeaders },
  );
  if (getRes.status === 404) return 'expired'; // vanished between list and get
  if (!getRes.ok) throw new Error(`get ${k.name}: ${getRes.status}`);
  const body = Buffer.from(await getRes.arrayBuffer());

  // Preserve the absolute expiration; skip keys that die within 2 minutes —
  // the KV API rejects expirations less than 60s away, and they are about to
  // vanish anyway.
  let qs = '';
  if (k.expiration) {
    if (k.expiration * 1000 - Date.now() < 120_000) return 'near-expiry-skip';
    qs = `?expiration=${k.expiration}`;
  }
  const putRes = await fetch(
    `${API}/accounts/${NEW_ACCOUNT}/storage/kv/namespaces/${NEW_KV}/values/${name}${qs}`,
    { method: 'PUT', headers: newHeaders, body },
  );
  if (!putRes.ok) throw new Error(`put ${k.name}: ${putRes.status} ${await putRes.text()}`);
  return 'copied';
}

const keys = await listAllKeys();
console.log(`source namespace has ${keys.length} keys`);

let copied = 0, skipped = 0, failed = 0;
const CONCURRENCY = 6;
for (let i = 0; i < keys.length; i += CONCURRENCY) {
  const batch = keys.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(copyKey));
  for (let r = 0; r < results.length; r++) {
    const res = results[r];
    if (res.status === 'fulfilled') {
      if (res.value === 'copied') copied++; else skipped++;
    } else {
      failed++;
      console.error(`FAILED ${batch[r].name}: ${res.reason?.message}`);
    }
  }
  if ((i / CONCURRENCY) % 10 === 0) console.log(`progress: ${Math.min(i + CONCURRENCY, keys.length)}/${keys.length}`);
}

console.log(`done: copied=${copied} skipped=${skipped} failed=${failed}`);
if (failed > 0) process.exit(1);
