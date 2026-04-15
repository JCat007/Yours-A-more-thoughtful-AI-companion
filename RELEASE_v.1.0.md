# Yours v.1.0

**Release Date:** 

## Update

This release introduces a framework-switchable Agent architecture for Bella, allowing users to choose OpenClaw or Hermes at initialization and manually switch frameworks later under a safe idle-state policy.

The update focuses on continuity across framework changes: conversation context migration strategies, shared memory assets, consistent persona behavior, and resilient skill interoperability with conflict-aware resolution.

It also formalizes operational boundaries for switching, improves runtime observability, and establishes a scalable foundation for future multi-framework expansion.

## Highlights

### 1) Framework Choice at Initialization
- Users can now select **OpenClaw** or **Hermes** during onboarding.
- Initialization remains simple: framework-only selection with no additional migration prompts.
- Hidden backend capability is reserved for future import flows without changing current UX.

### 2) Manual Framework Switching (Idle-State Only)
- Framework switching is supported as a **manual user action only**.
- Switching is allowed only when Bella is in a completed idle state:
  - final response already returned to frontend and backend flow is complete,
  - no active background task remains in the job manager.
- This avoids hot-switch instability and partial execution corruption.

### 3) Context Migration Strategies
- Users can choose the migration scope when switching frameworks:
  - **Last 20 Turns** (default),
  - **Full History + Summary**.
- The migration process normalizes context into a canonical payload before importing into the target framework.
- This preserves short-term continuity and long-term semantic memory during framework transitions.

### 4) Shared Memory and Persona Continuity
- Skills, gbrain memory, persona signals, and reusable context assets are designed for cross-framework continuity.
- gbrain is treated as the cross-framework memory source of truth for durable user preference continuity.
- Persona behavior remains stable across frameworks through unified policy injection and context layering.

### 5) Skill Interoperability Without Forced Unified Root
- OpenClaw and Hermes skill stores are kept framework-native to reduce runtime coupling risks.
- A bridge index/mapping layer enables bidirectional reuse and migration of Markdown-based skills.
- On name conflicts, both versions are preserved with lightweight protection and conflict metadata.

### 6) Skill Conflict Resolution and Execution Priority
- Skill invocation uses deterministic priority rules:
  1. user-pinned version,
  2. current framework-native version,
  3. last successful runtime version,
  4. most recent updated version.
- This balances predictability, compatibility, and execution reliability.

### 7) Background Write Safety During Switch
- Asynchronous memory writes (e.g., gbrain timeline writes) are decoupled from framework selection state.
- Under non-restart switching, in-flight background writes continue safely and are not interrupted by framework change alone.
- Optional diagnostics can expose pending background writes for better transparency.

### 8) Operational Guardrails and Observability
- Switching APIs include validation, readiness checks, migration summaries, and error-safe rollback semantics.
- Runtime state and migration decisions are structured for auditability and troubleshooting.
- The architecture is prepared for future policy expansion (auto-routing, richer import flows, staged rollout controls).
