# OpenClaw `web_fetch` SSRF guard + DNS / proxy notes

## Symptom

Logs look like:

```
[security] blocked URL fetch (url-fetch) target=https://www.google.com/search
reason=Blocked: resolves to private/internal/special-use IP address
[tools] web_fetch failed: Blocked: resolves to private/internal/special-use IP address
```

**Cause:** OpenClaw’s SSRF protection blocks URLs whose DNS resolves to private/special-use ranges. In some regions, DNS pollution or VPN DNS may map `google.com` / `wikipedia.org` to `127.0.0.1`, `10.x.x.x`, etc., tripping the guard.

**Not model-specific:** the block happens before the chat model’s content matters.

---

## 1) Current OpenClaw limits

- `tools.web.fetch` uses a strict schema; there is **no** supported knob for `ssrfPolicy`, `allowedHostnames`, or `allowPrivateNetwork` at the time this doc was written.  
- `web_fetch` calls `fetchWithSsrFGuard` with the default policy (private IPs rejected).  
- Relaxing SSRF requires upstream OpenClaw support — open an issue upstream if you need policy hooks.

---

## 2) Fix DNS / proxy (recommended)

Node’s `dns.lookup()` follows **system DNS**, not `HTTP_PROXY`. The OpenClaw gateway process must therefore resolve public hosts to **public** IPs.

### Trusted resolvers

Examples: `8.8.8.8`, `8.8.4.4`, `1.1.1.1`, `1.0.0.1`.

**Windows (admin PowerShell) example:**

```powershell
netsh interface ip set dns name="WLAN" static 8.8.8.8
netsh interface ip add dns name="WLAN" 8.8.4.4 index=2
```

(Replace `"WLAN"` with your interface name.)

### VPN / Clash / V2Ray

1. Prefer **TUN** or system proxy modes with DNS that uses DoH/DoT or trusted upstreams.  
2. Avoid fake-IP modes that return RFC1918 addresses for real domains.  
3. Keep OpenClaw `env` proxy entries if you rely on them, e.g.:

```json
"env": {
  "HTTP_PROXY": "http://127.0.0.1:7890",
  "HTTPS_PROXY": "http://127.0.0.1:7890"
}
```

### Preflight

```cmd
nslookup www.google.com
```

If you see `127.0.0.1` or `10.0.0.0/8`, SSRF will keep firing until DNS is fixed.

---

## 3) Optional: Firecrawl fallback

When `web_fetch` fails (including SSRF), OpenClaw may fall back to Firecrawl if configured. Firecrawl fetches in the cloud, bypassing local SSRF checks.

1. Create a [Firecrawl](https://firecrawl.dev) API key.  
2. Add to `openclaw.json`:

```json
{
  "tools": {
    "web": {
      "fetch": {
        "enabled": true,
        "firecrawl": {
          "enabled": true,
          "apiKey": "fc-xxxx"
        }
      }
    }
  }
}
```

Or export `FIRECRAWL_API_KEY`.

---

## 4) `openclaw doctor`

After upgrades:

```bash
openclaw doctor --fix
```

Helps browser/trusted-network hygiene; limited effect on `web_fetch` DNS issues.

---

## 5) Example `env` snippet

```json
"env": {
  "HTTP_PROXY": "http://127.0.0.1:7890",
  "HTTPS_PROXY": "http://127.0.0.1:7890"
}
```

`web_fetch` can still be invoked for arbitrary URLs; if DNS lies, SSRF blocks remain. **Prefer fixing DNS** so `www.google.com` / `en.wikipedia.org` resolve to real public addresses.
