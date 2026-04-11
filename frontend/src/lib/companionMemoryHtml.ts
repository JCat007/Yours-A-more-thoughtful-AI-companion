import { marked } from 'marked';
import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';

marked.setOptions({ gfm: true, breaks: true });

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

let turndownSingleton: TurndownService | null = null;

function applyGfm(td: TurndownService): void {
  const ns = turndownPluginGfm as unknown as Record<string, unknown>;
  const fromNs = typeof ns.gfm === 'function' ? (ns.gfm as (s: TurndownService) => void) : null;
  const def = ns.default && typeof ns.default === 'object' ? (ns.default as Record<string, unknown>) : null;
  const fromDef =
    def && typeof def.gfm === 'function' ? (def.gfm as (s: TurndownService) => void) : null;
  const gfm = fromNs ?? fromDef;
  if (gfm) td.use(gfm);
}

function getTurndown(): TurndownService {
  if (!turndownSingleton) {
    turndownSingleton = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    applyGfm(turndownSingleton);
  }
  return turndownSingleton;
}

/** Convert edited rich HTML back to markdown for gbrain storage. */
export function htmlToMarkdown(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  return getTurndown().turndown(trimmed);
}
