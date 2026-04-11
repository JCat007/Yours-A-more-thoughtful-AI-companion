# OpenClaw skill setup: `China-E-commerce Price Comparison Skills` (legacy rollback)

Install the ClawHub bundle **`China-E-commerce Price Comparison Skills`** when you must roll back from `taobao-shop-price`. Prefer **`taobao-shop-price`** for new deployments—see [OPENCLAW_SKILL_TAOBAO_SHOP_PRICE_SETUP.md](OPENCLAW_SKILL_TAOBAO_SHOP_PRICE_SETUP.md).

## Scope

Install/enable/verify only. Pricing logic belongs to the upstream `SKILL.md`.

## Skill identifiers

- OpenClaw id: **`China-E-commerce Price Comparison Skills`** (must match exactly).  
- Directory: `~/.openclaw/skills/China-E-commerce Price Comparison Skills/`

## Notes

- Skill may require outbound internet, cookies, proxies, or vendor-specific env vars—follow the author’s `SKILL.md`.

## Install

```bash
ls -la "$HOME/.openclaw/skills/China-E-commerce Price Comparison Skills"
```

Enable in `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "China-E-commerce Price Comparison Skills": { "enabled": true }
    }
  }
}
```

Restart:

```bash
openclaw gateway stop || true
openclaw gateway --port 18789
```

## Verify

Trigger a price-compare prompt (Chinese examples often work best). Confirm structured prices/coupons or actionable follow-ups.

## Troubleshooting

- `enabled=false` → flip in `openclaw.json`.  
- Gateway cannot load skill → directory name must match id exactly.  
- Partial data → read gateway logs for network/auth/env gaps.
