# Weather skill — diagnostics and fixes

If Bella cannot answer weather questions, work through this list.

## China / World modes

| Mode | Sources | Notes |
|------|---------|--------|
| **China** | Open-Meteo API | Free, reachable in mainland China without a key |
| **World** | Open-Meteo + wttr.in | Open-Meteo is global; wttr.in is a backup (may time out from China) |

The backend already prefers Open-Meteo and may try wttr.in on failure. Users in China who need wttr.in should set `WEATHER_PROXY` if traffic must go through a local proxy.

---

## 1) Where OpenClaw loads skills

| Location | Role |
|----------|------|
| Bundled skills | Shipped with OpenClaw |
| `~/.openclaw/skills/` | Shared across agents |
| `~/.openclaw/workspace/skills/` | Highest priority for the active workspace |

ClawHub installs into `./skills` relative to the current working directory. If you run installers from the wrong folder, skills may land where OpenClaw will not load them.

---

## 2) Check that `weather` exists

```bash
ls -la ~/.openclaw/workspace/skills/
ls -la ~/.openclaw/skills/
ls -la ~/.openclaw/workspace/skills/weather/ 2>/dev/null
ls -la ~/.openclaw/skills/weather/ 2>/dev/null
```

If neither tree contains `weather`, install into the workspace:

```bash
cd ~/.openclaw/workspace
npx clawhub@latest install steipete/weather
```

or:

```bash
CLAWHUB_WORKDIR=~/.openclaw/workspace npx clawhub@latest install steipete/weather
```

You can also copy a skill directory into `~/.openclaw/skills/` manually.

---

## 3) `openclaw.json` skill toggles

Ensure weather is not disabled:

```json
{
  "skills": {
    "entries": {
      "weather": { "enabled": true },
      "steipete/weather": { "enabled": true }
    }
  }
}
```

Remove `"enabled": false` entries or set them to `true`.

---

## 4) Restart the gateway

After edits:

```bash
# stop gateway (Ctrl+C) then:
openclaw gateway --port 18789
```

---

## 5) Backend weather fallback

Even if the OpenClaw skill is missing, the **platform backend** can fetch Open-Meteo / wttr.in and inject a short forecast into chat context (`assistant.ts`: `wantsWeather`, `fetchWeatherFromWttr`, etc.).

**China + VPN:** the Node process may not use the VPN unless you set:

```env
WEATHER_PROXY=http://127.0.0.1:7890
```

(common Clash port; adjust for your stack). Restart the backend after changing env.
