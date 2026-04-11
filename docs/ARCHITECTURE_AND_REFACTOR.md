# Architecture (current)

This document describes the **running** Bella stack in `yours`:

- Intent first (LLM and/or rules).  
- Optional OpenClaw execution.  
- Outer persona LLM for Bella-shaped replies.

---

## 1. Three layers

### 1.1 Router (intent)

Entry: `backend/src/services/bellaIntentClassifier.ts`

- Output shape: `intent`, `confidence`, `shouldUseOpenClaw`, `needsFileSkill`, `needsImage`.  
- `BELLA_ROUTER_MODE`: `llm | rule | hybrid` (default `hybrid`).  
- Under `hybrid`, low LLM confidence falls back to rules.  
- Uploads force `task_request` and `shouldUseOpenClaw=true`.

### 1.2 Executor

Entry: `backend/src/routes/assistant.ts` — `POST /api/assistant/chat`

- Path depends on intent, not a single fixed pipeline.  
- Light chat can return synchronously.  
- Files / media / heavy tasks use the OpenClaw **job** path (progress + result APIs).  
- OpenClaw protocol: `{OPENCLAW_GATEWAY_URL}/v1/chat/completions` (OpenAI-compatible).

### 1.3 Persona layer

Entry: `backend/src/services/bellaComposer.ts` + `backend/src/services/bellaOuterLlm.ts`

- Executor output is “raw execution,” not shown verbatim.  
- Persona LLM turns it into the final Bella reply.  
- System prompt from `backend/src/services/bellaPersona.ts`; SOUL body from `docs/templates/Bella-SOUL.md`.

---

## 2. Request flow (`/api/assistant/chat`)

1. Accept `message`, `history`, `fileIds`, `mode`.  
2. Read session memory (recent user text + last intent).  
3. `decideBellaRoute` → intent + execution hints.  
4. Branch: sync text vs OpenClaw job.  
5. For jobs: copy inputs, run task, collect downloads.  
6. Outer persona LLM → final Bella text.  
7. Return `reply` / `imageUrl` / `videoUrl` / `downloads` or an initial `jobId`.

---

## 3. OpenClaw scope

- OpenClaw is an optional executor, not bundled with this repo.  
- `yours` does not ship a pinned OpenClaw workspace tree.  
- Only gateway + agent env matter:  
  `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN` (and aliases), `OPENCLAW_AGENT_ID`.

That keeps deployment flexible (local / WSL / Docker / cloud) while the app repo stays small.

---

## 4. Important modules

- `backend/src/routes/assistant.ts` — orchestration (routes, jobs, SSE, downloads, media).  
- `backend/src/services/bellaIntentClassifier.ts` — LLM + rule routing.  
- `backend/src/services/assistant.ts` — providers, OpenClaw, media.  
- `backend/src/services/bellaComposer.ts` — final reply assembly.  
- `backend/src/services/bellaOuterLlm.ts` — outer LLM + fallbacks.  
- `backend/src/services/bellaPersona.ts` — persona system prompt.  
- `backend/src/services/bellaState.ts` — session + intent memory.

---

## 5. Status and next steps

The stack is already split into router, executor, and persona layers. Incremental improvements:

1. Further adapter-ize provider branches inside `assistant.ts`.  
2. Centralize env into a schema (validation, defaults, doc sync).  
3. Add structured evals/regressions for routing and persona quality.

These are enhancements; the current path is stable.
