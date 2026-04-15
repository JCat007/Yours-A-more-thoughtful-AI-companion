import type { Request, Response, NextFunction } from 'express';
import { getBellaSessionCookie } from '../lib/cookies';
import { resolveSessionFromCookie } from '../services/authService';

/**
 * Attaches `req.bellaUser` when a valid `bella_session` cookie is present.
 * Never blocks the request chain on failure (DB down → anonymous).
 */
export async function optionalBellaAuth(req: Request, _res: Response, next: NextFunction) {
  req.bellaUser = null;
  try {
    const raw = getBellaSessionCookie(req);
    if (!raw) return next();
    const user = await resolveSessionFromCookie(raw);
    if (user) req.bellaUser = user;
  } catch {
    req.bellaUser = null;
  }
  next();
}
