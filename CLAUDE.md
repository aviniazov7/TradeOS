# Working on TradeOS

Operational rules for any AI agent (Claude) working in this repo, on any
machine. Full product/architecture details are in `README.md`.

## Release workflow — MANDATORY on every code change

The current version is the source of truth **in the code itself** — read it,
then increment. Bump BOTH of these together, in the same commit as the change:

| File | What to change |
|---|---|
| `src/utils/constants.js` | `APP_VERSION` — read current value, bump patch (e.g. `1.0.1` → `1.0.2`) |
| `public/sw.js` | `CACHE_NAME` — read current `tradeos-vN`, increment N (e.g. `tradeos-v13` → `tradeos-v14`) |

Why: `CACHE_NAME` forces the service worker to register a new version, which
triggers the in-app "new version available" prompt
(`src/components/shared/UpdatePrompt.jsx` + `src/services/swUpdate.js`). Users
are never force-reloaded — the SW intentionally does not `skipWaiting()` on
install.

Skip the version bump ONLY for docs-only changes (README/CLAUDE.md) that do
not ship to users.

## Git

- Work on `main` unless told otherwise.
- Commit + `git push origin main`.
- Author identity: `Avraham Niazov <aviniazov7@icloud.com>`. No third-party
  trailers/co-author lines in commit messages.

## Build & lint

- `npm run build` must pass.
- The repo has ~160 pre-existing lint errors (duplicate keys in coin lists,
  `worker/index.js`, and `motion`/JSX-uses-vars false positives). These are
  NOT deploy blockers. Just don't add NEW lint errors in files you change.
- Keep all Firebase SDK access inside `src/services/`. Hooks/components must
  use service functions, never import `firebase/*` directly.

## Deploying

The agent CANNOT deploy (no Firebase/Cloudflare credentials in sandboxes).
After pushing, tell the owner to run:

```bash
git pull origin main
npm run deploy
```

`npm run deploy` = build + `wrangler deploy` + `firebase deploy --only
hosting,firestore:rules`. Firestore rule changes ship automatically.

## Admin panel

`/admin` (sidebar "ניהול") is gated on the Firestore profile field
`role: "admin"` and is read-only. First admin must be set manually once in the
Firestore console (`users/{uid}.role = "admin"`) — rules require `role` to read
other users, so it's a chicken-and-egg bootstrap.

## Rollback

Bad deploy → Firebase Hosting → Release history → Rollback (seconds, no
redeploy). End users cannot downgrade themselves.
