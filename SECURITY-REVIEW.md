# TradeOS — Security Review

**Date:** 2026-06-07
**Branch:** `security-checklist`
**Scope:** Full security-sensitive surface of the current branch (Cloudflare
Workers, Firebase Functions, Firestore rules, client auth/services). There was
no diff to review (the branch was freshly created with no merge base against
`main`), so this is a full-codebase pass focused on the trust boundaries.

---

## Summary

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | **Critical** | `workers/google-auth-proxy.js` | `/email-token` mints a Firebase custom token from an **unverified** ID token → account takeover |
| 2 | **High** | `firestore.rules` (`authBridge`) | Custom tokens are world-readable and keyed by email; `update` allowed despite "immutable" comment |
| 3 | Medium | `worker/index.js` | Unauthenticated Telegram endpoints (`/notify`, `/daily-stats`, `/alerts`, `/chatid`) allow spoofing & IDOR |
| 4 | Low | `worker/index.js` | `/exchange/*` endpoints are not auth-gated (limited: caller supplies own keys) |
| 5 | Low | `worker/index.js` | `/cg/` and `/bnb/` act as open proxies (host-restricted) |

**Good practices observed:** all HTML rendering goes through DOMPurify with
restrictive allowlists (no XSS found); Firestore rules include a
privilege-escalation guard on `users/{uid}`; the main worker properly verifies
Firebase ID tokens (signature + `aud`/`iss`/`exp`); the Firebase Function
`googleSignIn` correctly verifies Google ID tokens via `OAuth2Client`.

---

## 1. Critical — Custom token minted from an unverified ID token

**File:** `workers/google-auth-proxy.js`, `/email-token` route (lines 48–77)

The handler base64-decodes the JWT payload and extracts the uid **without ever
verifying the signature**:

```js
const parts = idToken.split('.');
if (parts.length !== 3) throw new Error('bad JWT format');
const payload = JSON.parse(atob(parts[1]...));   // ← decode only, no verify
uid = payload.user_id || payload.sub;
...
const customToken = await mintCustomToken(uid, ...); // ← signs for ANY uid
```

The inline comment ("Firebase JWTs are signed by Firebase; forging one requires
Firebase's private key") describes a check that **does not happen**. An
attacker can craft an arbitrary unsigned JWT `{"user_id":"<victim_uid>"}`, POST
it to `/email-token`, and receive a service-account-signed Firebase custom
token for that uid, then call `signInWithCustomToken` → **full account
takeover of any user**.

**Exploit chain is complete:** user UIDs are not secret — the `leaderboard`
collection uses the uid as the document ID (`request.auth.uid == entryId`) and
is readable by any signed-in user, so an attacker can enumerate victim UIDs and
take over their accounts.

**Fix:** Verify the Firebase ID token's RS256 signature against Google's public
keys and validate `aud`/`iss`/`exp` before minting — the main worker already
implements exactly this in `verifyFirebaseToken()` (`worker/index.js:849`).
Reuse that logic here. Reject the request if verification fails.

---

## 2. High — `authBridge` custom tokens are world-readable

**Files:** `firestore.rules:113–119`, `src/components/auth/AuthEmailLink.jsx:53`

```
match /authBridge/{docId} {
  allow read: if true;                       // ← anyone, unauthenticated
  allow create, update: if request.resource.data.keys().hasAll([...]) ...
  allow delete: if true;
}
```

The document stores a **Firebase custom token** (a full sign-in credential) and
is created with the **email address as the document ID**:

```js
await setDoc(doc(db, 'authBridge', email), { customToken, email, exp: ... });
```

Because `read: if true` and the doc ID is the (guessable/known) email, anyone
who knows a victim's email can poll `authBridge/{email}` and read the custom
token during the 5-minute TTL window after the victim performs email-link
sign-in → account takeover. The TTL/single-use are app-level conventions; the
rules do not enforce them.

Two additional problems with the same rule:
- `update` is permitted even though the comment says "update: blocked — tokens
  must be immutable". An attacker can overwrite a pending token.
- `delete: if true` lets anyone delete another user's pending bridge token (DoS
  of the sign-in flow).

**Fix:** Don't relay a long-lived credential through a world-readable
collection. Options, best first:
1. Have the PWA call the worker directly for its own custom token instead of
   bouncing it through Firestore.
2. If a bridge doc is required, key it by an unguessable random nonce (returned
   to the originating tab), restrict `read`/`delete` to that nonce-holder, and
   drop `update` entirely. Never use the email as the key.

---

## 3. Medium — Unauthenticated Telegram endpoints (spoofing / IDOR)

**File:** `worker/index.js`

- `POST /notify` (3425) and `POST /daily-stats` (2803): take `uid` from the
  body with no auth and send a Telegram message to / store stats for the chat
  linked to that uid. An attacker who knows a uid can push **spoofed trade
  notifications** ("🎯 Take Profit …") to that user's Telegram or poison their
  daily-stats. UIDs are enumerable via the leaderboard (see #1).
- `POST /alerts` (2814), `DELETE /alerts/{chatId}/{id}` (2822),
  `GET /alerts/{chatId}` (2827): full price-alert CRUD keyed only by `chatId`,
  no auth → anyone can create/list/delete another chat's alerts (IDOR).
- `GET /chatid/{uid}` (2835): returns the Telegram `chatId` for any uid with no
  auth → links a Firebase uid to a Telegram chat (info disclosure).

**Fix:** Require a verified Firebase ID token (`verifyFirebaseToken`) and derive
the uid from the token, not the body. For chat-scoped routes, verify the caller
owns the mapping (`uid:{uid}` ↔ chatId) before acting.

---

## 4. Low — `/exchange/*` endpoints not authenticated

**File:** `worker/index.js` (`/exchange/open-positions` 3527, `/exchange/balance`
3756, `/exchange/sync` 3967)

These sign and forward requests to exchanges using credentials supplied **in
the request body**, with no Firebase auth. Abuse surface is limited because the
caller must already possess valid exchange API keys, but it does let the worker
be used as an anonymous signing/relay oracle to the exchanges. The comparable
`/wallet` endpoint (3846) is correctly auth-gated to protect the Moralis quota —
apply the same gate here for consistency and to keep the worker from being a
free relay.

---

## 5. Low — Open proxies `/cg/` and `/bnb/`

**File:** `worker/index.js` (`/cg/` 2866, `/bnb/` 2885)

Both append the request path/query to a fixed upstream host
(`api.coingecko.com`, `api.binance.com`) and return the response with KV
caching. The host is hard-coded so this is not SSRF to arbitrary targets, but it
is an anonymous, cache-backed proxy to those APIs that anyone can drive. Low
impact; consider a basic rate-limit or auth if upstream cost/quota becomes a
concern.

---

## Notes / not issues

- `src/services/firebase.js` ships the Firebase Web `apiKey` in client code —
  this is expected and safe for Firebase (it is an identifier, not a secret);
  access is governed by Firestore/Storage rules.
- VAPID **public** key in `worker/index.js` is intentionally public; the private
  key is an env secret (`VAPID_JWK`). Correct.
- All `dangerouslySetInnerHTML` call sites (`AIChat.jsx`, `AICoachPanel.jsx`,
  `CoinAnalysis.jsx`) sanitize through DOMPurify with tag allowlists. No XSS
  found.
