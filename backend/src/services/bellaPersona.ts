import fs from 'fs';
import path from 'path';

let cachedSoul = '';

/** Repo `docs/templates/Bella-SOUL.md` (works from `src/` or compiled `dist/`). */
function getSoulFilePath(): string {
  return path.join(__dirname, '../../../docs/templates/Bella-SOUL.md');
}

export function loadSoulText(): string {
  if (cachedSoul) return cachedSoul;
  const soulPath = getSoulFilePath();
  try {
    cachedSoul = fs.readFileSync(soulPath, 'utf-8');
  } catch {
    cachedSoul =
      'You are Bella, a warm AI companion. Stay playful and natural; avoid corporate tone. ' +
      'Name and deeper traits live in Bella-SOUL.md when that file is available.';
  }
  return cachedSoul;
}

function buildReplyLanguageInstruction(replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru'): string {
  const langLabel =
    replyLanguage === 'zh'
      ? '中文'
      : replyLanguage === 'en'
        ? 'English'
        : replyLanguage === 'ja'
          ? '日本語'
          : replyLanguage === 'ko'
            ? '한국어'
            : replyLanguage === 'ru'
              ? 'Русский'
              : null;
  if (!langLabel) return '';
  return `Prefer replying in ${langLabel} unless the user clearly switches language.`;
}

/**
 * Single-pass chat (non–OpenClaw gateway): same [SOUL] as the persona layer, without executor wording.
 * Name, tone, and rules are edited only in Bella-SOUL.md.
 */
export function buildBellaDirectChatSystemPrompt(
  mode: 'china' | 'world',
  replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru',
  sceneHint?: string
): string {
  const soul = loadSoulText();
  const langLine = buildReplyLanguageInstruction(replyLanguage);
  const lines = [
    'You are Bella in a single chat completion. Obey [SOUL] for identity, tone, media behavior, and boundaries.',
    'Write the reply the user sees. Avoid corporate / customer-service phrasing.',
    `Deployment mode: ${mode === 'china' ? 'China' : 'World'}.`,
    langLine,
    '',
    '[SOUL]',
    soul,
  ].filter(Boolean);
  if (sceneHint?.trim()) {
    lines.push(
      '',
      `When the user asks what you are doing right now, answer in one short in-character line (per [SOUL]) that you are busy with: ${sceneHint.trim()}.`,
      'Do not claim a real camera or phone; media still comes from the backend pipeline described in [SOUL].'
    );
  }
  return lines.join('\n');
}

export function buildBellaPersonaSystemPrompt(
  mode: 'china' | 'world',
  replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru'
) {
  const soul = loadSoulText();
  const langLine = buildReplyLanguageInstruction(replyLanguage);
  return [
    'You are the outer persona layer: you produce the final user-visible Bella reply.',
    'If an executor reply is provided, do not paste it verbatim—rephrase in Bella’s voice per [SOUL].',
    'Avoid corporate tone (e.g. “your request has been completed”).',
    'If the executor failed, comfort the user briefly, then suggest a practical next step.',
    `Deployment mode: ${mode === 'china' ? 'China (outer provider default: Doubao)' : 'World (outer provider default: Gemini)'}.`,
    langLine,
    '',
    '[SOUL]',
    soul,
  ]
    .filter(Boolean)
    .join('\n');
}
