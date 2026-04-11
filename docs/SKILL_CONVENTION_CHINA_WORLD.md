# OpenClaw skills — China / World convention

All Bella-related OpenClaw skills should follow this convention: distinguish **China** vs **World** mode and align with the frontend region toggle. If a skill is global with no regional difference, say so; otherwise document both modes.

---

## 1. Mode definitions

| Mode | English | Meaning |
|------|---------|---------|
| China | China | Mainland China–oriented defaults: prefer services reachable without extra proxying |
| World | World | Global users: may use Google, Wikipedia, etc. |

---

## 2. Skill file conventions

### 2.1 Declare modes in `SKILL.md`

Each skill’s `SKILL.md` should include frontmatter or a clear block like:

```yaml
---
name: my-skill
description: What the skill does
# If truly global with no China/World split:
global: true

# If modes differ, document both:
modes:
  china:
    engine: "Service used (e.g. bing.com)"
    note: "Optional notes"
  world:
    engine: "Service used (e.g. google.com)"
    note: "Optional notes"
---
```

### 2.2 If `modes` is omitted

- Treat as `global: true`, **or** add explicit `modes` once behavior differs by region.

---

## 3. Example — Weather

| Mode | Data source | Notes |
|------|-------------|--------|
| China | Open-Meteo API | Free, no API key, reachable in China |
| World | Open-Meteo + wttr.in | Open-Meteo is global; wttr.in backup may time out in China |

Open-Meteo is globally usable; China mode prefers it; wttr.in is more useful as a fallback in World mode.

---

## 4. Frontend alignment

- Users switch region with the **China / World** control in the UI.  
- Value is stored in `localStorage` (`bella-mode`) and sent with each chat request.  
- Backend uses `mode` to pick services or env (extensible).  
- When switching, skills that depend on external endpoints may require OpenClaw gateway restart or deploy scripts keyed off `bella-mode`.
- UI language (`hotspot-lang`: `zh` \| `en`) defaults from mode **only until** the user explicitly picks a language; then `localStorage` sets `hotspot-lang-user-chose=1` and mode changes no longer override UI language (`ModeContext` + `LanguageContext`).

---

## 5. Checklist for a new skill

1. Is it global (pure logic, no region-specific network)? → set `global: true`.  
2. If China vs World differs:  
   - Document `modes.china` and `modes.world` in `SKILL.md`.  
   - Describe engines/services and how to configure them.  
   - Keep the skill summary in the frontend modal consistent with `/api/assistant/config` (backend-driven).

---

## 6. Reply language vs UI vs `china` / `world` mode

Treat these as **three separate knobs** (do not tie reply language to mode).

Implementation in this repo: `POST /api/assistant/chat` accepts **`uiLocale`** (`zh` \| `en`, from the frontend `LanguageContext`). Reply language is inferred in `backend/src/lib/replyLanguage.ts` (user text → recent user turns → `uiLocale` → default `en`).

| Knob | Role | Rule of thumb |
|------|------|----------------|
| **`china` / `world`** | Website and **tool reachability** (which hosts, search stack, fallbacks). | Never used to *force* Chinese vs English replies. |
| **UI language** | Buttons, labels, errors in the **browser**. | World mode + user picks Chinese → **UI is Chinese**; chat reply language is still decided below. |
| **Assistant reply language** | What Bella **writes** in the chat. | **Primary signal = the language of the user’s actual input** (last message or dominant thread language). Example: World mode, English UI, user types in Chinese → Bella should answer in **Chinese**. |

**Suggested priority when building the “reply language” hint for the model:**

1. **User message language** (detect from the latest user turn, optionally smoothed over recent turns).  
2. Explicit user instruction (“reply in English”, “用中文答”) if present.  
3. **UI language** as a weak default when the message is mixed/empty (e.g. only an emoji or a file upload with no text).  

**Implementation note:** keep `mode` on the wire for routing/reachability; add or reuse a **`replyLocale`** / detection output only for prompt injection (e.g. “Reply in the same language as the user’s last message.”), independent of `mode`.

---

## 7. English `SKILL.md` / prompts vs fixed keywords (avoid “translation breaks the skill”)

**Yes — most skill *instructions* and system policy can stay in English.** What breaks is not “English prose” but **replacing or dropping stable tokens** that code, tools, or regex rely on.

**Keep frozen (never “translate” for i18n):**

- **Tool / MCP names**, CLI subcommands, **file paths**, env var names, JSON keys, skill folder names.  
- **URLs, hostnames**, vendor API literals, and any string matched by **router regex** in code.

**What can be multilingual without breaking execution:**

- **Natural-language triggers** (“user might say …”) — express the *same intent* in **multiple languages in one list**, instead of swapping one language for another.  
- **Examples** in `SKILL.md`: English instructions + a short **“User phrasing (ZH / EN / …)”** bullet list so the model maps colloquial Chinese to the same tool flow.

**Patterns that work well:**

1. **Parallel keyword lists** in code (already common for media / weather): one array for Chinese stems, one for English; same branch, same tool call.  
2. **English-only `SKILL.md` body** + explicit subsection **“Multilingual triggers”** listing non-English phrases that should still lead to this skill.  
3. **LLM intent layer** (router): prompt in English (“classify intent: weather / image / …”) but pass the **raw user text**; the model bridges languages so you do not need every typo in a regex. Downstream tools stay English.  
4. **Stable “handles” vs “copy”:** e.g. keep `web-to-markdown` as the tool id; describe usage in English; add “Users may ask 抓取正文 / summarize this URL” as *examples*, not as the executable name.

**Anti-pattern:** translating a **single** keyword list from Chinese to English only — you lose matches for Chinese-only users unless something else (detector or LLM) compensates.

**Logging and developer docs** — keep in **English** in the main repo.

**One-line summary:** **Mode = reachability. UI = chrome. Reply language = follow the user’s typing.** Skills stay English for mechanics; widen **trigger coverage** with multilingual lists or an LLM router, not by renaming tools.
