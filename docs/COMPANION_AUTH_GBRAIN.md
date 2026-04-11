# Bella authentication, companion memory, and gbrain (self-hosting)

The backend uses **PostgreSQL** (`DATABASE_URL`) for **Bella users, sessions, and settings**. **gbrain** can use the **same** database (`gbrain init --url` creates its own tables alongside `bella_*`; names do not collide).

---

## Quick start (minimal: only `POSTGRES_PASSWORD`)

Hand-hold checklist (copy-paste commands): **`docs/LOCAL_SETUP.md`**.

1. `cp backend/.env.example backend/.env` → set **`POSTGRES_PASSWORD`** → leave **`DATABASE_URL`** unset (auto-built).
2. Repo root: **`npm run docker:db`** (starts Postgres + pgvector; reads `backend/.env`).
3. `cd backend && npm install && npm run prisma:deploy && npx prisma generate`.
4. Run **`npm run dev`** in `backend/` and **`npm run dev`** in `frontend/` → open **http://localhost:5173**.
5. Optional: **gbrain** / **OpenClaw** / **`BELLA_ALLOW_REGISTER`** — see §1.2–§1.4 and §5 below.

---

## 1. One-time setup

### 1.0 Local Postgres via Docker Compose (recommended)

Use **one file** — `backend/.env` — for both the Node server and Compose (no duplicate password in a URL string).

1. Copy `backend/.env.example` → `backend/.env`.
2. Set **`POSTGRES_PASSWORD`** to a long random value (leave **`DATABASE_URL`** empty unless you use a hosted DB).  
   Optional: `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_HOST`, **`BELLA_PG_HOST_PORT`** (default `55432`, host-only bind in Compose).

The backend **auto-builds** `DATABASE_URL` at startup from those fields. Prisma CLI uses the same logic via:

```bash
cd backend
npm run prisma:deploy    # migrate deploy, with auto-built DATABASE_URL
# or: npm run prisma:migrate   # migrate dev
```

3. From the **repository root**, start Postgres:

```bash
npm run docker:db
# same as: docker compose --env-file backend/.env up -d
```

Defaults:

- **Host bind:** `127.0.0.1:${BELLA_PG_HOST_PORT:-55432}` → container `5432` (not LAN-exposed).
- **Roles:** `POSTGRES_USER` / `POSTGRES_DB` default to `bella` if unset.
- **pgvector:** `scripts/docker-init-pgvector.sql` runs on **first** data volume init only. To re-init the extension from scratch, remove the volume (`npm run docker:db:down` then `docker volume rm …` or `docker compose ... down -v`) and recreate (**data loss**).

Stop without removing the volume:

```bash
docker compose --env-file backend/.env stop
```

Then continue with **§1.3** (Prisma) and **§1.4** (gbrain init). For `gbrain init --url`, use the same connection string the app uses (copy from `backend/.env` after first successful server start, or set `DATABASE_URL` explicitly once).

### 1.1 PostgreSQL (pgvector required for gbrain)

The stock **`postgres:16` image does not ship pgvector**. `CREATE EXTENSION vector` fails with `vector.control: No such file or directory`. Use an image that bundles pgvector, for example:

```bash
docker run -d --name bella-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=yours \
  pgvector/pgvector:pg16
```

After the database exists, create the extension once:

