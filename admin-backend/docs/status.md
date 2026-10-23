# Admin side: status

Updated 2026-10-23.

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
- Admins and roles: `admins` table, `GET /api/admin/me`, add/change/remove from the console.
- Sign-in: Cloudflare Access. The server checks the `Cf-Access-Jwt-Assertion` header.
- Errors are always `{"detail": "..."}`.
- `/docs`, `/redoc` and `/openapi.json` only when `ENV=dev`.
- One health route: `/health`.

**admin-frontend** (React, TypeScript, Vite):
- Tabs: inquiries, chat moderation, announcements, admins.
- Two levels: full admin (`admin`) and admin (everything except managing admins).

## Settings

| Name | Notes |
|---|---|
| `ENV` | `dev` or `prod` (default `prod`) |
| `DEV_AUTH_EMAIL` | Dev sign-in bypass. Refused unless `ENV=dev` |
| `CHAT_API_URL`, `MOD_API_TOKEN` | Chat moderation |
| `TURNSTILE_SECRET` | Required in prod |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Required in prod |

Secrets can also come from a `<NAME>_FILE`.

## Tests

- pytest: 220, on a temporary DB whose name must end in `_test`.
- Playwright (console): 81, against a fake API.

## Local ports

| Port | Service |
|---|---|
| 5173 | public-frontend |
| 5174 | admin-frontend |
| 8000 | chat-backend |
| 8001 | admin-backend |

## Next

- Console redesign.
- Cloudflare Access app for `admin.openuvoice.com`.
- Deploy: Docker, Helm, migrations as a Job, security headers in nginx.
- Align the Python version (Dockerfile 3.12, local 3.14).