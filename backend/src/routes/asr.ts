import express from 'express';
import { assistantRateLimit, requireAssistantApiKey } from '../middleware/assistantSecurity';
import { generateIfltekWsUrl } from './ifly';

const router = express.Router();

type BellaMode = 'china' | 'world';

function normalizeMode(input: unknown): BellaMode {
  const s = String(input || '').toLowerCase().trim();
  return s === 'world' ? 'world' : 'china';
}

router.use(requireAssistantApiKey);
router.use(assistantRateLimit);

/**
 * POST /api/asr/rtasr-url
 * - china: iFlytek realtime ASR
 * - world: Gemini path is still a stub; without GEMINI_API_KEY we fall back to iFly
 *
 * Response: `{ wsUrl }` for the browser to stream audio to iFlytek.
 */
router.post('/rtasr-url', (req, res) => {
  try {
    const mode = normalizeMode((req.body as any)?.mode);
    const uuid = typeof (req.body as any)?.uuid === 'string' ? (req.body as any).uuid : undefined;

    if (mode === 'china') {
      const result = generateIfltekWsUrl(uuid);
      res.json({ wsUrl: result.wsUrl, uuid: result.uuid, provider: 'ifly' });
      return;
    }

    // world mode: prefer Gemini when configured, but fall back to iFly without a key.
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    // Speech→Gemini ASR is not implemented yet, so always fall back to iFly to avoid 501s during voice debugging.
    if (!geminiKey) {
      const result = generateIfltekWsUrl(uuid);
      res.json({ wsUrl: result.wsUrl, uuid: result.uuid, provider: 'ifly_fallback_no_gemini_key' });
      return;
    }

    const result = generateIfltekWsUrl(uuid);
    res.json({
      wsUrl: result.wsUrl,
      uuid: result.uuid,
      provider: 'ifly_fallback_gemini_configured_voice_not_implemented',
    });
    return;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[asr] rtasr-url error:', e?.message || String(e));
    res.status(500).json({ error: e?.message || String(e) });
  }
});

export default router;

