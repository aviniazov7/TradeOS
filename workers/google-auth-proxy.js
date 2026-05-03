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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
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

      // Decode the Firebase ID token (JWT) to extract the UID.
      // Firebase JWTs are signed by Firebase; forging one requires Firebase's private key.
      let uid;
      try {
        const parts = idToken.split('.');
        if (parts.length !== 3) throw new Error('bad JWT format');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        uid = payload.user_id || payload.sub;
        if (!uid) throw new Error('no uid in token');
      } catch (err) {
        return json({ error: `Invalid ID token: ${err.message}` }, 401);
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
