import { buildDefaultCompanionPreferencesMarkdown } from '../lib/companionPreferencesTemplate';
import { getUserSettings } from './authService';
import { gbrainGet, gbrainPut, gbrainTimelineAdd, isGbrainEnabled } from './gbrainCli';

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

export function isExplicitRememberRequest(text: string): boolean {
  return /(记住|别忘了|请记下|以后都|记下来|请记得|帮我记|替我记|记一下|存一下|把我的|记着我的|from\s+now\s+on|remember\s+that|don['']t\s+forget|please\s+remember)/i.test(
    text,
  );
}

/** Self-introduction / identity facts the user states plainly (no "记住" needed). */
function isIdentityOrProfileHint(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) return false;
  if (/(我叫什么|你叫什么|叫什么|是谁|什么时候|哪天)/.test(t)) return false;
  return /(我叫(?!(?:什么|谁))\s*\S|我的名字(?:是|[:：])\s*\S|叫我(?!(?:什么))\s*\S|称呼我(?:为|[:：])\s*\S|昵称(?:是|[:：])\s*\S|英文名(?:是|[:：])\s*\S|中文名(?:是|[:：])\s*\S|生日(?:是|[:：])\s*(?!什么|哪天|何时)\S|出生日期(?:是|[:：]|为)\s*\S|生于\d|my\s+name\s+is\b|call\s+me\b|i\s*'?\s*m\s+\w)/i.test(
    t,
  );
}

export function isAutoPreferenceHint(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 500) return false;
  if (isIdentityOrProfileHint(t)) return true;
  if (t.length < 6) return false;
  return /(喜欢|不喜欢|讨厌|习惯|偏好|别叫我|不要|prefer|hate|love|can['']t\s+stand|always\s+use)/i.test(t);
}

async function ensureCompanionPreferencesPage(userId: string): Promise<string> {
  const slug = `companion/${userId}/preferences`;
  const existing = await gbrainGet(slug);
  if (existing) return slug;
  const ok = await gbrainPut(slug, buildDefaultCompanionPreferencesMarkdown(), { skipOpenAiEmbed: true });
  return ok ? slug : slug;
}

/** gbrain `timeline-add` does not change the page body returned by `gbrain get`; mirror one line for /bella/memory. */
function oneLineForMarkdown(s: string): string {
  return s.replace(/\r\n/g, '\n').trim().replace(/\s*\n\s*/g, ' ');
}

async function mirrorTimelineLineIntoPreferencesMarkdown(
  slug: string,
  isoDate: string,
  line: string,
): Promise<void> {
  const bullet = `- **${isoDate}:** ${oneLineForMarkdown(line)}`;
  let md = (await gbrainGet(slug))?.trimEnd() || '';
  if (!md) md = buildDefaultCompanionPreferencesMarkdown().trimEnd();
  if (md.includes(bullet)) return;
  const next = `${md}\n\n${bullet}\n`;
  const putOk = await gbrainPut(slug, next, { skipOpenAiEmbed: true });
  if (!putOk) {
    console.warn('[companion-memory] gbrain put (mirror timeline to page) failed', slug);
  } else {
    console.info('[companion-memory] mirrored line into preferences page slug=%s len=%s', slug, String(next.length));
  }
}

export type CompanionMemoryTurn = {
  userId: string;
  userText: string;
  assistantText: string;
};

/**
 * Non-blocking: schedules background gbrain writes (never awaited from chat request path).
 */
export function scheduleCompanionMemoryAfterTurn(turn: CompanionMemoryTurn): void {
  setImmediate(() => {
    void runCompanionMemoryTurn(turn).catch((e) => console.error('[companion-memory]', e));
  });
}

async function runCompanionMemoryTurn(turn: CompanionMemoryTurn): Promise<void> {
  const { userId, userText, assistantText } = turn;
  if (!isGbrainEnabled()) {
    console.info('[companion-memory] skip: GBRAIN_ENABLED is off');
    return;
  }
  const settings = await getUserSettings(userId);
  if (!settings.companionMemoryEnabled) {
    console.info('[companion-memory] skip: companionMemoryEnabled=false userId=%s', userId);
    return;
  }

  const explicit = isExplicitRememberRequest(userText);
  const auto = settings.autoLearnEnabled && isAutoPreferenceHint(userText);
  if (!explicit && !auto) return;

  console.info('[companion-memory] write start userId=%s explicit=%s auto=%s', userId, explicit, auto);
  const slug = await ensureCompanionPreferencesPage(userId);
  const date = new Date().toISOString().slice(0, 10);
  const line = explicit
    ? `User (explicit remember): ${truncate(userText, 420)}`
    : `User (auto-learn hint): ${truncate(userText, 280)} | Assistant: ${truncate(assistantText, 160)}`;
  const timelineOk = await gbrainTimelineAdd(slug, date, line);
  if (!timelineOk) {
    console.warn('[companion-memory] gbrain timeline-add failed', slug);
    return;
  }
  await mirrorTimelineLineIntoPreferencesMarkdown(slug, date, line);
  console.info('[companion-memory] ok slug=%s date=%s explicit=%s', slug, date, explicit);
}
