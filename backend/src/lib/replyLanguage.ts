/**
 * Reply language for Bella: driven by user text, then conversation history, then UI locale.
 * Region mode (china/world) must not decide reply language — only tool reachability.
 */

export type ReplyLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'ru';

export type ReplyLanguageSource = 'explicit' | 'auto' | 'history_auto' | 'ui_locale' | 'default_en';

const UI_LOCALES = new Set(['zh', 'en', 'ja', 'ko', 'ru']);

export function normalizeUiLocale(v: unknown): ReplyLanguage | null {
  const s = String(v || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s.startsWith('zh')) return 'zh';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('ja')) return 'ja';
  if (s.startsWith('ko')) return 'ko';
  if (s.startsWith('ru')) return 'ru';
  if (UI_LOCALES.has(s)) return s as ReplyLanguage;
  return null;
}

function explicitFromText(text: string): ReplyLanguage | null {
  const s = text.toLowerCase();
  if (/请用中文|用中文回复|中文回答|说中文/.test(text) || /respond in chinese|reply in chinese|use chinese/.test(s)) {
    return 'zh';
  }
  if (/请用英文|用英文回复|英文回答|说英文/.test(text) || /respond in english|reply in english|use english/.test(s)) {
    return 'en';
  }
  if (/日本語|日语|日文/.test(text) || /respond in japanese|reply in japanese|use japanese/.test(s)) {
    return 'ja';
  }
  if (/한국어|韩语|韓語/.test(text) || /respond in korean|reply in korean|use korean/.test(s)) {
    return 'ko';
  }
  if (/русский|俄语|俄文/.test(text) || /respond in russian|reply in russian|use russian/.test(s)) {
    return 'ru';
  }
  return null;
}

/** Script / alphabet detection when the user did not give an explicit language instruction. */
export function autoLanguageFromText(text: string): ReplyLanguage | null {
  const t = (text || '').trim();
  if (!t) return null;
  if (/[\u3040-\u30ff]/.test(t)) return 'ja';
  if (/[\uac00-\ud7af]/.test(t)) return 'ko';
  if (/[\u0400-\u04ff]/.test(t)) return 'ru';
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  if (cjk > 0 && latin === 0) return 'zh';
  if (cjk > 0 && latin > 0) {
    return cjk >= latin ? 'zh' : 'en';
  }
  if (/[\u4e00-\u9fff]/.test(t)) return 'zh';
  if (/[a-zA-Z]/.test(t)) return 'en';
  return null;
}

/** Strip client-appended file list blocks so language detection uses only the user's words. */
export function stripClientFileUploadHint(text: string): string {
  const markers = ['\n\n[已上传文件]', '\n\n[Uploaded files]'];
  let t = text;
  for (const m of markers) {
    const i = t.indexOf(m);
    if (i >= 0) t = t.slice(0, i);
  }
  return t.trim();
}

export type InferReplyLanguageArgs = {
  userText: string;
  /** From frontend UI language (e.g. LanguageContext `lang`). */
  uiLocale?: unknown;
  /** Recent user contents oldest→newest or newest→newest; we scan from newest. */
  recentUserTexts?: string[];
};

export function inferReplyLanguage(args: InferReplyLanguageArgs): { lang: ReplyLanguage; source: ReplyLanguageSource } {
  const text = stripClientFileUploadHint(args.userText || '');
  const explicit = explicitFromText(text);
  if (explicit) return { lang: explicit, source: 'explicit' };

  const fromMessage = autoLanguageFromText(text);
  if (fromMessage) return { lang: fromMessage, source: 'auto' };

  const recent = args.recentUserTexts || [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const chunk = stripClientFileUploadHint((recent[i] || '').trim());
    if (!chunk) continue;
    const ex = explicitFromText(chunk);
    if (ex) return { lang: ex, source: 'history_auto' };
    const au = autoLanguageFromText(chunk);
    if (au) return { lang: au, source: 'history_auto' };
  }

  const ui = normalizeUiLocale(args.uiLocale);
  if (ui) return { lang: ui, source: 'ui_locale' };

  return { lang: 'en', source: 'default_en' };
}

export function buildReplyLanguageSystemMessage(lang: ReplyLanguage): string {
  if (lang === 'zh') {
    return [
      '【回复语言策略】',
      '本轮使用与用户输入一致的语言回复（用户用中文写就用中文答）。',
      '若用户明确要求改用其他语言，再切换。',
      '代码、URL、命令保持原文，不要翻译标识符。',
    ].join('\n');
  }
  const label =
    lang === 'en'
      ? 'English'
      : lang === 'ja'
        ? 'Japanese (日本語)'
        : lang === 'ko'
          ? 'Korean (한국어)'
          : 'Russian (Русский)';
  return [
    '[Reply language]',
    `Reply in ${label}, matching the language the user is writing in when possible.`,
    'If the user explicitly asks to switch language, follow that instruction.',
    'Keep code, URLs, and shell commands verbatim; do not translate identifiers.',
  ].join('\n');
}
