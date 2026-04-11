# OpenClaw skill setup: `media-video` (video generation)

Describes the **video capability layer**, not a single vendor. Default provider here is **`seedance`**; future options could include `gemini-video`, `runway`, etc.

## Scope

- Short clips, motion prompts.  
- Images: [OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md](OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md).

## Current wiring

- OpenClaw skill: **`seedance`**.  
- Platform fallback: Doubao video API when OpenClaw skips tool execution.

## Common issues

- “Rendering video…” with no playable asset.  
- `exec denied: allowlist miss` in gateway logs.

## Fix checklist

### 1) Helper script

```bash
cd ~/projects/yours
node scripts/openclaw-setup-seed-exec.js
```

### 2) Copy skill

```bash
cp -r skills/seedance ~/.openclaw/skills/
```

or `./scripts/wsl-migrate.sh`.

### 3) `openclaw.json`

- `skills.entries.seedance.enabled = true`  
- `skills.entries.seedance.env.ARK_API_KEY`  
- `tools.exec.host = gateway`

### 4) Restart gateway

```bash
openclaw gateway stop
openclaw gateway --port 18789
```

### 5) Verify

Prompts like “record a short clip” / “send a video” should produce a video URL or attachment when configured.

## Provider naming (forward-looking)

```env
MEDIA_VIDEO_PROVIDER=seedance
MEDIA_VIDEO_FALLBACKS=gemini-video
```

Legacy env keys may still drive runtime; treat the block above as documentation for future refactors.
