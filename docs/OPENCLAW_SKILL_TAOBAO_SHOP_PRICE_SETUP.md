# OpenClaw skill setup: `taobao-shop-price`

Wire the external **`taobao-shop-price`** skill into OpenClaw and use it as the default China e-commerce comparison tool.

## Scope

Install, enable, verify, rollback. Scoring heuristics live in the skill’s own `SKILL.md`.

## Skill identifiers

- OpenClaw id: **`taobao-shop-price`**  
- Directory: `~/.openclaw/skills/taobao-shop-price/`  
- Legacy bundle (rollback only): **`China-E-commerce Price Comparison Skills`**

## Prerequisites

- GitHub access from WSL/Linux  
- `git`, `python3`  
- Working `~/.openclaw/openclaw.json`

## Install (non-destructive)

```bash
set -e
TMP_DIR="$(mktemp -d)"
git clone --depth 1 https://github.com/openclaw/skills "$TMP_DIR/repo"
mkdir -p "$HOME/.openclaw/skills/taobao-shop-price"
cp -r "$TMP_DIR/repo/skills/taobao/." "$HOME/.openclaw/skills/taobao-shop-price/"
rm -rf "$TMP_DIR"
```

Flip flags in `openclaw.json`:

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.openclaw/openclaw.json")
old_id = "China-E-commerce Price Comparison Skills"
new_id = "taobao-shop-price"
with open(p, "r", encoding="utf-8") as f:
    data = json.load(f)
entries = data.setdefault("skills", {}).setdefault("entries", {})
entries.setdefault(old_id, {})["enabled"] = False
entries.setdefault(new_id, {})["enabled"] = True
with open(p, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("updated", p)
PY
```

Restart:

```bash
openclaw gateway stop || true
openclaw gateway --port 18789
```

## Verify

```bash
ls -la "$HOME/.openclaw/skills/taobao-shop-price"
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.openclaw/openclaw.json")
with open(p, "r", encoding="utf-8") as f:
    d = json.load(f)
e = d.get("skills", {}).get("entries", {})
print("taobao-shop-price:", e.get("taobao-shop-price"))
print("legacy:", e.get("China-E-commerce Price Comparison Skills"))
PY
```

Conversation smoke tests (Chinese prompts typical for this skill):

- Ask for top-N product candidates with ranking.  
- Ask for purchase links for selected indices.

## Rollback

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.openclaw/openclaw.json")
with open(p, "r", encoding="utf-8") as f:
    data = json.load(f)
entries = data.setdefault("skills", {}).setdefault("entries", {})
entries.setdefault("taobao-shop-price", {})["enabled"] = False
entries.setdefault("China-E-commerce Price Comparison Skills", {})["enabled"] = True
with open(p, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("rollback done")
PY
```

## Troubleshooting

- Clone failures → network / GitHub access.  
- Skill never triggers → `skills.entries.taobao-shop-price.enabled`.  
- Empty payloads → upstream API health / rate limits (see skill author notes).

## References

- ClawHub listing: `xchicky/taobao-shop-price`  
- Upstream tree: `openclaw/skills` → `skills/taobao`
