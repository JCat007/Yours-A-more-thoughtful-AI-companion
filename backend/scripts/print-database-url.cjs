#!/usr/bin/env node
/**
 * Prints DATABASE_URL to stdout (one line) for tools like `gbrain init --url "$(npm run print-database-url)"`.
 * Loads backend/.env and applies the same auto-build as prisma-with-env / the server.
 */
const path = require('path');
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

const url = String(process.env.DATABASE_URL || '').trim();
if (!url) {
  console.error(
    'DATABASE_URL is empty. Set DATABASE_URL or POSTGRES_* in backend/.env (see backend/.env.example).',
  );
  process.exit(1);
}
process.stdout.write(url);
