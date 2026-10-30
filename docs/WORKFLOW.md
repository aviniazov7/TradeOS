# TradeOS deploy workflow

```
feature/* or fix/*  →  PR  →  dev  →  PR  →  main
```

`main` is production. Do not push to it directly. Do not merge this document's change until the checks on the pull request are green. Merging to `main` deploys production.

| Trigger | Workflow | What deploys |
|---|---|---|
| Push to `main` | `.github/workflows/deploy.yml` | Cache version bump, live Hosting on site `tradeoslive` (`https://tradeoslive.web.app`, project `tradeos-91a58`), Worker `trade-os`, cron Worker `tradeos-alerts` |
| Push to `dev` | `.github/workflows/deploy-dev.yml` | Hosting preview channel `dev` on site `tradeoslive`, and Worker `trade-os-staging` |
| Push to `feature/*`, `fix/*`, `hotfix/*` | `deploy.yml` | Hosting preview channel only (7 days). The build calls the production Worker |
| Pull request into `dev` | `deploy.yml` | Hosting preview channel `pr-<number>` (7 days) and a comment on the PR. Does not deploy Workers |
| Pull request into `main` | `.github/workflows/preview-hosting.yml` | Hosting preview channel `pr-<number>` (7 days) on target `app`. Does not deploy Workers. Same file as [PR #616](https://github.com/aviniazov7/TradeOS/pull/616), so the two do not open a second channel |

Channel `dev` and channel `pr-<number>` are different Firebase channels, so a pull request into `dev` does not replace staging.

## Staging URLs

| Surface | URL |
|---|---|
| Worker | `https://trade-os-staging.tradeos.workers.dev` |
| Hosting | `https://tradeoslive--dev-<hash>.web.app` |

The hash is chosen by Firebase the first time channel `dev` is deployed and stays with that channel id. The GitHub Actions job summary for `Deploy TradeOS staging` prints the full host. The site on that channel is built with `VITE_WORKER_URL=https://trade-os-staging.tradeos.workers.dev`.

Firebase preview channels expire in at most 30 days. Every push to `dev` sets the expiry to 30 days again. A quiet `dev` branch (no push for 30 days) drops the channel; the next push creates it again under the same channel id.

Production (`https://tradeoslive.web.app` and `https://trade-os.tradeos.workers.dev`) changes only when `deploy.yml` runs on a push to `main`.

## Why the staging Worker command is specific

`npm run build` writes `.wrangler/deploy/config.json`. A bare `wrangler deploy` follows that file and uploads **`trade-os`**. Staging CI does not do that. It runs:

```bash
node scripts/staging-worker-target.mjs
npx wrangler deploy --config wrangler.jsonc --env staging
```

The script reads `env.staging` and exits unless the Worker name is `trade-os-staging`. The same flag is used for `wrangler secret put`. There is no cron on this Worker. `tradeos-alerts` still deploys only from `main`.

## What staging shares with production

- **Firestore** is one database. Writes from the dev channel are production data.
- **KV** `ALERTS_KV` on `env.staging` is still namespace `5c66041d98aa4229a52afeb2f5b1f652` (the production namespace). Exchange keys, coupons, and push state are shared until that id is replaced. See the manual step below.
- **Durable Object** `AiQuotaDO` is created for the staging script on its first deploy. It does not attach to the production script's objects.

## Manual steps

Do these in the app accounts (Cloudflare account that owns `trade-os`, Firebase project `tradeos-91a58`). The laptop `wrangler` login is the personal Cloudflare account and must not deploy.

### 1. Put this workflow on `dev`

This file ships through a pull request into `main`. After that pull request is merged, merge `main` into `dev` (or open a pull request into `dev`). The staging workflow runs from the commit that is on `dev`. Until then, a push to `dev` still uses whatever workflow is already on that branch.

### 2. Firebase Auth authorized domain

`firebase hosting:channel:deploy` tries to add the channel host to Firebase Auth. If the log says `Unable to add channel domain to Firebase Auth`, add the exact host from the job summary (no wildcard; `tradeoslive--*` is not accepted):

[Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/tradeos-91a58/authentication/settings)

Keep `tradeoslive.web.app`, `tradeoslive.firebaseapp.com`, and `tradeos-91a58.firebaseapp.com` on that list. `authDomain` stays `tradeoslive.web.app`.

Email/password sign-in works after that host is listed. It fails with `auth/unauthorized-domain` until then.

Google sign-in also needs the channel origin and `https://<channel-host>/__/auth/handler` on the Google OAuth web client. That client already allows `https://tradeoslive.web.app`. Preview hosts often cannot complete Google sign-in until the client is updated. Do not remove `https://tradeos-91a58.firebaseapp.com/__/auth/handler`.

### 3. Cloudflare secrets on `trade-os-staging`

The first successful push to `dev` creates the Worker and copies GitHub Actions secrets onto it when they are set:

- `VAPID_JWK`
- `MORALIS_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `RESEND_API_KEY`
- `MAIL_FROM_ADDRESS`
- `MAIL_FROM_NAME`
- `MAIL_TO_ADMIN_OVERRIDE`
- `GMAIL_APP_PASSWORD`
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`
- `CREDS_ENCRYPTION_KEY` (copied only if the GitHub secret exists)
- `UNSUBSCRIBE_SECRET` (copied only if the GitHub secret exists)

`CREDS_ENCRYPTION_KEY` and `UNSUBSCRIBE_SECRET` are set on production `trade-os` from the dashboard and are not in the production deploy's secret list. If the staging log says they were skipped, copy the same values to **Workers & Pages → trade-os-staging → Settings → Variables and Secrets**. Without `CREDS_ENCRYPTION_KEY`, exchange connect returns 503. Without `UNSUBSCRIBE_SECRET`, marketing mail returns 503.

Secrets are per script. Copying them does not change `trade-os`.

### 4. Optional: a staging KV namespace

Create a KV namespace in the app Cloudflare account and replace the `ALERTS_KV` id under `env.staging` in `wrangler.jsonc`. Until that change, staging HTTP uses production KV. Do not deploy `worker/wrangler.toml` `[env.staging]` (alerts cron) until the cron Worker has its own namespace. That env has an empty cron list and is not in CI.

## CORS and CSP

The Worker allows `https://tradeoslive--<channel>.web.app` (including the `dev` channel) and `https://trade-os-staging.tradeos.workers.dev`.

The Hosting report-only Content-Security-Policy allows `https://*.web.app` (CSP cannot wildcard the middle of a label, so `tradeoslive--*` is invalid) and `https://trade-os-staging.tradeos.workers.dev` in `connect-src`. `frame-src` allows `https://*.web.app` for the auth handler on a preview host.