```bash
docker exec -it bella-pg psql -U postgres -d yours -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If you **previously** used a plain `postgres:16` container with the same name: `docker stop` / `docker rm` the old container (data in that container is lost), recreate with `pgvector/pgvector:pg16` as above, then from `backend/` run `npm run prisma:deploy` again, then `gbrain init`.

### 1.2 Environment variables (`backend/.env`)

Set these in **`backend/.env`** (or in the process environment). See also `backend/.env.example`.

- **`DATABASE_URL`** — optional if **`POSTGRES_PASSWORD`** (+ optional `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_HOST`, **`BELLA_PG_HOST_PORT`**) are set; the server and `npm run prisma:*` scripts build it automatically. Otherwise set the full URL for Prisma and gbrain.
- **`GBRAIN_ENABLED`** — set to `1` or `true` to enable companion memory retrieval and async writes.
- **`GBRAIN_BIN`** (optional) — path to the `gbrain` executable; defaults to `gbrain` on `PATH`.
- **`GBRAIN_TIMEOUT_MS`** (optional) — subprocess timeout in milliseconds.
- **`GBRAIN_PUT_TIMEOUT_MS`** (optional) — timeout for `gbrain put` only (default `120000`). Increase only if you intentionally enable slow embedding (see next bullet).
- **`GBRAIN_PUT_WITH_EMBED`** (optional) — controls **only** the `gbrain put` subprocess used for **companion preference writes**; see **§1.2.2 (English)** so it is not confused with Bella **world mode** or chat providers.
- **`GBRAIN_USE_QUERY_WORLD`** (optional) — **`china` mode always uses `gbrain search` only** (keyword / tsvector, no `gbrain query`). In **`world` mode**, when unset or `1`, Bella tries **`gbrain query`** (hybrid retrieval, may use OpenAI for expansion) and **falls back to `gbrain search`** if the query output is empty, “no results”, or contains no lines under `companion/<your-user-id>/`. Set to `0` to force keyword-only in world as well.

### 1.2.1 Recommended: how you run the backend (pick one)

**Use this unless you already know you run production differently.**

| You are… | Use | Commands (WSL, from repo) |
|----------|-----|-----------------------------|
| **Developing Bella** (editing `backend/src`, testing in browser) | **Case A — `npm run dev`** | `cd ~/projects/yours/backend` then `npm run dev`. Uses `tsx watch`; after you pull or edit code, save files or restart that terminal (`Ctrl+C`, then `npm run dev` again) if something looks stale. **You do not need `npm run build` for this path.** |
| **Running compiled JS** (`npm start`, `node dist/index.js`, or a VPS script that starts `dist`) | **Case B** | `cd ~/projects/yours/backend` → `npm run build` → `npm start` (or `node dist/index.js`). After **every** change under `src/`, run `npm run build` again before restart. |
| **pm2 / systemd / Docker** manages the process | **Case C** | Same as Case B: build in `backend/` (`npm run build`), then restart **your** service (`pm2 restart …`, `systemctl restart …`, or recreate the container image if the image bakes `dist/`). |

**Recommendation:** On your machine, stay on **Case A** for daily work. Switch to **Case B** (or C) only when you intentionally run the compiled `dist/` stack.

### 1.2.2 `GBRAIN_PUT_WITH_EMBED` vs World mode and chat OpenAI (English)

**Scope.** `GBRAIN_PUT_WITH_EMBED` affects **only** Bella’s invocation of the **`gbrain put`** CLI when it writes the signed-in user’s **companion preferences page** (`companion/<userId>/preferences`). It does **not** control:

- Bella **China vs World** UI / persona mode.
- The **main chat** stack (`ASSISTANT_CHAT_PROVIDER`, OpenClaw gateway, OpenAI / Doubao / Kimi, etc.).
- **`gbrain query` / `gbrain search`** used for **companion memory retrieval** (that path is governed by China/World retrieval rules and `GBRAIN_USE_QUERY_WORLD`, not by `GBRAIN_PUT_WITH_EMBED`).

**Default (variable unset or not `1`).** Bella runs `gbrain put` in a **fast, embedding-safe** configuration: ephemeral `HOME` so `~/.gbrain/config.json` is not read (otherwise a file-stored `openai_api_key` could still trigger long OpenAI embedding calls), cloud credentials are stripped from the child env, and a dummy `OPENAI_BASE_URL` is set so any embedding attempt fails quickly. The page body is still written; chunk vectors may be `NULL` until you run **`gbrain embed`** on the host if you care about vector search for that page.

**When set to `1` / `true` / `yes`.** Bella passes through a normal environment and real `HOME` for **`gbrain put`** so **full embedding** runs on every save. That can be **slow** or **hang** if the OpenAI (or proxy) endpoint is unreachable—only enable this if you explicitly want immediate embeddings and accept that cost.

**Takeaway.** Omitting `GBRAIN_PUT_WITH_EMBED=1` does **not** mean “World mode cannot use OpenAI.” It means “companion **writes** to gbrain via `put` do not force a full OpenAI embedding round-trip by default.” Chat and other features keep using whatever you configure elsewhere in `.env`.
- **`BELLA_SESSION_DAYS`** (optional) — session cookie lifetime in days (default `30`).
- **`BELLA_ALLOW_REGISTER`** — set to `1` to allow new sign-ups when the user table is already non-empty.
- **`BELLA_PASSWORD_RESET_TOKEN`** — ops-only password reset; see §3.
- **`BELLA_SESSION_SECURE`** — set to `1` in production behind HTTPS so cookies are `Secure`.

### 1.3 Prisma migrations

```bash
cd backend
npm install
npm run prisma:deploy
npx prisma generate
npm run build
```

(`prisma:deploy` loads `backend/.env` and applies the same `DATABASE_URL` auto-build as the server. You can still `export DATABASE_URL=...` if you prefer.)

#### If you see `P3015` / `Could not find the migration file .../20260210040508_init/migration.sql`

Stale **SQLite-era migration directories** may still exist on disk without `migration.sql`. Prisma still scans them.

From the **repository root** `yours/` (not `backend/`):

```bash
cd ~/projects/yours   # adjust to your clone path
chmod +x scripts/fix-prisma-legacy-migrations.sh
./scripts/fix-prisma-legacy-migrations.sh
```

Then:

```bash
cd backend && npx prisma migrate deploy
```

If `_prisma_migrations` in the database is out of sync with this repo, the simplest fix is a **new database name** in a fresh container, or manual cleanup of `_prisma_migrations` only when you accept data loss.

### 1.4 Install and initialize gbrain

Upstream: <https://github.com/garrytan/gbrain>

**Install Bun** (official installer; open a **new shell** afterward, or `source ~/.bashrc` / `source ~/.zshrc`).

On Debian/Ubuntu/WSL, if you see `unzip is required to install bun`:

```bash
sudo apt-get update
sudo apt-get install -y unzip curl
```

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

**Install the gbrain CLI** (global command is usually `gbrain`):

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun add -g github:garrytan/gbrain
which gbrain
gbrain --help
```

