export type UrlIntent = 'extract_page_content' | 'search_web' | 'normal_chat';

export type UrlIntentDecision = {
  intent: UrlIntent;
  confidence: number;
  urls: string[];
  reasons: string[];
  extractScore: number;
  searchScore: number;
};

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const EXTRACT_HINTS = [
  '总结',
  '提炼',
  '概括',
  '翻译',
  '解读',
  '抓取',
  '抓正文',
  '正文',
  '全文',
  '文章',
  '网页内容',
  '转markdown',
  '转 markdown',
  'markdown',
  'md',
  '这篇讲了啥',
  '这篇说了什么',
];
const SEARCH_HINTS = [
  '搜一下',
  '查一下',
  '搜索',
  '帮我查',
  '找一下',
  '有哪些',
  '推荐',
  '最新',
  '新闻',
  '对比',
];

function hasAny(text: string, keys: string[]): boolean {
  return keys.some((k) => text.includes(k));
}

function isSearchPageUrl(url: string): boolean {
  const s = url.toLowerCase();
  return /\/search\b/.test(s) || /[?&]q=/.test(s);
}

function isArticleLikeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname || '';
    const segs = path.split('/').filter(Boolean);
    if (segs.length >= 2) return true;
    if (/\d{4}\/\d{1,2}\//.test(path)) return true;
    if (/[-_][a-z0-9]+/.test(path.toLowerCase())) return true;
    return false;
  } catch {
    return false;
  }
}

function isWeChatArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = (u.hostname || '').toLowerCase();
    return host === 'mp.weixin.qq.com' || host.endsWith('.weixin.qq.com');
  } catch {
    return false;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function classifyUrlIntent(textRaw: string): UrlIntentDecision {
  const text = (textRaw || '').trim();
  const lowered = text.toLowerCase();
  const urls = Array.from(new Set((text.match(URL_RE) || []).map((u) => u.trim())));
  const reasons: string[] = [];
  let extractScore = 0;
  let searchScore = 0;

  if (urls.length > 0) {
    extractScore += 2;
    reasons.push('contains_url');
  }
  const withoutUrls = text.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
  if (urls.length > 0 && withoutUrls.length < 20) {
    extractScore += 2;
    reasons.push('mostly_url_payload');
  }
  if (hasAny(lowered, EXTRACT_HINTS)) {
    extractScore += 2;
    reasons.push('extract_hint_word');
  }
  if (hasAny(lowered, SEARCH_HINTS)) {
    searchScore += 2;
    reasons.push('search_hint_word');
  }

  if (urls.some(isArticleLikeUrl)) {
    extractScore += 1;
    reasons.push('article_like_url');
  }
  if (urls.some(isWeChatArticleUrl)) {
    extractScore += 2;
    searchScore = Math.max(0, searchScore - 1);
    reasons.push('wechat_article_url');
  }
  if (urls.some(isSearchPageUrl)) {
    searchScore += 1;
    extractScore -= 1;
    reasons.push('search_page_url');
  }

  let intent: UrlIntent = 'normal_chat';
  if (extractScore >= 3 && extractScore > searchScore) {
    intent = 'extract_page_content';
  } else if (searchScore >= 2) {
    intent = 'search_web';
  }

  let confidence = 0.35;
  if (intent === 'extract_page_content') {
    confidence = clamp01(0.55 + 0.08 * extractScore - 0.05 * Math.max(0, searchScore - 1));
  } else if (intent === 'search_web') {
    confidence = clamp01(0.55 + 0.08 * searchScore);
  }

  return { intent, confidence, urls, reasons, extractScore, searchScore };
}
