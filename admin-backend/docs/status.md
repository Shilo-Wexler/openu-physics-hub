# Admin side: status

Updated 2026-11-03.

## Who owns what

- Public side: `public-frontend`, `chat-backend`.
- Admin side: `admin-backend`, `admin-frontend`.
- No service touches another service's DB. They talk only through:
  - `POST /api/inquiries` and `GET /api/announcements` (admin-backend, public);
  - the chat's `/internal` routes (never public).

## What exists

**admin-backend** (Python, FastAPI, psycopg 3, Postgres):
- Inquiries: the public form (anonymous, or with a phone or email the sender chose to leave), and console routes to list, filter and handle them. See `docs/contract.md`.
- Announcements: public read, console create, edit, publish and pin.
- Chat moderation: `/api/admin/chat/...` forwards to the chat's `/internal` with `MOD_API_TOKEN`, and logs each action.
- Stats: `GET /api/admin/stats?period=7|30|all` returns the whole stats screen at once: inquiries received in the
  period vs the period before (`null` for `all`), by type, top 5 courses; and the 5 most active chat courses from
  the chat's `/internal/stats/courses` (`null` when the chat backend fails, the rest still answers).
- Admins, names and levels: `admins` table, `GET /api/admin/me`, add, rename, change level and remove from the console. Three levels, see `docs/contract.md`.
- Meeting summaries: console create, edit and delete, with attached files.
- Sign-in: Cloudflare Access. The server checks the `Cf-Access-Jwt-Assertion` header.
- Console staff sync (`app/services/access_sync.py`): after adding or removing an admin, the console's
  Cloudflare Access rule group is set to the emails of the `admins` table, in the background (the change
  itself never waits for Cloudflare or fails because of it). The table is the source of truth: each sync
  writes the whole list, and a Postgres advisory lock keeps two syncs from crossing. The CronJob
  `python -m app.jobs.sync_access` fixes the group every 15 minutes if a sync failed. Off when the
  `CF_*` settings below are not set (local dev). Setup in `deploy/README.md`.
- Errors are always `{"detail": "..."}`.
- `/docs`, `/redoc` and `/openapi.json` only when `ENV=dev`.
- Health: `/health/live` (the process answers) and `/health/ready` (the DB answers), for the Kubernetes probes.
  Not exposed through the Ingress.

**admin-frontend** (React, TypeScript, Vite):
- Tabs: inquiries, chat moderation, announcements, stats, more (staff, meeting summaries).
- Every level sees every screen; only the actions a level may not do are missing.

## Settings

| Name | Notes |
|---|---|
| `ENV` | `dev` or `prod` (default `prod`) |
| `DEV_AUTH_EMAIL` | Dev sign-in bypass. Refused unless `ENV=dev` |
| `CHAT_API_URL`, `MOD_API_TOKEN` | Chat moderation and chat stats |
| `TURNSTILE_SECRET` | Required in prod |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Required in prod |
| `CF_API_TOKEN` | Console staff sync: Cloudflare API token (Access groups, edit). Secret |
| `CF_ACCOUNT_ID`, `CF_ACCESS_GROUP_ID` | Console staff sync: the account and the rule group. Set all three `CF_*` or none |

Secrets can also come from a `<NAME>_FILE`.

## Checks

No automated tests: changes are checked by hand in the console and the site.

## Local ports

| Port | Service |
|---|---|
| 5173 | public-frontend |
| 5174 | admin-frontend |
| 8000 | chat-backend |
| 8001 | admin-backend |

## Next

- Prod: Cloudflare Access app `admin` for `admin.openuvoice.com`, rule group `prod-console-staff`,
  and its own API token (see `deploy/README.md`).
  