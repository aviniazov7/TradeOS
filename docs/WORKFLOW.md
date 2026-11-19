# TradeOS deploy workflow

```
feature/* or fix/*  →  PR  →  dev  →  PR  →  main
```

`main` is production. Do not push to it directly. Do not merge this document's change until the checks on the pull request are green. Merging to `main` deploys production.

GitHub's **Automatically delete head branches** deletes the head branch of a merged pull request. A release pull request uses `dev` as that head, so the setting removes `dev` and staging deploys stop. Do not let it delete `dev`. Add a branch protection rule on `dev` (Settings → Branches → Add branch protection rule, name pattern `dev`). GitHub does not auto-delete a protected branch. If `dev` is missing, recreate it from current `main` with no extra commits and push it. Do not force-push it.

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
| Hosting | `https://tradeoslive--dev-0qe24kd4.web.app` |

That host is the Firebase channel `dev` on site `tradeoslive` (the same URL the last push to `dev` printed, 2026-10-26). Redeploying channel id `dev` keeps it. The site on that channel is built with `VITE_WORKER_URL=https://trade-os-staging.tradeos.workers.dev` once this workflow is on `dev`.

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
- **Durable Object** `AiQuotaDO` is created for the staging script on its first deploy. It does not attach to the production script's objects.

## What staging keeps separate

- **KV** `ALERTS_KV` on `env.staging` is namespace `ac57c9487d5044eda008e06100a05758`. Production stays on `5c66041d98aa4229a52afeb2f5b1f652`. The same staging id is set in `wrangler.jsonc` and in `worker/wrangler.toml` `[[env.staging.kv_namespaces]]`. Exchange keys, coupons, push subscriptions, and other KV state are not shared.
- **`CREDS_ENCRYPTION_KEY`** on `trade-os-staging` is a staging-only value, already set on that Worker. Deploy does not copy the production key. Data encrypted with the production key cannot be decrypted in staging, and the production KV rows are not in this namespace. Reconnect each exchange on the dev channel so the connection is written into staging KV with the staging key.

## Manual steps

Do these in the app accounts (Cloudflare account that owns `trade-os`, Firebase project `tradeos-91a58`). A local Wrangler login that is not that account must not deploy.

### 1. Put this workflow on `dev`

This file ships through a pull request into `main`. After that pull request is merged, merge `main` into `dev` (or open a pull request into `dev`). The staging workflow runs from the commit that is on `dev`. Until then, a push to `dev` still uses whatever workflow is already on that branch.

### 2. Firebase Auth authorized domain

`firebase hosting:channel:deploy` tries to add the channel host to Firebase Auth. If the log says `Unable to add channel domain to Firebase Auth`, add the exact host from the job summary (no wildcard; `tradeoslive--*` is not accepted):

[Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/tradeos-91a58/authentication/settings)

Keep `tradeoslive.web.app`, `tradeoslive.firebaseapp.com`, and `tradeos-91a58.firebaseapp.com` on that list. `authDomain` stays `tradeoslive.web.app`.

Email/password sign-in works after that host is listed. It fails with `auth/unauthorized-domain` until then.

Google sign-in also needs the channel origin and `https://<channel-host>/__/auth/handler` on the Google OAuth web client. That client already allows `https://tradeoslive.web.app`. Preview hosts often cannot complete Google sign-in until the client is updated. Do not remove `https://tradeos-91a58.firebaseapp.com/__/auth/handler`.

### 3. Cloudflare secrets on `trade-os-staging`

A push to `dev` copies these GitHub Actions secrets onto `trade-os-staging` when they are set:

- `VAPID_JWK`
- `MORALIS_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `RESEND_API_KEY`
- `MAIL_FROM_ADDRESS`
- `MAIL_FROM_NAME`
- `MAIL_TO_ADMIN_OVERRIDE`

These are not uploaded from GitHub Actions. A value already on `trade-os-staging` stays there. Writing the matching production GitHub secret would overwrite it:

- `CREDS_ENCRYPTION_KEY` — staging-only encryption key. Reconnect exchanges on the dev channel (see above). Without this secret, exchange connect returns 503.
- `UNSUBSCRIBE_SECRET` — staging-only. Without it, marketing mail returns 503.
- `CF_ACCOUNT_ID` — staging-only, already set on the Worker.
- `GMAIL_APP_PASSWORD` — left as already stored on the Worker. The production GitHub secret is not copied.

`CF_API_TOKEN` is uploaded only from the GitHub secret `STAGING_CF_API_TOKEN`, and only when that secret is non-empty. A missing or empty `STAGING_CF_API_TOKEN` skips the upload and leaves the token already on `trade-os-staging`. The job never writes `secrets.CF_API_TOKEN` (the production token).

Secrets are per script. Leaving a name off this job does not change `trade-os`.

### 4. Staging KV namespace

The staging namespace id is `ac57c9487d5044eda008e06100a05758`, bound as `ALERTS_KV` under `env.staging` in `wrangler.jsonc` and `worker/wrangler.toml`. Do not point either binding back at the production id `5c66041d98aa4229a52afeb2f5b1f652`.

`worker/wrangler.toml` `[env.staging]` is still not deployed by CI. Its cron list is empty. Do not deploy the alerts cron for staging until a staging cron is intentional. Production cron stays `tradeos-alerts`, deployed from `main`.

## CORS and CSP

The Worker allows `https://tradeoslive--<channel>.web.app` (including the `dev` channel) and `https://trade-os-staging.tradeos.workers.dev`.

The Hosting report-only Content-Security-Policy allows `https://*.web.app` (CSP cannot wildcard the middle of a label, so `tradeoslive--*` is invalid) and `https://trade-os-staging.tradeos.workers.dev` in `connect-src`. `frame-src` allows `https://*.web.app` for the auth handler on a preview host.
