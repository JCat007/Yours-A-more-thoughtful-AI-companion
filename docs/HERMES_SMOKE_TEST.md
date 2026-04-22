# Hermes Smoke Test

This project now includes a lightweight Hermes runtime smoke test script:

- script: `backend/src/scripts/hermesSmoke.ts`
- npm command: `npm run test:hermes-smoke` (inside `backend`)

## What It Validates

The smoke test runs three checks:

1. `health-short`: Hermes returns a short health-style response.
2. `structured-long`: Hermes can return a longer, structured response.
3. `nonempty-on-odd-input`: Hermes handles noisy input and still returns non-empty output.

If any case fails, the script exits with code `1`.

## Required Environment

Use `backend/.env` as the single configuration file.

- `HERMES_ROOT` (optional but recommended): path to Hermes repo checkout.
- `HERMES_CMD` (optional): explicit Hermes executable command prefix.
- `HERMES_VENV` (optional, recommended): WSL venv root, e.g. `$HOME/.venvs/hermes`.
- `HERMES_PYTHON_BIN` (optional): absolute Python interpreter path; higher priority than `HERMES_VENV`.
- `HERMES_PROVIDER` (optional): force provider (e.g. `openrouter`, `anthropic`, `gemini`, `kimi-coding`, `alibaba`).
- `HERMES_MODEL` (optional): force model ID for CLI calls.
- `HERMES_TIMEOUT_MS` (optional): command timeout in milliseconds.
- `BELLA_HERMES_MIGRATE_CMD` (optional, recommended for framework `full_migrate`): explicit Hermes binary for `hermes claw migrate`, e.g. `$HOME/.venvs/hermes/bin/hermes`.
- At least one Hermes provider credential (for example `OPENAI_API_KEY`).

If `HERMES_ROOT` is not set, the script defaults to `${HOME}/projects/hermes`.

Runtime resolution order:

1. `HERMES_CMD`
2. `HERMES_PYTHON_BIN`
3. `HERMES_VENV/bin/python`
4. `hermes` in PATH
5. active `VIRTUAL_ENV/bin/python`
6. `python3` then `python`

## Troubleshooting `spawn hermes ENOENT`

If framework switch fails with:

- `Failed to start hermes migrate: spawn hermes ENOENT`

it means the backend process cannot find a runnable Hermes binary in its environment.

Use this fix:

```bash
# run inside WSL
which hermes
# if empty, but you know the binary path exists, set backend/.env:
# BELLA_HERMES_MIGRATE_CMD=$HOME/.venvs/hermes/bin/hermes
```

Important: if you are already in WSL shell, do **not** run `wsl ...` again.

## Run Example (WSL)

```bash
cd /home/<user>/projects/yours/backend
cp .env.example .env   # first time only
# edit backend/.env and set:
#   HERMES_ROOT=/home/<user>/projects/hermes
#   HERMES_VENV=$HOME/.venvs/hermes
#   OPENAI_API_KEY=<your_key>
npm run test:hermes-smoke
```

## Recommended WSL venv setup (avoid Windows Python)

```bash
cd /home/<user>/projects/hermes
python3 -m venv "$HOME/.venvs/hermes"
"$HOME/.venvs/hermes/bin/python" -m pip install -U pip setuptools wheel
"$HOME/.venvs/hermes/bin/python" -m pip install -e .

cd /home/<user>/projects/yours/backend
# ensure backend/.env contains HERMES_ROOT, HERMES_VENV, OPENAI_API_KEY
npm run test:hermes-smoke
```

## Expected Success Output

You should see:

- `✅ [health-short] pass`
- `✅ [structured-long] pass`
- `✅ [nonempty-on-odd-input] pass`
- `Result: 3/3 passed`
