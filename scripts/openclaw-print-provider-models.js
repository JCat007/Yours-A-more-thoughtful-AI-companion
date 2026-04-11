#!/usr/bin/env node
/**
 * Prints provider -> model id lines from ~/.openclaw/openclaw.json (avoids node -e quoting in .bat).
 */
const fs = require("fs");
const os = require("os");
const p = `${os.homedir()}/.openclaw/openclaw.json`;
try {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const ps = (j.models && j.models.providers) || {};
  for (const k of Object.keys(ps)) {
    const ids = (Array.isArray(ps[k] && ps[k].models) ? ps[k].models : [])
      .map((m) => m && m.id)
      .filter(Boolean);
    if (ids.length) console.log(`${k}: ${ids.join(", ")}`);
  }
} catch (e) {
  console.error("read openclaw.json failed:", e && e.message ? e.message : e);
  process.exit(1);
}
