import { gbrainQuery, gbrainSearch, isGbrainEnabled } from './gbrainCli';

export type CompanionBrainSnippet = { text: string; ms: number; hits: number };

function filterByUserPrefix(raw: string, userId: string): string {
  const needle = `companion/${userId}/`;
  const lines = raw.split('\n');
  const kept = lines.filter((l) => l.includes(needle));
  const out = kept.length > 0 ? kept.join('\n') : raw;
  return out.trim();
}

/** `gbrain query` stdout when nothing matched or hybrid path failed to surface this user's pages. */
function queryOutputNeedsKeywordFallback(raw: string, userId: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  const head = t.split('\n')[0]?.trim().toLowerCase() ?? '';
  if (head.startsWith('no results')) return true;
  const needle = `companion/${userId}/`;
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return true;
  return !lines.some((l) => l.includes(needle));
}

/**
 * Read-only retrieval for Bella persona injection.
 * - **china:** always `gbrain search` (keyword / tsvector on your DB). Never calls `gbrain query` (no hybrid / expansion LLM in that path).
 * - **world:** tries `gbrain query` first unless `GBRAIN_USE_QUERY_WORLD=0`; falls back to `gbrain search` when query is empty, “no results”, or no lines mention `companion/<userId>/`.
 */
export async function retrieveCompanionBrainContext(args: {
  userId: string;
  mode: 'china' | 'world';
  userMessage: string;
}): Promise<CompanionBrainSnippet | null> {
  if (!isGbrainEnabled()) return null;
  const started = Date.now();
  const { userId, mode, userMessage } = args;
  const prefix = `companion/${userId}`;
  const q = `${userMessage}`.trim().slice(0, 600);
  const searchLine = `${prefix} ${q}`;
  const scopedQuestion = `In brain pages under slug prefix "${prefix}/", what preferences or style notes apply? User said: ${q}`;
  const worldQueryEnabled = String(process.env.GBRAIN_USE_QUERY_WORLD || '1').trim() !== '0';

  try {
    let raw = '';
    if (mode === 'china') {
      raw = await gbrainSearch(searchLine);
    } else {
      if (worldQueryEnabled) {
        raw = await gbrainQuery(scopedQuestion);
        if (queryOutputNeedsKeywordFallback(raw, userId)) {
          raw = await gbrainSearch(searchLine);
        }
      } else {
        raw = await gbrainSearch(searchLine);
      }
    }
    const filtered = filterByUserPrefix(raw, userId);
    const text = filtered.slice(0, 3500);
    const ms = Date.now() - started;
    if (!text) return { text: '', ms, hits: 0 };
    const hits = (text.match(new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return { text, ms, hits: hits || 1 };
  } catch (e) {
    console.warn('[companion-brain]', (e as Error)?.message || e);
    return null;
  }
}
