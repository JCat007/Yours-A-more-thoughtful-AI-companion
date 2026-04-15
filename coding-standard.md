# Coding standard

Long-running engineering rules for frontend, backend, automation scripts, and AI-assisted development.

## 1) Skill-first (mandatory)

- If an installed skill can complete the task, **use that skill**—do not bypass it.
- Preferred order for file work:
  - PDF → `pdf`
  - Word → `docx`
  - PowerPoint → `pptx`
  - Excel → `xlsx`
  - Visual / UI design → `canvas-design` / `frontend-design`
- Fallbacks are allowed only when no skill exists, the skill is disabled, or configuration is missing—and the reason must be auditable (log / comment / ticket).
- Every fallback must record **why** (skill missing, disabled, misconfigured, etc.).

## 2) No `exec` for user file processing (mandatory)

- Do not use `exec` / arbitrary shell as the **primary** path for uploaded files.
- Do not spawn `python` / `node` / `bash` via `exec` to replace an existing file skill.
- If the runtime returns `exec denied`, `allowlist miss`, or `elevated not available`, **switch to the skill path** immediately—do not loop on `exec`.
- `exec` is reserved for vetted operational tasks, never silent production behavior, and requires:
  - explicit approval,
  - a bounded command list,
  - a rollback plan.

## 3) Path compatibility (mandatory)

- Any OpenClaw workspace read/write must support **multiple candidate roots**—never assume a single hard-coded path.
- At minimum, consider:
  - `OPENCLAW_WORKSPACE`
  - `~/.openclaw/workspace-<agentId>`
  - `~/.openclaw/workspace-main`
  - `~/.openclaw/workspace`
- Uploaded files must support mirrored writes with traceable mappings when multiple workspaces exist.
- Output scanning must check every relevant directory so agent/workspace variants cannot hide artifacts.

## 4) Observability

- Emit structured events for:
  - upload success/failure
  - skill invocation start/end
  - output detection hits/misses
  - download success/failure
- Provide exportable diagnostic JSON for postmortems.

## 5) Change management

- Adding or modifying a skill requires updating:
  - configuration knobs
  - preflight checks
  - debug events
- Before merging, run at least one end-to-end path: **upload → skill → downloadable output**.

## 6) Secrets (mandatory)

- Never commit real tokens, API keys, AES keys, private keys, or passwords in source or tracked config.
- Inject secrets via environment variables; real values live only in private `.env` (or equivalent).
- `.env` variants must stay in `.gitignore`.
- Example files (`*.example`) must contain placeholders only.
- If a secret leaks, rotate it immediately and document impact.

## 7) `.env` editing policy (mandatory)

- Automated agents must **not** create, delete, or edit `.env` / `.env.*` files.
- Humans perform all `.env` edits manually.
- Agents may propose keys and templates but must not write them to disk.
- If a user explicitly orders “edit `.env`”, refuse direct writes and supply step-by-step manual instructions instead.

## 8) Keep Cursor rules in sync (mandatory)

- `coding-standard.md` and `.cursor/rules/coding-standard.mdc` must match.
- Any change to `coding-standard.md` must update `.cursor/rules/coding-standard.mdc` in the same PR.
- Keep `alwaysApply: true` on the rule file.
- Resolve conflicts between the two before landing further work.

## 9) Documentation naming (mandatory)

- OpenClaw docs use the `OPENCLAW_*` prefix only—do not add new `CLAWRA_*` or `LOBSTERAI_*` setup docs.
- Structure: one entry (`OPENCLAW_SETUP.md`) + index (`OPENCLAW_SKILLS_SETUP.md`) + per-skill `OPENCLAW_SKILL_<SKILL>_SETUP.md`.
- Each setup doc must declare **scope** (what it covers / excludes).
- `<SKILL>` must equal the OpenClaw skill id string (`~/.openclaw/skills/<id>` and `skills.entries.<id>`)—not marketing titles with spaces.
- If `<id>` contains spaces/symbols, normalize only the **filename** (e.g. underscores) but repeat the exact `<id>` inside the doc body.
- Renames require updating every in-repo link in the same change.

## 10) Skill authoring (mandatory)

- Filenames and bodies must describe the same skill—no mismatched naming.
- External skills need a dedicated `OPENCLAW_SKILL_<SKILL>_SETUP.md` plus an index entry in `OPENCLAW_SKILLS_SETUP.md`.
- Each setup doc should contain: scenario, prerequisites, install steps, `openclaw.json` snippet, verification, troubleshooting (recommended).
- `skills/*/SKILL.md` must stay action-oriented: triggers, inputs/outputs, limits, failure handling.
- Upstream attribution (e.g. LobsterAI) belongs in a “Source” section, not in primary project naming.

