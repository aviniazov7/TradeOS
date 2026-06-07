/**
 * Cloudflare Worker — Google Sign-In proxy for iOS PWA
 *
 * iOS standalone PWA blocks signInWithIdp calls to identitytoolkit.googleapis.com.
 * This Worker proxies that call server-side, mints a Firebase custom token, and
 * returns it so the client can call signInWithCustomToken (which iOS does not block).
 *
 * Environment variables (Cloudflare Dashboard → Worker → Settings → Variables & Secrets):
 *   FIREBASE_API_KEY                  — Firebase Web API key
 *   FIREBASE_SERVICE_ACCOUNT_EMAIL    — service account client_email from JSON key file
 *   FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY — service account private_key (full PEM)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*', // '*' required — iOS PWA sends Origin: null
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const FIREBASE_PROJECT_ID = 'tradeos-91a58';
// Google publishes the RSA public keys (JWK form) used to sign Firebase ID
// tokens. The JWK endpoint lets SubtleCrypto.importKey('jwk', …) consume them
// directly — no fragile X.509/DER parsing. Imported keys are cached for the
// worker instance lifetime (refreshed every 30 min).
const GOOGLE_JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let GOOGLE_KEYS_CACHE = { keys: null, fetchedAt: 0 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function b64urlToBytesLocal(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getGoogleKeys() {
  const fresh = GOOGLE_KEYS_CACHE.keys && (Date.now() - GOOGLE_KEYS_CACHE.fetchedAt) < 30 * 60 * 1000;
  if (fresh) return GOOGLE_KEYS_CACHE.keys;
  const res = await fetch(GOOGLE_JWK_URL);
  if (!res.ok) throw new Error('fetch keys failed');
  const { keys } = await res.json();
  const map = {};
  for (const jwk of (keys || [])) {
    if (!jwk.kid) continue;
    try {
      map[jwk.kid] = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
    } catch { /* skip bad key */ }
  }
  GOOGLE_KEYS_CACHE = { keys: map, fetchedAt: Date.now() };
  return map;
}

// Verify a Firebase ID token: signature + standard claims. Returns the verified
// uid (sub) on success, null on any failure. Pinned to the tradeos-91a58
// project so a token from a different project — or a forged unsigned token —
// is rejected.
async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const keys = await getGoogleKeys();
    const key = keys[header.kid];
    if (!key) return null;

    const sig = b64urlToBytesLocal(parts[2]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.iat && payload.iat > now + 60) return null;
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (!payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    // /email-token — exchange a Firebase ID token (from email-link auth in Safari)
    // for a custom token the PWA can use with signInWithCustomToken
    if (url.pathname === '/email-token') {
      const { idToken } = body;
      if (!idToken || typeof idToken !== 'string') {
        return json({ error: 'Missing idToken' }, 400);
      }

      // Fully verify the Firebase ID token (signature against Google's public
      // keys + standard claims, pinned to this project) BEFORE minting. Decoding
      // the payload without verifying the signature would let an attacker forge
      // an unsigned JWT for any uid and obtain a real custom token for it.
      const uid = await verifyFirebaseToken(idToken);
      if (!uid) {
        return json({ error: 'Invalid ID token' }, 401);
      }

      try {
        const customToken = await mintCustomToken(
          uid,
          env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
          env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
        );
        return json({ customToken });
      } catch (err) {
        return json({ error: `Token minting failed: ${err.message}` }, 500);
      }
    }

    // Default route — Google ID token → custom token (original flow)
    const { idToken } = body;
    if (!idToken || typeof idToken !== 'string') {
      return json({ error: 'Missing idToken' }, 400);
    }

    // Exchange Google ID token for Firebase UID via server-side signInWithIdp
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${idToken}&providerId=google.com`,
          requestUri: 'https://tradeos-91a58.web.app',
          returnSecureToken: true,
          returnIdpCredential: true,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message || `Firebase signInWithIdp error ${res.status}`;
      return json({ error: msg }, res.ok ? 400 : res.status);
    }

    // Mint a Firebase custom token for this UID
    try {
      const customToken = await mintCustomToken(
        data.localId,
        env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
        env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
      );
      return json({ customToken });
    } catch (err) {
      return json({ error: `Token minting failed: ${err.message}` }, 500);
    }
  },
};

async function mintCustomToken(uid, serviceAccountEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
  };

  const b64url = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = b64url(header);
  const payloadB64 = b64url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Parse PEM — handle both literal \n and actual newlines (from Cloudflare secrets)
  const pemClean = privateKeyPem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemClean), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signatureB64}`;
}
