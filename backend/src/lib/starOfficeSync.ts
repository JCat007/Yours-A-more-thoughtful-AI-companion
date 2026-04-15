import axios from 'axios';
import { envLooksEnabled } from './envBool';

export type StarOfficeState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';

const STAR_OFFICE_BASE_URL = (process.env.STAR_OFFICE_BASE_URL || 'http://127.0.0.1:19000').replace(/\/$/, '');
/** Default off: avoid best-effort POSTs to 127.0.0.1:19000 when star-office-ui is absent. */
const STAR_OFFICE_SYNC_ENABLED = envLooksEnabled('STAR_OFFICE_SYNC_ENABLED', false);
const MIN_INTERVAL_MS = Number(process.env.STAR_OFFICE_SYNC_MIN_INTERVAL_MS || 1000);

let lastPushAt = 0;
let lastState: StarOfficeState | null = null;

export async function syncStarOfficeState(args: { state: StarOfficeState; detail?: string }) {
  if (!STAR_OFFICE_SYNC_ENABLED) return;

  const now = Date.now();
  // Throttle identical states (concurrent stage updates).
  if (lastState === args.state && now - lastPushAt < MIN_INTERVAL_MS) return;

  lastState = args.state;
  lastPushAt = now;

  try {
    await axios.post(
      `${STAR_OFFICE_BASE_URL}/set_state`,
      { state: args.state, detail: args.detail || '' },
      {
        timeout: 1500,
        // Avoid log spam on flaky networks; sync is best-effort only.
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );
  } catch {
    // best-effort: failures must not break the chat pipeline
  }
}

export function normalizeBellaStageToStarOfficeState(stage: string): StarOfficeState {
  const s = (stage || '').trim().toLowerCase();
  // Map Bella job stages to Star Office rendering lane (writing feels most intuitive).
  if (['preparing_inputs', 'running_openclaw', 'collecting_outputs', 'generating_final_reply'].includes(s)) return 'writing';
  if (s === 'failed') return 'error';
  if (s === 'cancelled') return 'idle';
  if (s === 'succeeded') return 'idle';
  return 'idle';
}

export function normalizeStateDetailForBellaStage(stage: string, detail?: string): string {
  const s = (stage || '').trim().toLowerCase();
  if (s === 'failed') return detail || '出错了';
  if (s === 'cancelled') return '待命中（已取消）';
  if (s === 'succeeded') return '待命中';
  if (s === 'preparing_inputs') return '进入准备阶段';
  if (s === 'running_openclaw') return '我在工作中';
  if (s === 'collecting_outputs') return '我在整理输出';
  if (s === 'generating_final_reply') return '我在生成最终回复';
  return detail || '待命中';
}

