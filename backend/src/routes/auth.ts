import express from 'express';
import { buildDefaultCompanionPreferencesMarkdown } from '../lib/companionPreferencesTemplate';
import { requireAssistantApiKey } from '../middleware/assistantSecurity';
import { clearBellaSessionCookie, getBellaSessionCookie, setBellaSessionCookie } from '../lib/cookies';
import { gbrainGet, gbrainPut, isGbrainEnabled } from '../services/gbrainCli';
import * as auth from '../services/authService';

const router = express.Router();
router.use(requireAssistantApiKey);

router.post('/register', async (req, res) => {
  try {
    const n = await auth.countUsers();
    const allow = (process.env.BELLA_ALLOW_REGISTER || '').trim() === '1' || n === 0;
    if (!allow) {
      return res.status(403).json({
        error: 'Registration disabled. Set BELLA_ALLOW_REGISTER=1 or create the first account when the user table is empty.',
      });
    }
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const u = await auth.registerUser(username, password);
    const sess = await auth.createSession(u.id);
    setBellaSessionCookie(res, sess.cookieValue, sess.maxAgeMs);
    const settings = await auth.getUserSettings(u.id);
    res.json({ user: u, settings });
  } catch (e: any) {
    const code = e?.code;
    if (code === 'P2002') return res.status(409).json({ error: 'Username already taken' });
    res.status(400).json({ error: e?.message || 'register failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const u = await auth.verifyLogin(username, password);
    const sess = await auth.createSession(u.id);
    setBellaSessionCookie(res, sess.cookieValue, sess.maxAgeMs);
    const settings = await auth.getUserSettings(u.id);
    res.json({ user: u, settings });
  } catch (e: any) {
    res.status(401).json({ error: e?.message || 'login failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await auth.deleteSessionByCookie(getBellaSessionCookie(req));
  } catch {
    // ignore
  }
  clearBellaSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  try {
    const raw = getBellaSessionCookie(req);
    const user = raw ? await auth.resolveSessionFromCookie(raw) : null;
    if (!user) return res.json({ user: null, settings: null });
    const settings = await auth.getUserSettings(user.id);
    res.json({ user, settings });
  } catch (e: any) {
    res.status(503).json({ error: e?.message || 'database unavailable' });
  }
});

router.patch('/me/settings', async (req, res) => {
  try {
    const raw = getBellaSessionCookie(req);
    const user = raw ? await auth.resolveSessionFromCookie(raw) : null;
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    const body = req.body as { companionMemoryEnabled?: boolean; autoLearnEnabled?: boolean };
    const settings = await auth.updateUserSettings(user.id, {
      ...(typeof body.companionMemoryEnabled === 'boolean'
        ? { companionMemoryEnabled: body.companionMemoryEnabled }
        : {}),
      ...(typeof body.autoLearnEnabled === 'boolean' ? { autoLearnEnabled: body.autoLearnEnabled } : {}),
    });
    res.json({ user, settings });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'update failed' });
  }
});

/** Raw gbrain page for signed-in user (slug companion/<id>/preferences). */
router.get('/companion-preferences', async (req, res) => {
  try {
    const raw = getBellaSessionCookie(req);
    const user = raw ? await auth.resolveSessionFromCookie(raw) : null;
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    if (!isGbrainEnabled()) {
      return res.status(503).json({
        code: 'GBRAIN_DISABLED',
        error:
          'gbrain is not enabled. Set GBRAIN_ENABLED=1 in backend/.env, install the gbrain CLI, and run gbrain init with the same DATABASE_URL.',
      });
    }
    const slug = `companion/${user.id}/preferences`;
    let markdown = await gbrainGet(slug);
    if (!markdown) markdown = buildDefaultCompanionPreferencesMarkdown();
    res.json({ slug, markdown });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'read failed' });
  }
});

router.put('/companion-preferences', async (req, res) => {
  try {
    const raw = getBellaSessionCookie(req);
    const user = raw ? await auth.resolveSessionFromCookie(raw) : null;
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    if (!isGbrainEnabled()) {
      return res.status(503).json({
        code: 'GBRAIN_DISABLED',
        error:
          'gbrain is not enabled. Set GBRAIN_ENABLED=1 in backend/.env, install the gbrain CLI, and run gbrain init with the same DATABASE_URL.',
      });
    }
    const body = req.body as { markdown?: string };
    if (typeof body.markdown !== 'string') return res.status(400).json({ error: 'markdown (string) required' });
    const slug = `companion/${user.id}/preferences`;
    const ok = await gbrainPut(slug, body.markdown);
    if (!ok) {
      return res.status(502).json({
        code: 'GBRAIN_PUT_FAILED',
        error: 'gbrain put failed; check server logs for [gbrain] and verify CLI + database config.',
      });
    }
    res.json({ ok: true, slug });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'save failed' });
  }
});

/** Ops-only: requires `BELLA_PASSWORD_RESET_TOKEN` and header `X-Bella-Password-Reset`. */
router.post('/ops/reset-password', async (req, res) => {
  try {
    auth.assertPasswordResetToken(req);
    const { username, newPassword } = req.body as { username?: string; newPassword?: string };
    if (!username || !newPassword) return res.status(400).json({ error: 'username and newPassword required' });
    await auth.forceSetPassword(username, newPassword);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'reset failed' });
  }
});

export default router;
