# Configuration

Every setting of every part, in one place. All come from environment variables; nothing is hardcoded.

- **Locally:** from `.env` files (see `docs/local-setup.md`). Each part has a `.env.example` to copy.
- **In the cluster:** plain values from the Helm values (`deploy/helm/openuvoice/values-<env>.yaml`),
  secrets from a Kubernetes Secret per backend, mounted as files.
- **Secrets as files:** a backend reads a secret `NAME` from the file named in `NAME_FILE` when that is
  set, else from `NAME`. The cluster always uses the file.
- **`ENV`:** `dev` or `prod`, same meaning in both backends. Unset means `prod`, so a server that was
  never configured gets the safe behaviour. `dev` turns on `/docs` and the console's dev sign-in.

## chat-backend

| Name | Required | Secret | What |
|---|---|---|---|
| `ENV` | no (`prod`) | | `dev` or `prod` |
| `DATABASE_URL` | yes | yes | Postgres connection string of the chat DB |
| `GOOGLE_CLIENT_ID` | yes | | Google OAuth client id. Not secret: the browser uses it too |
| `MOD_API_TOKEN` | yes | yes | Shared with admin-backend for `/internal`. At least 32 characters |
| `DB_POOL_MAX` | no (`10`) | | Most open DB connections per process |
| `SESSION_DAYS` | no (`400`) | | A session ends after this many days without a visit |
| `READY_TIMEOUT` | no (`2`) | | Seconds `/health/ready` waits for the DB |

## admin-backend

| Name | Required | Secret | What |
|---|---|---|---|
| `ENV` | no (`prod`) | | `dev` or `prod` |
| `DATABASE_URL` | yes | yes | Postgres connection string of the admin DB |
| `ALLOWED_ORIGINS` | no | | Console origins for CORS, comma-separated. Only needed when the console is on another origin (local dev) |
| `CF_ACCESS_TEAM_DOMAIN` | in prod | | Cloudflare Access team domain, e.g. `openuvoice.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | in prod | | The console Access application's AUD tag |
| `DEV_AUTH_EMAIL` | no | | Dev sign-in as this email, without Cloudflare. Refused unless `ENV=dev` |
| `CHAT_API_URL` | no | | The chat backend's address, for moderation and chat stats. Without it `/api/admin/chat/*` answers 503 |
| `MOD_API_TOKEN` | no | yes | Same value as the chat backend's. At least 32 characters |
| `TURNSTILE_SECRET` | in prod | yes | Turnstile secret for the inquiry form. Without it (dev) `POST /api/inquiries` answers 503. Test secret that always passes: `1x0000000000000000000000000000000AA` |
| `CF_API_TOKEN` | no | yes | Console staff sync: API token with Access groups edit on one account |
| `CF_ACCOUNT_ID` | no | | Console staff sync: the Cloudflare account |
| `CF_ACCESS_GROUP_ID` | no | | Console staff sync: the rule group. Set all three `CF_*` or none; none turns the sync off |

## public-frontend

Read in the browser, so none of them is secret.

| Locally (`.env.local`) | In the cluster (container env) | What |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Same Google client as the chat backend |
| `VITE_TURNSTILE_SITE_KEY` | `TURNSTILE_SITE_KEY` | Turnstile site key. Test key that always passes: `1x00000000000000000000AA` |

In the cluster the container writes them into `/config.js` when it starts (`public-frontend/docker/config.sh`),
so the same image serves staging and production. It refuses to start without them.

## admin-frontend

| Name | Required | What |
|---|---|---|
| `ADMIN_API_URL` | no (`http://localhost:8001`) | Dev server only: where `/api/admin` is forwarded |

A production build reads nothing: it calls `/api/admin` on its own origin, behind Cloudflare Access.

## Cluster secrets

Created by hand once per environment (never in git); see `deploy/README.md` for the commands.

| Secret | Keys |
|---|---|
| `chat-backend` | `database-url`, `mod-api-token` |
| `admin-backend` | `database-url`, `mod-api-token`, `turnstile-secret`, `cf-api-token` |