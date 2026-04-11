# Bella capabilities and skill extensions

## China / World mode

Bella supports **China** and **World** region modes (toggle in the header modal). Default is **China**. Skills should follow [SKILL_CONVENTION_CHINA_WORLD.md](SKILL_CONVENTION_CHINA_WORLD.md) for regional differences.

---

## What Bella can do today

| Capability | Description | Example triggers | Dependencies |
|------------|-------------|-------------------|--------------|
| **Text chat** | Casual chat, greetings, persona tone | Any text | OpenClaw / OpenAI / Doubao / Kimi |
| **Persona chat** | Bella voice (playful, caring, reliable) | All turns | Bella SOUL (`~/.openclaw/workspace/SOUL.md`) |
| **Hot topics** | Injects “today’s hotspots” when not on OpenClaw | “What’s hot today”, “recommend some” | Backend `getTodayHotspotsContext` |
| **Selfie images** | Bella-style selfie image | “selfie”, “send a pic”, “show yourself” | `DOUBAO_API_KEY`, media-image (default seedream) |
| **Short video** | Bella-style short clip | “record a video”, “send video”, “video” | `DOUBAO_API_KEY`, media-video (default seedance) |
| **What are you doing** | Random scene + image or video | “what are you doing”, “wyd” | Same as above + `WHAT_DOING_SCENES` |
| **Voice input** | Speech-to-text | Mic button (Voice mode) | Whisper assets (`npm run download-whisper`) |
| **Voice readout** | TTS reads Bella’s reply | Voice mode + send | Browser Web Speech API |

### Backend decision flow

1. **`planReplyMode`** — LLM or heuristics → `text_only` / `text_and_image` / `text_and_video`.  
2. **`chatWithAssistant`** — OpenClaw or other provider for text.  
3. **`generateSelfieImage` / `generateSelfieVideo`** — media when required.

---

## OpenClaw skills (some patterns from Lobster-style stacks)

### PDF
Use **pdf** for extract/merge/forms/tables. For **Markdown-only** ingestion prefer **markitdown**. See [OPENCLAW_SKILL_PDF_SETUP.md](OPENCLAW_SKILL_PDF_SETUP.md), [OPENCLAW_SKILL_MARKITDOWN_SETUP.md](OPENCLAW_SKILL_MARKITDOWN_SETUP.md).

### markitdown
Use **markitdown** to normalize PDF/Office/etc. to Markdown for model consumption. For editing Word/PPT/Excel or PDF merge/fill, still use **docx / pptx / xlsx / pdf**. See [OPENCLAW_SKILL_MARKITDOWN_SETUP.md](OPENCLAW_SKILL_MARKITDOWN_SETUP.md).

### web-to-markdown
When the user gives a URL and needs article body as Markdown, use **web-to-markdown** (defaults try `r.jina.ai`, then direct HTML extraction). See [OPENCLAW_SKILL_WEB_TO_MARKDOWN_SETUP.md](OPENCLAW_SKILL_WEB_TO_MARKDOWN_SETUP.md).

### canvas-design / docx / frontend-design / pptx / xlsx
Posters, Word, web UI, decks, spreadsheets — see [OPENCLAW_SKILLS_SETUP.md](OPENCLAW_SKILLS_SETUP.md).

### media-image / media-video
Image/video generation skills — see [OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md](OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md) and [OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md](OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md).

---

## How to extend Bella

### Path A — extend inside **OpenClaw** (dialog layer)

Bella’s dialog behavior comes from OpenClaw SOUL + installed skills.

1. **Edit SOUL** at `~/.openclaw/workspace/SOUL.md` — describe new abilities, e.g.:
   ```markdown
   ## New Bella ability
   When the user asks for weather, call the **weather** skill and answer in Bella’s tone.
   ```
2. **Add skills** — `openclaw skills add @author/skill-name` or manual folders under `~/.openclaw/workspace/skills/` with `SKILL.md`.
3. **Skill shape** (see [OpenClaw docs](https://docs.openclaw.ai/tools/creating-skills)):
   ```markdown
   ---
   name: my-skill
   description: One-line description
   ---
   # Usage
   When the user says X, do Y...
   ```

**Note:** the web app calls OpenClaw’s Chat Completions API and only sees final text. Tool use is inside OpenClaw. If Bella “promises” something the gateway cannot do, the platform cannot magically invoke tools for her—this path fits **dialog-native** capabilities or skills already wired in OpenClaw.

### Path B — extend the **platform backend**

Add platform APIs and combine them with chat.

1. New **reply shapes** — extend `ReplyMode` in `assistant.ts` (e.g. `text_and_xxx`).  
2. New **rules** — extend `planReplyMode`, `wantsXxx`, etc.  
3. New **generators** — e.g. `generateXxx()` calling external APIs.  
4. New **MCP tools** — register in `backend/src/mcp/config.ts`, call from `assistant.ts`.

**Example — weather MCP**

- Configure the MCP server in `mcp/config.ts`.  
- Implement `callWeatherMcpTool` in `assistant.ts`.  
- Detect “weather” intents in routing.  
- In `routes/assistant.ts`, optionally call the tool before/inside `chatWithAssistant` context.

---

## Testing that features work

### Text
1. Open `http://localhost:5173`.  
2. Go to Bella.  
3. Send “hello” / “how’s your day”.  
4. Confirm tone matches SOUL.

### Selfie image
1. Send “selfie”, “show yourself”, etc.  
2. With `DOUBAO_API_KEY`, expect text + `imageUrl`.  
3. Without key, text only.

### Short video
1. “record a video”, “send video”, …  
2. With `DOUBAO_API_KEY`, expect text + video payload when configured.

### “What are you doing”
1. Phrases like “what are you doing” / “wyd”.  
2. Expect text + random-scene media when keys exist.

### Voice input
1. Voice mode → mic → speak.  
2. Text should appear and send.

### curl backend

```bash
curl -X POST http://localhost:3001/api/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"send a selfie","history":[]}'
```

Expect `reply` and `imageUrl` when routed to `text_and_image`.

### curl OpenClaw gateway (WSL)

```bash
curl -X POST http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"minimax/MiniMax-M2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":100}'
```

Gateway should return JSON text.

---

## FAQ

| Symptom | Likely cause |
|---------|----------------|
| Text but no image/video | Missing `DOUBAO_API_KEY` or media generation error (check logs). |
| Tone not Bella-like | SOUL not deployed to `~/.openclaw/workspace/SOUL.md`, or gateway not using that workspace. |
| New skill ignored | OpenClaw path: document triggers in SOUL; platform path: update `assistant.ts` + `routes/assistant.ts`. |
| Wrong media routing | Inspect `planReplyMode` output and `wantsSelfie` / `wantsWhatDoing` / `wantsVideo`. |

---

## Summary

- **Dialog + persona:** OpenClaw SOUL + skills; platform sends chat completions.  
- **Images/videos (seedream/seedance path):** platform backend + Doubao-style keys, separate from internal OpenClaw tool wiring.  
- **Extension:** add behavior in OpenClaw for dialog tools; add APIs/MCP/rules in the backend for platform-level features.
