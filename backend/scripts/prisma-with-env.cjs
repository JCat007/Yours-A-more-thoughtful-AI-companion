#!/usr/bin/env node
/**
 * Loads backend/.env, applies the same DATABASE_URL auto-build as the server, then runs prisma CLI.
 * Usage: node scripts/prisma-with-env.cjs migrate deploy
 */
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

if (!String(process.env.DATABASE_URL || '').trim()) {
  const user = (process.env.POSTGRES_USER || 'bella').trim();
  const password = (process.env.POSTGRES_PASSWORD || '').trim();
  const host = (process.env.POSTGRES_HOST || '127.0.0.1').trim();
  const port = (process.env.BELLA_PG_HOST_PORT || '55432').trim();
  const db = (process.env.POSTGRES_DB || 'bella').trim();
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}`;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/prisma-with-env.cjs <prisma args...>');
  process.exit(1);
}

const r = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
process.exit(r.status === null ? 1 : r.status);
