import { generateBellaOuterReply } from './bellaOuterLlm';

export async function composeBellaFinalReply(args: {
  mode: 'china' | 'world';
  replyLanguage?: 'zh' | 'en' | 'ja' | 'ko' | 'ru';
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  executorReply?: string;
  downloadsCount?: number;
  hasImage?: boolean;
  hasVideo?: boolean;
  /** Injected gbrain snippets (companion memory) when enabled. */
  companionContext?: string;
}) {
  const {
    mode,
    replyLanguage,
    userMessage,
    history,
    executorReply,
    downloadsCount = 0,
    hasImage = false,
    hasVideo = false,
    companionContext,
  } = args;
  const artifactsHint = [
    hasImage ? '本轮有图片产物。' : '',
    hasVideo ? '本轮有视频产物。' : '',
    downloadsCount > 0 ? `本轮有 ${downloadsCount} 个可下载文件产物。` : '',
  ].filter(Boolean).join(' ');
  try {
    const out = await generateBellaOuterReply({
      mode,
      replyLanguage,
      userMessage,
      history,
      executorReply,
      artifactsHint,
      companionContext,
    });
    if (out) return out;
  } catch {
    // fall through to deterministic fallback
  }

  if (executorReply) return executorReply;
  const lang = replyLanguage || 'en';
  if (lang === 'zh') return '好呀～我先按你的要求处理，结果马上发你。';
  if (lang === 'en') return 'Sure, I got it. I will handle it and send the result right away.';
  if (lang === 'ja') return '了解しました。すぐに処理して結果をお送りします。';
  if (lang === 'ko') return '알겠어요. 바로 처리해서 결과를 보내드릴게요.';
  return 'Хорошо, сейчас обработаю и пришлю результат.';
}
