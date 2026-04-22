import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by `optionalBellaAuth` when a valid session cookie is present. */
      bellaUser?: { id: string; username: string } | null;
    }
  }
}

export {};
