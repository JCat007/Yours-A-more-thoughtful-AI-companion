# Environment setup

## Rules

- Never commit real secrets.
- Commit `.env.example` only (root and optional package-level examples).
- Keep variable names in `.env` and `.env.example` aligned.

## Local development

See also [`NODE_AND_LOCALHOST.md`](../NODE_AND_LOCALHOST.md) if the browser cannot reach `localhost` or dev ports.

1. Copy `.env.example` to `.env` at the repo root.
2. Fill real values in `.env`.
3. For the Vite frontend, copy the `VITE_*` lines into `frontend/.env` or `frontend/.env.local` as needed (Vite only exposes `VITE_` prefixed vars).
4. Run: `node scripts/check-env-example.mjs`

## Cloud deployment

- Configure variables in your platform's Secrets / Environment Variables panel.
- Do not upload `.env` to GitHub.
- Use the same keys as `.env.example`.

## CI recommendation

Run on pull requests:

- `node scripts/check-env-example.mjs`

If `.env` is not present in CI, the script exits successfully with a warning; add a CI-only `.env` (no secrets) when you want strict checks in automation.

## Why you might not see `.env.example` in the file tree

If you use both WSL (`/home/zhihao/...`) and a Windows copy (`C:\...`), they are different folders unless you use a single shared mount. Edit and commit from the same tree you opened in Cursor.
