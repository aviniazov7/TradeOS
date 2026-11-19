# Working on TradeOS

Operational rules for any AI agent (Claude) working in this repo, on any
machine. Full product/architecture details are in `README.md`.

## Git workflow — MANDATORY

Never push directly to `main`. Always work on a feature branch and open a PR.

```
[feature/X] → PR → [dev] → ✅ tested in staging → PR → [main] → 🚀 prod
```

### Branch convention

- `main` — production. **No direct pushes.** Only reached via merge from `dev`
  (releases) or `hotfix/*` (emergency fixes).
- `dev` — staging. A push deploys the fixed Hosting channel `dev` and the
  Worker `trade-os-staging`. **Merge here first**, validate staging, then
  promote to `main`. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
- `feature/<short-name>` — new functionality. PR → `dev`.
- `fix/<short-name>` — bug fix. PR → `dev` (or `main` if production-critical).
- `hotfix/<short-name>` — production emergency. PR straight to `main`.

### Deploy automation (GitHub Actions, `.github/workflows/deploy.yml`)

| Trigger | What happens |
|---|---|
| Push to `main` | Auto-bumps version → builds → deploys Hosting (live) + Worker (production) |
| Push to `dev` | `.github/workflows/deploy-dev.yml` builds against `trade-os-staging`, deploys that Worker, and deploys Hosting channel `dev` (30-day expiry, renewed on each push). Does not deploy production. |
| Push to `feature/*`, `fix/*`, `hotfix/*` | Builds → deploys Hosting preview channel (uses staging Worker) |
| Pull request to `dev` | Same as feature push + posts the preview URL as a PR comment |
| Pull request to `main` (same repo, opened/synchronize/reopened) | `.github/workflows/preview-hosting.yml` builds and deploys a Hosting preview channel on target `app` (site `tradeoslive`) for 7 days, and comments the URL. No Workers, rules, or functions |

