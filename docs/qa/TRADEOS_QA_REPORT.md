# TradeOS QA / Security / Performance Audit: fix status

**Audit:** 2026-10-08, against https://tradeos-91a58.web.app (bundle `tradeos-v315`), test account only.
**Fixes:** 2026-10-09, PRs #508–#524 into `dev`, then released to `main`.

This file tracks each finding from the original report (`TRADEOS_QA_REPORT.md`, supplied by the owner) to the change that closed it. The original report holds the full repro steps and evidence.

Legend: `[x]` fixed · `[~]` partly fixed, or fixed in code with a manual step left for the owner · `[ ]` open, needs an owner decision.

---

## Critical

- [x] **[Security] Own-user doc allows privilege-shaped fields (`isPremium`, `isAdmin`, `admin`, `subscription`, `premiumUntil`)**
  - **Fix:** `firestore.rules` now allowlists the fields an owner may write. `ownerProfileKeys()` checks create and `affectedKeys()` on update, so every other field is Admin SDK / admin only, and `createdAt` can only be set on create.
  - **Tests:** `tests/rules/userDoc.rules.js` runs 35 emulator cases (`npm run test:rules`). 11 of them fail on the old rules.
  - **Shipped:** PR #514. The owner deployed the rules on 2026-10-09.

## High

- [~] **[Security] Content-Security-Policy is incomplete**
  - **Fix:** The full policy had been in `public/_headers`, which Firebase Hosting never reads. `firebase.json` now also sends a full `Content-Security-Policy-Report-Only`: no inline or eval script, plus connect/frame/img/font allowlists.
  - **Verified:** Zero violations on the production build with the local Hosting emulator, including Firebase login.
  - **Shipped:** PR #510.
  - **Left:** Switch to enforcing after a few days on `dev`/prod without issues. Not done yet.
