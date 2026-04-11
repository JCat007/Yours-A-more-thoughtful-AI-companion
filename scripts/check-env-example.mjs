#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function parseEnvKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, "utf8");
  const keys = new Set();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eqIndex = withoutExport.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = withoutExport.slice(0, eqIndex).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      keys.add(key);
    }
  }
  return keys;
}

if (!fs.existsSync(examplePath)) {
  console.error("Missing .env.example");
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.warn("No .env found; skipped strict comparison.");
  console.warn("Tip: create .env from .env.example first.");
  process.exit(0);
}

const envKeys = parseEnvKeys(envPath);
const exampleKeys = parseEnvKeys(examplePath);

const missingInExample = [...envKeys].filter((k) => !exampleKeys.has(k));
const missingInEnv = [...exampleKeys].filter((k) => !envKeys.has(k));

if (missingInExample.length === 0 && missingInEnv.length === 0) {
  console.log("OK: .env and .env.example keys are aligned.");
  process.exit(0);
}

if (missingInExample.length > 0) {
  console.error("Missing in .env.example:", missingInExample.join(", "));
}
if (missingInEnv.length > 0) {
  console.error("Missing in .env:", missingInEnv.join(", "));
}

process.exit(1);
