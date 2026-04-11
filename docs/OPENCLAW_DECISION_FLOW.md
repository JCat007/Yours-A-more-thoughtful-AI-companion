# OpenClaw decision flow and output shapes

How Bella behaves under OpenClaw: user input → output-shape decision → optional skills → response.

## 1) High-level flow

```
User message
    ↓
OpenClaw agent (SOUL guidance)
    ↓
Decide output shape
    ├── text only
    ├── text + image
    ├── text + video
    └── text + files (e.g. PDF)
    ↓
Call skills when needed
    ├── media-image (default seedream)
    ├── media-video (default seedance)
    ├── pdf
    ├── canvas-design
    ├── docx
    ├── frontend-design
    ├── pptx
    ├── xlsx
    └── weather
    ↓
Return text / text+media / text+files
```

### Browser fallback chain (web extraction)

For “open a page and extract article body” style work, this project uses a **degradation chain**:

1. Try browser with existing session (`profile="user"`).  
2. On failure, use gateway-hosted Chromium (`profile="openclaw"`).  
3. If still failing, return a clear error and human-readable next steps.

The chain is driven by backend retries + prompt text, not a single OpenClaw-only switch.

### URL intent router (extract / search / chat)

A lightweight URL router (`extract_page_content | search_web | normal_chat`) refines behavior when messages contain links.

- It **does not replace** the main Bella intent classifier; it runs in parallel where applicable.  
- Only high-confidence “extract page content” hits add system guidance favoring `web-to-markdown`.  
- Other flows follow the existing LLM + rule routing.  
- When URLs exist, a “semantic disambiguation” hint is injected so the model chooses between “fetch this page’s body” vs “search the web for more sources,” avoiding brittle keyword-only routing.

### Debug hooks

The backend emits stable debug events:

- `url_router.intent` — rule output (`intent`, `confidence`, `score`, `reasons`).  
- `url_router.hook` — whether semantic hints fired, forced extraction, sample URLs.

## 2) Output shapes vs skills

| Shape | Typical triggers | Skill | Result |
|-------|------------------|-------|--------|
| Text only | Chat, greetings, hot topics, weather recap | none / weather | Text |
| Text + image | Selfie, “show yourself”, photo asks | **media-image** | Text + image file |
| Text + video | “Record a video”, motion / “wyd” clips | **media-video** | Text + video file |
| Text + files | PDF merge/split/tables/forms | **pdf** | Text + files |
| Text + files | Posters / visual design | **canvas-design** | Text + `.pdf` / `.png` |
| Text + files | Word authoring | **docx** | Text + `.docx` |
| Text + code/files | Landing pages / React | **frontend-design** | Text + code/files |
| Text + files | Slides | **pptx** | Text + `.pptx` |
| Text + files | Spreadsheets | **xlsx** | Text + `.xlsx` |

## 3) Rules

### 3.1 No physical camera commands

- `camera.snap`, `camera.clip`, `screen.record` target **real hardware**.  
- Bella’s selfies/videos come from **media-image / media-video** (defaults: seedream / seedance).

### 3.2 Forbidden denial patterns

Do not claim there is no camera, no body, no pairing, “silicon only,” etc. Media generation skills satisfy those asks.

### 3.3 Tone

Playful, affectionate, short lines—see `docs/templates/Bella-SOUL.md`.

## 4) SOUL and gateway

- **`~/.openclaw/workspace/SOUL.md`** — copy from `docs/templates/Bella-SOUL.md`, customize.  
- **`gateway.nodes.denyCommands`** — keep device commands denied, e.g. `camera.snap`, `camera.clip`, `screen.record`, …  
- **Skills** — enable media skills and configure `ARK_API_KEY` / `DOUBAO_API_KEY` as required.

## 5) Backend vs OpenClaw

- **OpenClaw path:** messages go to the gateway; SOUL steers tool use inside OpenClaw.  
- **Media files:** may land under the workspace; the web app may need extra wiring to surface binary attachments depending on your deployment.
