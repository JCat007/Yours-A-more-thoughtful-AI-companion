# OpenClaw skill setup: `media-image` (image generation)

Focuses on the **image capability layer**, not a single vendor. Default provider in this repo is **`seedream`**; future options might include `gemini-image`, `openai-image`, etc.

## Scope

- Image path only (selfies, scenes, consistent character shots).  
- Video path: [OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md](OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md).

## Current wiring

- OpenClaw skill: **`seedream`**.  
- Platform fallback: Doubao image API when OpenClaw does not emit the expected tool call.

## Common issues

- Bella replies “on it~” but no image arrives.  
- Gateway logs: `exec denied: allowlist miss`.

## Fix checklist

### 1) Run the setup helper

```bash
cd ~/projects/yours
node scripts/openclaw-setup-seed-exec.js
```

This aligns `tools.exec` (`host=gateway`), `exec-approvals.json`, and `ARK_API_KEY` wiring for seedream.

### 2) Copy the skill

```bash
cp -r skills/seedream ~/.openclaw/skills/
```

or `./scripts/wsl-migrate.sh`.

### 3) Inspect `openclaw.json`

- `skills.entries.seedream.enabled = true`  
- `skills.entries.seedream.env.ARK_API_KEY` populated  
- `tools.exec.host = gateway`

### 4) Restart gateway

```bash
openclaw gateway stop
openclaw gateway --port 18789
```

### 5) Verify

Prompts like “send a selfie” / “show yourself” should yield an `imageUrl` in the web app when keys are valid.

## Provider naming (forward-looking)

```env
MEDIA_IMAGE_PROVIDER=seedream
MEDIA_IMAGE_FALLBACKS=gemini-image,openai-image
```

Runtime may still read legacy env keys; these names document the intended abstraction.