Feature and pull-request preview channels live 7 days then auto-delete. The `dev` channel is renewed to 30 days on every push to `dev` (Firebase's maximum for a preview channel).

### Identity

- Author name: `Avraham Niazov`. Do not commit a personal email address.
- **No third-party trailers** (no Co-authored-by, no "Generated with…") in commits.
- **Commit messages and PR titles are always in English.** Changelog entries
  are English too. (Chat/summaries stay in Hebrew; git history is English-only.
  Never rewrite existing commits.)

## Release workflow (version bump)

**Full decision guide: [`docs/VERSIONING.md`](docs/VERSIONING.md)** — read it
before releasing. Summary:

- `CACHE_NAME` (`public/sw.js`) is **auto-bumped** on every push to `main` (via
  `scripts/bump-version.mjs`) — this makes the service worker take over silently
  on the user's next open (there is no update prompt). Never touch it manually.
- `APP_VERSION` (`src/utils/constants.js`) is the **marketing version, set by
  hand**, currently `2.4.0`. A normal release does NOT require bumping
  it. Bump it (semver MAJOR/MINOR/PATCH — see the guide) only for a
  user-visible milestone, and only as the owner's call. When in doubt, don't
  bump — just release.

## Build & lint

- `npm run build` must pass on every PR.
- The repo has ~160 pre-existing lint errors (duplicate keys in coin lists,
  `worker/index.js`, motion/JSX-uses-vars false positives). These are
  NOT deploy blockers. Just don't add NEW lint errors in files you change.
- Keep all Firebase SDK access inside `src/services/`. Hooks/components must
  use service functions, never import `firebase/*` directly.

## Deploying

Deploys are **fully automated**. Push your branch, GitHub Actions deploys it.
No manual `npm run deploy` needed for hosting or the Worker.

The only thing that still needs manual deployment is **Firestore rules**:

```bash
firebase deploy --only firestore:rules
```

The CI Firebase service account lacks the `serviceusage.serviceUsageViewer`
permission, so rules deploys 403. Run it manually whenever `firestore.rules`
changes. Firebase Storage is not used.

## Environments — what's separated, what's shared

- **Hosting:** fully separated. Production = `tradeoslive.web.app` (Hosting site `tradeoslive`, target `app`, in project `tradeos-91a58`). The default site `tradeos-91a58` is not a deploy target. It cannot be deleted; the owner disables it with `firebase hosting:disable --project tradeos-91a58 --site tradeos-91a58`. Each branch/PR gets its own preview URL on the `tradeoslive` site (`https://tradeoslive--CHANNEL-HASH.web.app`). `tradeos`, `tradeosapp`, and `tradeos-app` are reserved by other Firebase projects. Firebase `authDomain` is `tradeoslive.web.app`. Leave `tradeos-91a58.firebaseapp.com` in Auth authorized domains: it is the project's default Auth domain, not the Hosting site. Hosting serves `/__/auth/*` as a reserved path; the app rewrite excludes `!/__/auth{,/**}` so the SPA does not swallow it.
- **Worker:** `worker/index.js` is deployed as separate scripts:
  - `trade-os` — production HTTP (root `wrangler.jsonc`, no env). Has NO cron
    trigger. A bare `wrangler deploy` follows `.wrangler/deploy/config.json`
    from the Vite plugin and uploads this script. Only a push to `main` does that.
  - `trade-os-staging` — staging HTTP (`wrangler.jsonc` `env.staging`). A push
    to `dev` deploys it with `wrangler deploy --config wrangler.jsonc --env staging`
    after `scripts/staging-worker-target.mjs` checks the name. The dev Hosting
    channel is built with `VITE_WORKER_URL=https://trade-os-staging.tradeos.workers.dev`.
    Its KV binding is the staging namespace `ac57c9487d5044eda008e06100a05758`
    (not the production id). `CREDS_ENCRYPTION_KEY` on this Worker is
    staging-only; reconnect exchanges on the dev channel.
  - `tradeos-alerts` — the CRON runner (`worker/wrangler.toml`, `*/10` cron,
    same ALERTS_KV). Deployed by the CI step "Deploy Worker (alerts cron)",
    which first removes `.wrangler/deploy/config.json` to escape the redirect.
    Cron-path changes are DEAD until this worker is deployed too.
  Only a push to `main` deploys `trade-os` and `tradeos-alerts`. A push to `dev`
  deploys `trade-os-staging` only.
  `worker/wrangler.toml` `[env.staging]` uses that same staging KV id and is
  not deployed. Do not deploy the alerts cron for staging until a staging
  cron is intentional. Feature and PR preview channels still call the
  production Worker URL. The fixed `dev` channel calls the staging Worker.
- **Firestore:** **shared between production and staging.** No separation yet.
  This is fine for solo dev / low data volume, but be aware: test writes from
  staging modify real production data. Don't run destructive bulk operations.
- **Cron triggers:** the alerts worker's `[env.staging]` has an empty cron
  list. That env is not deployed. Production cron is `*/10` on `tradeos-alerts`.

## Secrets

Worker secrets and CI secrets are not stored in this repo. Add them in the
Cloudflare dashboard for the account that owns the TradeOS Workers
(*Workers & Pages → trade-os → Settings → Variables and Secrets*) or via CI.
Do not run secret or deploy commands while the local Wrangler session is
logged into a different Cloudflare account. Exchange API keys are stored only
encrypted in KV (never Firestore). Secret names are listed under "Secrets"
in `README.md`.

## Admin panel

`/admin` (sidebar "ניהול") is gated on the Firestore profile field
`role: "admin"` and is read-only by default. First admin must be set manually
once in the Firestore console (`users/{uid}.role = "admin"`) — rules require
`role` to read other users, so it's a chicken-and-egg bootstrap.

## Rollback

Bad deploy → Firebase Hosting → Release history → Rollback (seconds, no
redeploy). End users cannot downgrade themselves.

For the Worker: `wrangler rollback` from the `worker/` directory, or use the
Cloudflare dashboard's Deployments tab.
