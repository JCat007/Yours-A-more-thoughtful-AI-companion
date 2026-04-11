export type BellaIntent = 'chat_only' | 'image_request' | 'task_request';

const IMAGE_KEYS = ['自拍', '发图', '发张', '看看你', '照片', 'photo', 'selfie', 'picture'];
const TASK_KEYS = ['总结', '文档', 'pdf', 'ppt', 'word', 'excel', '查', '搜索', '提醒', '整理', '导出'];
const AMBIGUOUS_IMAGE_KEYS = ['来一张', '来个', '开始吧'];

export function detectBellaIntent(
  input: string,
  recentUserTexts: string[] = [],
  lastIntent?: BellaIntent
): BellaIntent {
  const text = (input || '').toLowerCase();
  const history = recentUserTexts.join(' ').toLowerCase();
  if (AMBIGUOUS_IMAGE_KEYS.some((k) => text.includes(k)) && (lastIntent === 'image_request' || IMAGE_KEYS.some((k) => history.includes(k)))) {
    return 'image_request';
  }
  if (IMAGE_KEYS.some((k) => text.includes(k) || history.includes(k))) return 'image_request';
  if (TASK_KEYS.some((k) => text.includes(k))) return 'task_request';
  return 'chat_only';
}
