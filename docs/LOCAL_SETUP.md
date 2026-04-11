# Local run: minimal setup (only `POSTGRES_PASSWORD`)

This guide assumes you already copied `backend/.env.example` → `backend/.env` and set **`POSTGRES_PASSWORD`**, and left **`DATABASE_URL`** empty so the app builds it automatically. For gbrain, OpenClaw, and ops details, see **[`COMPANION_AUTH_GBRAIN.md`](./COMPANION_AUTH_GBRAIN.md)**.

---

## 0. Prerequisites

- **Node.js** and **npm** installed.
- **Docker** installed and the daemon running (Docker Desktop on Windows, or `dockerd` on Linux).
- A terminal where you can `cd` into your clone of the `yours` repo.

If you have never installed JS dependencies in this clone:

```bash
cd /path/to/yours/backend
npm install
cd /path/to/yours/frontend
npm install
```

(Replace `/path/to/yours` with your real path, e.g. `~/projects/yours` on WSL.)

---

## 1. Confirm `backend/.env`

- File exists: **`backend/.env`**
- **`POSTGRES_PASSWORD`** is set to a long random secret.
- **`DATABASE_URL`** is **not** set (commented or absent) unless you use an external DB.

---

## 2. Start Postgres (repo root)

Open a terminal and go to the **repository root** — the folder that contains **`docker-compose.yml`** (and `package.json` with `docker:db`).

```bash
cd /path/to/yours
npm run docker:db
```

That runs: `docker compose --env-file backend/.env up -d`.

Check the service:

```bash
docker compose --env-file backend/.env ps
```

You should see the `postgres` container running. Postgres listens on **`127.0.0.1:55432`** by default (see `BELLA_PG_HOST_PORT` in `backend/.env`).

---

## 3. Prisma migrate and generate

### What this means (plain language)

- **Migrate (`prisma:deploy`)** — Bella stores users/sessions in PostgreSQL. The table layout is defined in `backend/prisma/migrations/`. **Migrate** creates or updates those tables in your Docker database so the app can run. You do this **once per machine** (or again after pulling new migrations from git).
- **Generate (`prisma generate`)** — Regenerates the **TypeScript client** that your backend imports (`@prisma/client`). Run it after migrate (or any time the Prisma schema changes).

`dev-start.bat` and `npm run dev` **do not** run migrations for you — run the commands in this section at least **once** before relying on login/DB features.

Open a **new** terminal (or the same one after step 2):

```bash
cd /path/to/yours/backend
npm install
npm run prisma:deploy
npx prisma generate
```

- **`npm run prisma:deploy`** applies migrations (`migrate deploy`) and loads `backend/.env` so `DATABASE_URL` is auto-built from `POSTGRES_*`.
- For interactive dev migrations, use **`npm run prisma:migrate`** instead of `prisma:deploy`.

---

## 4. Run backend and frontend

### Option A — Two terminals (any OS)

**Terminal A — backend**

```bash
cd /path/to/yours/backend
npm run dev
```

Wait until you see the server listening on port **3001**. Test:

- Open **http://localhost:3001/health** in a browser — you should get JSON with `"status":"ok"`.

**Terminal B — frontend**

```bash
cd /path/to/yours/frontend
npm run dev
```

Then open **http://localhost:5173** for the Bella UI.

### Option B — `scripts/dev-start.bat` (Windows → WSL)

Yes, you **can** use **`scripts/dev-start.bat`** instead of typing two `npm run dev` sessions yourself. It starts (when configured) the OpenClaw gateway, backend (`backend/run-dev.sh`), frontend, and optional Star Office — see the root **[`README.md`](../README.md)**.

**Still do section 3 first** (Prisma migrate + generate) at least once; the `.bat` file does not replace that step.

Requirements: **WSL** with Ubuntu (or adjust `scripts/dev-wsl.config.bat` from `dev-wsl.config.example.bat`), Docker for Postgres is separate — `dev-start.bat` does **not** run `npm run docker:db`; keep your Postgres container running (or start it before the `.bat`).

---

## 5. Optional next steps

- **Register / login:** First user can register when the DB is empty. If users already exist, set **`BELLA_ALLOW_REGISTER=1`** in `backend/.env` to allow more signups (see `COMPANION_AUTH_GBRAIN.md` §1.2).
- **OpenClaw / Doubao / Gemini:** Add the API keys and provider settings your stack needs in `backend/.env` (see `.env.example` and your existing keys).
- **gbrain:** Install the CLI, run **`gbrain init --url "$DATABASE_URL"`** with the same DB as Bella (after step 3 you can use  
  `postgresql://bella:<POSTGRES_PASSWORD>@127.0.0.1:55432/bella`  
  with your real password), set **`GBRAIN_ENABLED=1`**, restart the backend, then enable memory in the UI. Full steps: **`COMPANION_AUTH_GBRAIN.md`**.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| `npm run docker:db` fails | Run from **repo root**; `backend/.env` exists; **`POSTGRES_PASSWORD`** is non-empty. |
| Prisma cannot connect | Container is **healthy**; `POSTGRES_HOST` is `127.0.0.1`; port matches **`BELLA_PG_HOST_PORT`** (default `55432`). |
| Stop DB but keep data | `docker compose --env-file backend/.env stop`. From repo root: **`npm run docker:db:down`** stops the compose stack (add **`-v`** only if you intend to delete volumes / data). |
