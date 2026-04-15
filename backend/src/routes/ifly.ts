import express from 'express';
import crypto from 'crypto';
import { assistantRateLimit, requireAssistantApiKey } from '../middleware/assistantSecurity';

const router = express.Router();

const IFlyWsBaseUrl = 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1';

function urlencode(v: string): string {
  return encodeURIComponent(v);
}

/**
 * Build the UTC string iFlytek examples expect (`...+0800`).
 * Signature validation is sensitive to this exact formatting.
 */
function formatUtcPlus0800(d: Date): string {
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const HH = String(t.getUTCHours()).padStart(2, '0');
  const MM = String(t.getUTCMinutes()).padStart(2, '0');
  const SS = String(t.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}+0800`;
}

function buildSignature(paramsWithoutSignature: Record<string, string>, apiSecret: string): string {
  const keys = Object.keys(paramsWithoutSignature).sort();
  const baseString = keys.map((k) => `${urlencode(k)}=${urlencode(paramsWithoutSignature[k])}`).join('&');
  return crypto.createHmac('sha1', apiSecret).update(baseString).digest('base64');
}

// Public deploy: apply auth/rate limits on real routes (not on pre-signature helpers).
router.use(requireAssistantApiKey);
router.use(assistantRateLimit);

export function generateIfltekWsUrl(uuid?: string): { wsUrl: string; uuid: string } {
  const appId = (process.env.IFLY_APP_ID || '').trim();
  const accessKeyId = (process.env.IFLY_ACCESS_KEY_ID || '').trim();
  const apiSecret = (process.env.IFLY_API_SECRET || '').trim();

  if (!appId || !accessKeyId || !apiSecret) {
    throw new Error('iFlytek is not configured: set IFLY_APP_ID, IFLY_ACCESS_KEY_ID, and IFLY_API_SECRET');
  }

  const finalUuid =
    typeof uuid === 'string' && uuid.trim()
      ? uuid.trim()
      : crypto.randomUUID();
  const utc = formatUtcPlus0800(new Date());

  // iFlytek handshake expects these fields per vendor docs.
  const paramsWithoutSignature: Record<string, string> = {
    appId,
    accessKeyId,
    uuid: finalUuid,
    utc,
    audio_encode: 'pcm_s16le',
    lang: 'autodialect',
    samplerate: '16000',
  };

  const signature = buildSignature(paramsWithoutSignature, apiSecret);

  const allParams: Record<string, string> = { ...paramsWithoutSignature, signature };
  const query = Object.entries(allParams)
    .map(([k, v]) => `${urlencode(k)}=${urlencode(v)}`)
    .join('&');
  const wsUrl = `${IFlyWsBaseUrl}?${query}`;

  return { wsUrl, uuid: finalUuid };
}

router.post('/rtasr-url', (req, res) => {
  try {
    const uuid = typeof (req.body as any)?.uuid === 'string' ? (req.body as any).uuid : undefined;
    const result = generateIfltekWsUrl(uuid);
    res.json(result);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[ifly] rtasr-url error:', e?.message || String(e));
    res.status(500).json({ error: e?.message || String(e) });
  }
});

export default router;

