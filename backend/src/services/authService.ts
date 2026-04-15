import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';

const SALT_ROUNDS = 10;

function hashSessionToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function parseSessionCookieValue(raw: string | undefined): { sessionId: string; secret: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  return { sessionId: raw.slice(0, dot), secret: raw.slice(dot + 1) };
}

export async function countUsers(): Promise<number> {
  return prisma.bellaUser.count();
}

export async function registerUser(username: string, password: string) {
  const u = username.trim().toLowerCase();
  if (u.length < 2 || u.length > 64) throw new Error('Username length 2–64');
  if (password.length < 6) throw new Error('Password at least 6 characters');
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.bellaUser.create({
    data: {
      username: u,
      passwordHash,
      settings: {
        create: {
          companionMemoryEnabled: false,
          autoLearnEnabled: true,
        },
      },
    },
  });
  return { id: user.id, username: user.username };
}

export async function verifyLogin(username: string, password: string) {
  const u = username.trim().toLowerCase();
  const user = await prisma.bellaUser.findUnique({ where: { username: u } });
  if (!user) throw new Error('Invalid username or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid username or password');
  return { id: user.id, username: user.username };
}

export async function createSession(userId: string) {
  const secret = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(secret);
  const days = Math.max(1, Math.min(365, Number(process.env.BELLA_SESSION_DAYS || 30)));
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const session = await prisma.bellaSession.create({
    data: { userId, tokenHash, expiresAt },
  });
  return { cookieValue: `${session.id}.${secret}`, expiresAt, maxAgeMs: days * 86400_000 };
}

export async function resolveSessionFromCookie(cookieValue: string | undefined) {
  const parsed = parseSessionCookieValue(cookieValue);
  if (!parsed) return null;
  const rec = await prisma.bellaSession.findUnique({ where: { id: parsed.sessionId } });
  if (!rec || rec.expiresAt.getTime() < Date.now()) return null;
  const h = hashSessionToken(parsed.secret);
  if (h !== rec.tokenHash) return null;
  const user = await prisma.bellaUser.findUnique({ where: { id: rec.userId } });
  if (!user) return null;
  return { id: user.id, username: user.username };
}

export async function deleteSessionByCookie(cookieValue: string | undefined) {
  const parsed = parseSessionCookieValue(cookieValue);
  if (!parsed) return;
  await prisma.bellaSession.deleteMany({ where: { id: parsed.sessionId } });
}

export async function getUserSettings(userId: string) {
  const s = await prisma.bellaUserSettings.findUnique({ where: { userId } });
  return (
    s || {
      userId,
      companionMemoryEnabled: false,
      autoLearnEnabled: true,
    }
  );
}

export async function updateUserSettings(
  userId: string,
  patch: { companionMemoryEnabled?: boolean; autoLearnEnabled?: boolean }
) {
  return prisma.bellaUserSettings.upsert({
    where: { userId },
    create: {
      userId,
      companionMemoryEnabled:
        typeof patch.companionMemoryEnabled === 'boolean' ? patch.companionMemoryEnabled : false,
      autoLearnEnabled: typeof patch.autoLearnEnabled === 'boolean' ? patch.autoLearnEnabled : true,
    },
    update: {
      ...(typeof patch.companionMemoryEnabled === 'boolean'
        ? { companionMemoryEnabled: patch.companionMemoryEnabled }
        : {}),
      ...(typeof patch.autoLearnEnabled === 'boolean' ? { autoLearnEnabled: patch.autoLearnEnabled } : {}),
    },
  });
}

/** Ops: set BELLA_PASSWORD_RESET_TOKEN in env; send header X-Bella-Password-Reset: <token> */
export function assertPasswordResetToken(req: { headers: { [k: string]: string | string[] | undefined } }) {
  const expected = (process.env.BELLA_PASSWORD_RESET_TOKEN || '').trim();
  if (!expected) throw new Error('BELLA_PASSWORD_RESET_TOKEN not configured');
  const got = String(req.headers['x-bella-password-reset'] || '').trim();
  if (got !== expected) throw new Error('Invalid reset token');
}

export async function forceSetPassword(username: string, newPassword: string) {
  const u = username.trim().toLowerCase();
  if (newPassword.length < 6) throw new Error('Password at least 6 characters');
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const user = await prisma.bellaUser.update({ where: { username: u }, data: { passwordHash } });
  await prisma.bellaSession.deleteMany({ where: { userId: user.id } });
  return { id: user.id, username: user.username };
}
