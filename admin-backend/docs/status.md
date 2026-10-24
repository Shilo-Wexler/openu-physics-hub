# Admin side: status

Updated 2026-10-24.

## Who owns what

- Public side: `public-frontend`, `chat-backend`.
- Admin side: `admin-backend`, `admin-frontend`.
- No service touches another service's DB. They talk only through:
  - `POST /api/inquiries` and `GET /api/announcements` (admin-backend, public);
  - the chat's `/internal` routes (never public).

## What exists

**admin-backend** (Python, FastAPI, psycopg 3, Postgres):
- Inquiries: the anonymous public form, and console routes to list, filter and handle them. See `db/CONTRACT.md`.
- Announcements: public read, console create, edit, publish and pin.
- Chat moderation: `/api/admin/chat/...` forwards to the chat's `/internal` with `MOD_API_TOKEN`, and logs each action.
- Stats: `GET /api/admin/stats?period=7|30|all` returns the whole stats screen at once: inquiries received in the
  period vs the period before (`null` for `all`), by type, top 5 courses; and the 5 most active chat courses from
  the chat's `/internal/stats/courses` (`null` when the chat backend fails, the rest still answers).
- Admins, names and levels: `admins` table, `GET /api/admin/me`, add, rename, change level and remove from the console. Three levels, see `db/CONTRACT.md`.
- Sign-in: Cloudflare Access. The server checks the `Cf-Access-Jwt-Assertion` header.
- Errors are always `{"detail": "..."}`.
- `/docs`, `/redoc` and `/openapi.json` only when `ENV=dev`.
- One health route: `/health`.

**admin-frontend** (React, TypeScript, Vite):
- Tabs: inquiries, chat moderation, announcements, stats, more (admins).
- Every level sees every screen; only the actions a level may not do are missing.

## Settings

| Name | Notes |
|---|---|
| `ENV` | `dev` or `prod` (default `prod`) |
| `DEV_AUTH_EMAIL` | Dev sign-in bypass. Refused unless `ENV=dev` |
| `CHAT_API_URL`, `MOD_API_TOKEN` | Chat moderation and chat stats |
| `TURNSTILE_SECRET` | Required in prod |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Required in prod |

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

- Cloudflare Access app for `admin.openuvoice.com`.
- Deploy: Docker, Helm, migrations as a Job, security headers in nginx.
- Align the Python version (Dockerfile 3.12, local 3.14).