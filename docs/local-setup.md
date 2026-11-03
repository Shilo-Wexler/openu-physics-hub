# Local setup

From a fresh clone to all four parts running on your machine. Commands run from the repo root.
For what each part is, see `docs/architecture.md`; for every setting, `docs/configuration.md`.

## 1. Tools

- Docker
- Python 3.14
- Node.js 22
- A Google OAuth client for local sign-in (Google Cloud Console, "Web application"):
  - Authorized JavaScript origin: `http://localhost:5173`
  - Authorized redirect URI: `http://localhost:5173/api/chat/auth/google/redirect`

## 2. Databases

One Postgres container holds both databases, each with its own user, as in the cluster.
`devpass` is a local-only password; use your own if you like, the same everywhere below.

    docker run -d --name openuvoice-db -e POSTGRES_PASSWORD=devpass -p 5432:5432 postgres:17-alpine

    docker exec -i openuvoice-db psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
    create role chat_app login password 'devpass';
    create database chat_db owner chat_app;
    create role admin_app login password 'devpass';
    create database admin_db owner admin_app;
    SQL

Later sessions only need `docker start openuvoice-db`.

## 3. Migrations and courses

The same migrate images the cluster runs (`deploy/migrate/`): they apply the migrations not applied yet,
then load the courses from `shared/courses.csv`. Run them again after pulling a new migration.

    docker build -t chat-migrate -f deploy/migrate/Dockerfile --build-arg SERVICE=chat-backend .
    docker build -t admin-migrate -f deploy/migrate/Dockerfile --build-arg SERVICE=admin-backend .

    docker run --rm -e PGHOST=host.docker.internal -e PGDATABASE=chat_db -e PGUSER=chat_app -e PGPASSWORD=devpass chat-migrate
    docker run --rm -e PGHOST=host.docker.internal -e PGDATABASE=admin_db -e PGUSER=admin_app -e PGPASSWORD=devpass admin-migrate

On Linux add `--add-host=host.docker.internal:host-gateway` to the two `docker run` commands.

Optional demo chat content (users, reviews, replies, likes):

    docker exec -i openuvoice-db psql -U chat_app -d chat_db -v ON_ERROR_STOP=1 < chat-backend/dev/seed_demo.sql

## 4. Backends

One virtual environment per backend:

    python3.14 -m venv chat-backend/.venv
    chat-backend/.venv/bin/pip install -r chat-backend/requirements.txt
    python3.14 -m venv admin-backend/.venv
    admin-backend/.venv/bin/pip install -r admin-backend/requirements.txt

Settings: copy `chat-backend/.env.example` and `admin-backend/.env.example` to `.env` next to them, then:

- `DATABASE_URL`: `postgresql://chat_app:devpass@localhost:5432/chat_db` and
  `postgresql://admin_app:devpass@localhost:5432/admin_db`.
- `MOD_API_TOKEN`: one value, the same in both files, from `openssl rand -hex 32`.
- `GOOGLE_CLIENT_ID` (chat): the client from step 1.
- `DEV_AUTH_EMAIL` (admin): your email, for the console's dev sign-in.

## 5. Frontends

    npm --prefix public-frontend ci
    npm --prefix admin-frontend ci

Copy `public-frontend/.env.example` to `public-frontend/.env.local` and set `VITE_GOOGLE_CLIENT_ID`
to the same client. The console needs no settings.

## 6. The first staff member

The console lets in only emails in the `admins` table, and the first one has nobody to add it:

    docker exec -i openuvoice-db psql -U admin_app -d admin_db -v ON_ERROR_STOP=1 \
      -c "insert into admins (email, name, role) values ('you@example.com', 'Your name', 'admin')"

Use the same email as `DEV_AUTH_EMAIL`.

## 7. Run

Each in its own terminal tab:

    chat-backend/.venv/bin/python -m uvicorn app.main:app --app-dir chat-backend --reload --env-file chat-backend/.env
    admin-backend/.venv/bin/python -m uvicorn app.main:app --app-dir admin-backend --port 8001 --reload
    npm --prefix public-frontend run dev
    npm --prefix admin-frontend run dev

Then open the site at http://localhost:5173 and the console at http://localhost:5174
(type your `DEV_AUTH_EMAIL` in the dev sign-in box).

## 8. Before a pull request

The same checks CI runs:

    npm --prefix public-frontend run build
    npm --prefix admin-frontend run build
    ruff check chat-backend admin-backend

There are no automated tests: check the change by hand in the site and the console.
To see the site as production serves it (one bundle, no dev server), build it and run
`npm --prefix public-frontend run preview -- --port 5173`.