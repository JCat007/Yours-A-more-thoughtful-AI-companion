# Optional submodules (conventions)

Use this pattern for extensions that are **separate processes**, **shipped later**, or **not required** for Bella to run. Example: `star-office-ui`. The main repo must run without the submodule tree present.

## 1. Three-level switches (copy semantics for new modules)

| Layer | Purpose | Star Office variables |
|--------|---------|------------------------|
| **A. Backend integration API** | If off, do not `app.use('/api/...')` for that module | `STAR_OFFICE_MODULE_ENABLED` |
| **B. Backend → submodule HTTP** | If off, do not call the child service base URL | `STAR_OFFICE_SYNC_ENABLED` |
| **C. Frontend entry** | If off, users do not see routes that depend on the child UI | `VITE_ENABLE_STAR_OFFICE_UI` |

New modules should follow `*_MODULE_ENABLED`, optional `*_SYNC_ENABLED`, and optional `VITE_ENABLE_*`, with safe defaults (`0` / empty) in `.env.example`.

## 2. Where code lives

- **Env parsing:** reuse `envLooksEnabled(name, defaultWhenUnset)` in `backend/src/lib/envBool.ts`.
- **Routes:** `backend/src/modules/<name>/routes.ts`, mounted from `index.ts` with `if (isXxxModuleEnabled()) { app.use(...); }`.
- **Side calls:** small helper (e.g. `starOfficeSync.ts`) — check sync flag before HTTP; failures must not break the main path.
- **Frontend:** `frontend/src/modules/<name>/`, wired from `App.tsx` or a central route table plus Vite flags.

## 3. Repo layout and scripts

- Child directory may be gitignored, or added later via **git submodule** / second clone at a documented path.
- One-click scripts (e.g. `scripts/dev-start.bat`) should **install/start only if the directory exists** so a plain clone does not fail.

## 4. Pre-flight checklist for a new optional module

- [ ] Default env: main repo `npm run build` and backend start succeed.  
- [ ] With no `*_MODULE_ENABLED`, there is no noisy traffic to the child port.  
- [ ] Docs list the three switches and a minimal `.env` set for local integration.  

More detail for Star Office: `docs/STAR_OFFICE_DEPLOY_AND_INTEGRATION.md`.