`which gbrain` should resolve under `~/.bun/bin/`; `gbrain --help` should list subcommands.

**Initialize gbrain** (same `DATABASE_URL` as Bella):

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/yours
gbrain init --url "$DATABASE_URL"
# follow the interactive wizard; optionally: gbrain import <path-to-markdown-brain>
```

For `npm run start` / `npm run dev`, put the same `DATABASE_URL` in **`backend/.env`**, and ensure the backend process can find `gbrain`:

- Prefer `export PATH="$HOME/.bun/bin:$PATH"` in the shell or service unit (**required** for systemd/pm2 if login PATH is not loaded), **or**
- Set **`GBRAIN_BIN`** to the absolute path of the CLI.

The Bella backend also **prepends** `$HOME/.bun/bin` to the subprocess `PATH` when spawning gbrain (helps when the Node parent was started without a login shell). You should still verify with `which gbrain` in the same environment you use to run the server.

```bash
export PATH="$HOME/.bun/bin:$PATH"
export GBRAIN_ENABLED=1
```

If gbrain is not installed, the API can still start; leave `GBRAIN_ENABLED` unset or `0` to disable companion memory I/O.

The Node process must be able to spawn `gbrain`. gbrain reads **`~/.gbrain/config.json`** (from `gbrain init`) for the database connection; keep that aligned with the same Postgres instance as `DATABASE_URL`.

---

## 2. Behaviour summary

- **Not signed in** — chat works; gbrain companion pages are **not** read or written.
- **Signed in** — enable **cross-session retrieval** in “Memory settings” to inject gbrain snippets into the persona layer (including the OpenClaw executor path). Enable **auto-learn** to allow heuristic background `timeline-add` writes; they run **asynchronously** and do not block HTTP responses or OpenClaw jobs.
- **Explicit “remember …”** — when companion memory is enabled, matching user text is also appended to the `companion/<userId>/preferences` timeline in the background.

Slug prefix (keep consistent if you use OpenClaw or edit pages by hand):

```text
companion/<user UUID>/preferences
```

Additional template pages can be added later; the current integration focuses on `preferences`.

---

## 3. Password reset (ops only, no email)

Pick one:

1. **SQL** — delete the row in `bella_users`, or delete rows in `bella_sessions` to revoke sessions only.  
2. **One-shot HTTP reset** — set `BELLA_PASSWORD_RESET_TOKEN` to a long random secret, then:

```bash
curl -X POST http://localhost:3001/api/auth/ops/reset-password \
  -H "Content-Type: application/json" \
  -H "X-Bella-Password-Reset: <same value as env>" \
  -d '{"username":"alice","newPassword":"new-secret"}'
```

If `BACKEND_API_KEY` is set, send the same `x-api-key` header as for other protected routes.

---

## 4. Frontend

- Axios uses `withCredentials: true`. After login, an **HttpOnly** cookie holds the session (about `BELLA_SESSION_DAYS` days, server-side).  
- Clearing site cookies requires signing in again; the **user UUID in Postgres does not change** unless you delete the user.

---

## 5. OpenClaw and gbrain skills (alignment with Bella)

### 5.1 What Bella does automatically

When `ASSISTANT_CHAT_PROVIDER=openclaw`, every OpenClaw-bound turn includes:

1. A **system** message that states the gbrain write scope:
   - **Signed in:** only slugs under `companion/<bella_users.id>/` (e.g. `companion/<id>/preferences`).
   - **Anonymous:** do not write any `companion/<uuid>/` pages.
2. An HTTP header on gateway requests (when signed in): **`x-bella-user-id: <uuid>`**  
   Upstream OpenClaw builds can read this for logging, metrics, or custom gateway middleware (Bella does not ship gateway code).

This matches the Bella backend’s own gbrain integration (`companion/<userId>/…`).

### 5.2 What you still configure in OpenClaw

After installing the gbrain skill, keep skill / AGENTS text consistent with the prefix above. For manual CLI edits, use the same UUID as in `bella_users.id`. The Bella UI now includes **Copy user UUID** (chat header and memory settings) so operators do not need SQL for routine setup.

---

## 6. `bellaState` vs gbrain

- **`bellaState`** — short sliding window of recent turns for continuity and routing.  
- **gbrain companion pages** — longer-horizon preferences and timeline, searchable and attributable; requires login + opt-in + `GBRAIN_ENABLED`.
