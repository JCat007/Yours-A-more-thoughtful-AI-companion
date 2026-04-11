import type { Response } from 'express';

const COOKIE_NAME = 'bella_session';

export function getCookieHeader(req: { headers: { cookie?: string } }, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const parts = raw.split(';').map((s) => s.trim());
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(p.slice(eq + 1).trim());
    } catch {
      return p.slice(eq + 1).trim();
    }
  }
  return undefined;
}

export function getBellaSessionCookie(req: { headers: { cookie?: string } }): string | undefined {
  return getCookieHeader(req, COOKIE_NAME);
}

export function setBellaSessionCookie(res: Response, value: string, maxAgeMs: number) {
  const secure =
    String(process.env.BELLA_SESSION_SECURE || '').trim() === '1' ||
    String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearBellaSessionCookie(res: Response) {
  const secure =
    String(process.env.BELLA_SESSION_SECURE || '').trim() === '1' ||
    String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
