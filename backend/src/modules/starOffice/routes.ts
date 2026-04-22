import express from 'express';
import { envLooksEnabled } from '../../lib/envBool';

const router = express.Router();

/** When true, `/api/star-office` is mounted and `/config` reports the module enabled. */
export function isStarOfficeModuleEnabled(): boolean {
  return envLooksEnabled('STAR_OFFICE_MODULE_ENABLED', false);
}
const DEFAULT_PANELS = ['memo', 'guest', 'status', 'assets', 'coords'] as const;
type Panel = (typeof DEFAULT_PANELS)[number];

function parsePanelsFromEnv(): Panel[] {
  const raw = (process.env.STAR_OFFICE_PANELS || '').trim();
  if (!raw) return [...DEFAULT_PANELS];
  const allowed = new Set<Panel>(DEFAULT_PANELS);
  const parsed = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is Panel => allowed.has(v as Panel));
  return parsed.length > 0 ? parsed : [...DEFAULT_PANELS];
}

/**
 * Star Office module config endpoint.
 * This creates a stable API surface so frontend no longer needs to
 * hardcode module metadata in multiple places.
 */
router.get('/config', (_req, res) => {
  const officeBaseUrl = (process.env.STAR_OFFICE_BASE_URL || 'http://127.0.0.1:19000').replace(/\/$/, '');
  const panels = parsePanelsFromEnv();
  res.json({
    module: 'starOffice',
    enabled: isStarOfficeModuleEnabled(),
    officeBaseUrl,
    embeddedPath: '/?embed=1',
    panels,
  });
});

router.get('/health', (_req, res) => {
  res.json({
    module: 'starOffice',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
