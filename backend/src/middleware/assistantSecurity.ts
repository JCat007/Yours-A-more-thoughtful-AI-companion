import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function extractBearerToken(req: Request): string {
  const auth = String(req.headers['authorization'] || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || '').trim();
}

function extractApiKey(req: Request): string {
  const direct = String(req.headers['x-api-key'] || '').trim();
  if (direct) return direct;
  const queryKey = String((req.query as any)?.apiKey || (req.query as any)?.api_key || '').trim();
  if (queryKey) return queryKey;
  return extractBearerToken(req);
}

export function requireAssistantApiKey(req: Request, res: Response, next: NextFunction) {
  const required = (process.env.BACKEND_API_KEY || '').trim();
  if (!required) return next(); // Skip auth when BACKEND_API_KEY is unset (local dev convenience).

  const got = extractApiKey(req);
  if (!got) return res.status(401).json({ error: 'Unauthorized' });
  if (!safeEqual(got, required)) return res.status(403).json({ error: 'Forbidden' });
  return next();
}

type RateState = { windowStartMs: number; count: number };
const rateMap = new Map<string, RateState>();

function getClientIp(req: Request): string {
  // Requires app.set('trust proxy', ...) so X-Forwarded-For maps to real clients.
  const ip = (req.ip || '').trim();
  return ip || 'unknown';
}

/**
 * Lightweight per-IP rate limiting (in-memory):
 * - OK for single-node / few replicas
 * - For clusters, prefer Nginx/Cloudflare/Redis counters
 */
export function assistantRateLimit(req: Request, res: Response, next: NextFunction) {
  const windowMs = Math.max(1000, parseInt(process.env.ASSISTANT_RATE_LIMIT_WINDOW_MS || '60000', 10));
  const max = Math.max(1, parseInt(process.env.ASSISTANT_RATE_LIMIT_MAX || '20', 10));
  const ip = getClientIp(req);
  const now = Date.now();

  const key = ip;
  const s = rateMap.get(key);
  if (!s || now - s.windowStartMs >= windowMs) {
    rateMap.set(key, { windowStartMs: now, count: 1 });
    return next();
  }
  s.count += 1;
  if (s.count > max) {
    res.setHeader('Retry-After', Math.ceil((s.windowStartMs + windowMs - now) / 1000));
    return res.status(429).json({ error: 'Too Many Requests' });
  }
  return next();
}