- [x] **[Bugs] Market overview / ticker stuck on loading; 403/429 from exchange APIs; XAU twice, no BTC**
  - **Ticker (PR #508):** Each request times out after 8s. The ticker shows an error with retry when every feed fails, or a refresh button when some fail. A short list no longer loops, which is why XAU used to appear twice.
  - **Market page (PR #509):** Futures data comes from Bybit only, because `fapi.binance.com` is geo-blocked. Every empty panel shows "לא זמין כרגע" with "נסה שוב".
  - **Home page (PR #524):** Found while testing the `dev` deploy. The "השוק עכשיו" card read only the CoinGecko proxy, which was answering 429, and sat on "loading" for minutes. It now tries CoinPaprika first and shows an error with retry when every source fails.
- [x] **[Bugs] Signup error even though the account is created; displayName not saved**
  - **Cause:** `onAuthStateChanged` fired before `updateProfile`, so the first profile doc got the email prefix.
  - **Fix:** AuthContext keeps the name typed on the form. A failure after the account exists no longer counts as a failed signup. A full error map covers network errors on signup ("the account may already exist").
  - **Shipped:** PR #515. Verified end to end against the Auth/Firestore emulators.
- [x] **[Bugs] Failed login shows no error message**
  - **Fix:** An inline `role="alert"` box under the form handles submit, Google, password-rule and forgot-password errors.
  - **Shipped:** PR #516. Verified against the Auth emulator.
- [~] **[Security] Email enumeration; email verification not enforced; server password minimum 6**
  - **Fix:**
    - A single password policy (`passwordPolicy.js`) is used for signup and password change.
    - A verification email goes out at signup.
    - Unverified accounts see a reminder banner with resend and "I verified".
  - **Decision:** Remind, don't block. Every existing email account is unverified, so blocking would lock them out.
  - **Shipped:** PR #522.
  - **Owner, in the Firebase Console:**
    - Authentication → Settings → Password policy: min 8, uppercase, number, set to Require.
    - Turn on Email enumeration protection.

## Medium

- [ ] **[Security] Premium / free-plan limits are mostly client-side** (AI quota is already server-side)
  - **Status:** Open. The journal/wallet/exchange count limits are still enforced only in the UI.
  - **Recommendation:** Leave for now. No paid resource sits behind them, and the AI is already capped on the server.
  - **Options for later:** a counter field checked in rules, or creating journals through the Worker.
- [x] **[Security] `dangerouslySetInnerHTML` for AI output; raw markdown and RTL number glitches**
  - **Finding:** Every AI path already went through DOMPurify; that was verified.
  - **Fix:** `wrapLtrRuns()` isolates signed numbers, prices and unit-suffixed numbers in `<span dir="ltr">` for the AI chat, chart analyzer and coach bullets. The sanitizers allow only `dir`.
  - **Shipped:** PR #511.
- [x] **[SEO] `robots.txt` and `sitemap.xml` served as SPA HTML**
  - **Fix:** They are now real files. Only `/`, `/login` and `/accessibility` are open to crawlers.
  - **Shipped:** PR #513.
- [x] **[Performance] Large unused JS on `/login`; LCP about 4.5s**
  - **Fix:**
    - The signed-in shell (`Layout`) is lazy-loaded.
    - The Google script loads only on the page that uses it.
    - Unused Storage init was removed.
    - The entry chunk shrank from 128KB to 96KB gzip.
  - **Result:** Lighthouse mobile went from 60–65 to 87, and LCP from 6.4–7.3s to 3.2s (local static build).
  - **Shipped:** PR #520.
- [ ] **[UX] No public landing / pricing page; no Terms/Privacy at signup**
  - **Status:** Open. There are no Terms or Privacy pages in the codebase.
  - **Needs:** Legal text from the owner, plus a decision on a public landing page.
- [x] **[Bugs] Journal stats misleading on tiny samples; leaked `other` key**
  - **Fix:**
    - The score waits for 5 closed trades.
    - The win/loss ratio shows "—" until there is a loss, and there is no more "+$0.00" average loss.
    - The streak is worded properly in Hebrew.
    - `exchangeLabel()` hides `other`.
  - **Shipped:** PR #517.
- [x] **[Bugs] Future exit date allowed and then rejected on save; exit price/TP don't close until "סמן"; TP-hit button red on wins**
  - **Future times (PR #512):** Hours later today, and exits before the entry, are blocked and dimmed.
  - **Planned targets (PR #518):** A price without a % stays a planned target, on purpose. The form now explains how to record the exit.
  - **Button (PR #518):** The "בוצע" hover is neutral instead of red.
- [x] **[Bugs] First "עסקה חדשה" click does nothing (lazy-load race); route change keeps scroll position**
  - **Fix:** The trade form chunk is preloaded and shows a loading spinner. `#app-scroll` returns to the top on every page change.
  - **Shipped:** PR #519.

## Low

- [x] **[Accessibility] Muted text contrast; `user-scalable=no` / `maximum-scale=1`**
  - **Fix:**
    - The muted color changed from `#606070` to `#80808f` (≥4.5:1).
    - Pinch-zoom is allowed.
    - Form fields are 16px on iOS only, so iOS doesn't auto-zoom on focus.
  - **Result:** Lighthouse accessibility went from 90 to 100.
  - **Shipped:** PR #521.
- [x] **[Accessibility] RollingNumber unreadable for screen readers; accessibility widget overlapping the form**
  - **Fix:** Screen readers get one `sr-only` value, and the animated columns are hidden from them. The widget sits low on pages without the bottom nav.
  - **Shipped:** PR #521.
- [~] **[UX] Greeting uses the email prefix; onboarding only on `/journal`; free limits not shown on Journal; mobile tab clipped; news layout**
  - **Fixed:** The greeting now uses the signup name (PR #515).
  - **Already fine:**
    - The tab clipping no longer reproduces at 360px; the journal tabs were redesigned earlier.
    - The journal switcher already shows the journal count.
  - **Not changed:** onboarding placement and news layout.
- [~] **[SEO] Soft 404s**
  - **Fixed:** Unknown in-app URLs show a Hebrew "page not found" screen (PR #513).
  - **Left:** The HTTP status is still 200 (SPA). A real 404 status would need a server function, which isn't worth it for a login-gated app.
- [x] **[Security] Admin UI chunk is downloadable**
  - **Status:** No change needed. Worker admin routes return 403 to non-admins, and the chunk holds UI only.
- [ ] **[Security] Exchange keys go through the Worker (good)**
  - **Correction:** The report's 403 on `users/{uid}/exchanges` is expected. That collection doesn't exist; connection data lives in `settings/exchanges`, which only the owner can read.
  - **New finding:** Older accounts may still hold plaintext `apiKey`/`apiSecret` in `settings/exchanges`. The client still checks for them in `useLinkedExchangeBalance`.
  - **Needs:** The owner's approval for a one-time cleanup script that the owner runs (it touches real data).

---

## Also fixed along the way

- PR previews weren't being created. The project had hit Firebase's preview-channel limit (429), and CI still reported success. 49 stale channels were deleted on 2026-10-09.
- Dev-only `VITE_USE_EMULATORS=true` plus an `emulators` block in `firebase.json` allow local end-to-end tests without touching production data.
