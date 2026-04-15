/**
 * If `DATABASE_URL` is unset, build it from split Postgres vars (same names Docker uses).
 * Edit `POSTGRES_PASSWORD` (and optional host/port/db) in `backend/.env` once — no hand-written URL.
 */
export function ensureDatabaseUrlFromParts(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const user = (process.env.POSTGRES_USER || 'bella').trim();
  const password = (process.env.POSTGRES_PASSWORD || '').trim();
  const host = (process.env.POSTGRES_HOST || '127.0.0.1').trim();
  const port = (process.env.BELLA_PG_HOST_PORT || '55432').trim();
  const db = (process.env.POSTGRES_DB || 'bella').trim();
  // Empty password is valid for local Postgres (URL still needs `user:` before `@host`).
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}`;
}
