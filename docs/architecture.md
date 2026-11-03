# Architecture

OpenUVoice has four parts, two databases and one public domain. Each backend owns its database;
no part reads another part's database.

## The parts

| Part | What it is | Built with | Local port |
|---|---|---|---|
| `public-frontend` | The student site: home, course chats, announcements, inquiry form, profile | React, TypeScript, Vite | 5173 |
| `chat-backend` | Course chats, sign-in for students, ratings, likes, reports | Python, FastAPI, asyncpg | 8000 |
| `admin-frontend` | The committee console | React, TypeScript, Vite | 5174 |
| `admin-backend` | Inquiries, announcements, meeting summaries, staff, chat moderation, stats | Python, FastAPI, psycopg 3 | 8001 |

In the cluster each frontend is a static nginx image and each backend a Python image. Both databases are Postgres.

## Who answers which address

Public host (`openuvoice.com`, staging: `staging.openuvoice.com`):

| Path | Goes to |
|---|---|
| `/api/chat/...` | `chat-backend` |
| `POST /api/inquiries` (this exact path and method) | `admin-backend` |
| `/api/announcements/...` | `admin-backend` |
| everything else | `public-frontend` |

Console host (`admin.openuvoice.com`, staging: `admin-staging.openuvoice.com`), behind Cloudflare Access:

| Path | Goes to |
|---|---|
| `/api/admin/...` | `admin-backend` |
| everything else | `admin-frontend` |

Never reachable from outside: the chat's `/internal/...` routes and every `/health/...` route.
Locally, each Vite dev server forwards the same paths to the backends, so the browser sees one origin as in production.

## Where the data lives

**Chat DB** (`chat-backend`): users (nickname, avatar, the Google account id only), sessions, messages,
likes, ratings, reports, and the hashes of blocked identities.

**Admin DB** (`admin-backend`): staff (`admins`) and their levels, inquiries, announcements (images stored
as WebP in the DB), meeting summaries and their files, and the log of moderation actions.

**Courses** come from `shared/courses.csv`, the single source. Each database keeps its own copy, loaded on
every deploy (an upsert), so adding a course is an edit to that file.

## How the parts talk

- The site calls `chat-backend` and the two public `admin-backend` routes. Nothing else.
- `admin-backend` moderates the chat and reads chat stats through the chat's `/internal` routes, with
  `Authorization: Bearer <MOD_API_TOKEN>`. Contract: `chat-backend/docs/internal-api.md`.
- Nothing calls `admin-backend` from `chat-backend`.

## Sign-in

- **Students:** Google sign-in (redirect mode). `chat-backend` checks the Google token, finds or creates
  the user, and sets a session cookie for `/api/chat` only. Sessions live in the DB (stored hashed), so
  signing out or blocking takes effect at once.
- **Staff:** Cloudflare Access (Google) in front of the console. `admin-backend` checks the
  `Cf-Access-Jwt-Assertion` header and looks the email up in `admins` for the level. Who may pass Access
  is kept equal to `admins` by the console staff sync (`admin-backend/docs/status.md`).

## Scheduled jobs

| Job | When | What |
|---|---|---|
| `chat-purge` | Daily | Deletes chat accounts a week after the user asked to delete them |
| `access-sync` | Every 15 minutes | Fixes the Cloudflare Access group if a sync after a staff change failed |

## Deploying

A merge to `main` builds the images in CI and pushes them to GHCR; a bot commit then points staging at
them, and Argo CD applies it. Database migrations run as a Job before each release. Details: `deploy/README.md`.

## More

- Run everything locally: `docs/local-setup.md`
- Every setting of every part: `docs/configuration.md`
- Staff levels and inquiry rules: `admin-backend/docs/contract.md`