# GitHub release checklist

Use this before making the repository public or tagging a release.

## Secrets and credentials

- [ ] No real `.env`, `.env.local`, or `*.secrets.env` files are committed (only `.env.example`).
- [ ] No API keys, tokens, or passwords appear in source, docs, or screenshots.
- [ ] `BACKEND_API_KEY` / gateway tokens are documented as **server-side only**; never bake them into the browser build.

## Optional subsystems

- [ ] `star-office-ui/` is either gitignored, in a submodule, or documented as a separate checkout; clones without it still build and run.
- [ ] Production uses `STAR_OFFICE_MODULE_ENABLED=0` and `STAR_OFFICE_SYNC_ENABLED=0` unless Star Office is deployed.
- [ ] Production frontend build does **not** set `VITE_ENABLE_STAR_OFFICE_UI=1` unless you intend to ship the office shell.

## Local / contributor ergonomics

- [ ] `scripts/dev-start.bat` (if used): `WSL_PROJECT_DIR` / `WSL_USER` match the machine or are documented; script skips missing optional directories.
- [ ] `README.md`, `docs/ENVIRONMENT_SETUP.md`, and `NODE_AND_LOCALHOST.md` cover how to run backend + frontend and fix common localhost issues.

## Legal and metadata

- [ ] `LICENSE` matches your intent (default in repo: MIT).
- [ ] `package.json` names and repository URLs are updated when you publish.
- [ ] Third-party logos or non-redistributable assets are not included without permission.

## CI (if added later)

- [ ] CI runs `npm run build` in `backend/` and `frontend/` without optional submodules.
- [ ] No job assumes `star-office-ui` is present unless explicitly gated.

## Documentation language

- [ ] Developer-facing docs under `docs/` and root `README.md` are in English (see also `OPTIONAL_SUBMODULES.md`).
- [ ] Runtime copy for end users (e.g. Chinese UI strings, LLM prompts) may stay non-English by product choice; that is separate from developer docs.
