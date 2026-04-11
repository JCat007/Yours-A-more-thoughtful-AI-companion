import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Language = 'zh' | 'en';

type TextKey =
  | 'siteTitle'
  | 'siteSubtitle'
  | 'globalHot'
  | 'hottestByComments'
  | 'latestAiComments'
  | 'manualFetch'
  | 'autoRefreshing'
  | 'loading'
  | 'noHotspots'
  | 'comments'
  | 'backToHome'
  | 'aiThinking'
  | 'noCommentsYet'
  | 'postComment'
  | 'posting'
  | 'nicknamePlaceholder'
  | 'commentPlaceholder'
  | 'recentAiCommentEmpty'
  | 'mostCommentedHint'
  | 'currentLabel'
  | 'today'
  | 'yesterday'
  | 'useLocalTzLabel'
  | 'latestCountLabel'
  | 'assistantTitle'
  | 'assistantSubtitle'
  | 'assistantGreet1'
  | 'assistantGreet2'
  | 'assistantGreet3'
  | 'send'
  | 'inputPlaceholder'
  | 'openVideo'
  | 'imageFromAssistant'
  | 'errorPrefix'
  | 'loadingDetail'
  | 'topicNotFound'
  | 'contentLoading'
  | 'viewOriginal'
  | 'triggerAi'
  | 'cancelReply'
  | 'reply'
  | 'replyPlaceholder'
  | 'postReply'
  | 'cancel'
  | 'postCommentFailed'
  | 'replyFailed'
  | 'aiCommentFailed'
  | 'guestName'
  | 'chatModeLabel'
  | 'chatModeNormal'
  | 'chatModeVoice'
  | 'chatModeVoiceHint'
  | 'transcribing'
  | 'stopRecording'
  | 'voiceInput'
  | 'loadError'
  | 'loadErrorHint';

const texts: Record<Language, Record<TextKey, string>> = {
  zh: {
    siteTitle: '',
    siteSubtitle: '',
    globalHot: '全网最火',
    hottestByComments: '评论最火',
    latestAiComments: '最新 AI 评论',
    manualFetch: '手动刷新热点',
    autoRefreshing: '正在自动刷新最新热点...',
    loading: '正在加载最新热点...',
    noHotspots: '暂时没有可展示的热点，请稍后再试。',
    comments: '评论',
    backToHome: '返回首页',
    aiThinking: '🤖 AI 正在思考...',
    noCommentsYet: '暂无评论，快来发表第一条吧！',
    postComment: '发表评论',
    posting: '发表中...',
    nicknamePlaceholder: '你的昵称（可选）',
    commentPlaceholder: '写下你的想法...',
    recentAiCommentEmpty: '暂时还没有 AI 评论。',
    mostCommentedHint: '按评论数量排序',
    currentLabel: '当前：',
    today: '今天',
    yesterday: '昨天',
    useLocalTzLabel: '按本地时区显示日期',
    latestCountLabel: '共 {{n}} 条最新热点',
    assistantTitle: 'Bella',
    assistantSubtitle: 'AI 女友秘书 · 陪你聊天和办事',
    assistantGreet1: '嗨，我是 Bella～',
    assistantGreet2: '你可以让我聊天、处理文档、生成内容，或者随便聊聊。',
    assistantGreet3: '说「发张自拍」「看看你」我会给你发图或视频哦～',
    send: '发送',
    inputPlaceholder: '输入消息...',
    openVideo: '打开视频',
    imageFromAssistant: 'Bella 发的图',
    errorPrefix: '出错了：',
    loadingDetail: '加载中...',
    topicNotFound: '热点不存在',
    contentLoading: '正文加载中...',
    viewOriginal: '查看原文 →',
    triggerAi: '让 AI 来聊聊',
    cancelReply: '取消回复',
    reply: '回复',
    replyPlaceholder: '写下你的回复...',
    postReply: '发表回复',
    cancel: '取消',
    postCommentFailed: '发表评论失败，请稍后重试',
    replyFailed: '回复失败，请稍后重试',
    aiCommentFailed: '触发 AI 评论失败，请稍后重试',
    guestName: '访客',
    chatModeLabel: '对话模式：',
    chatModeNormal: '普通对话',
    chatModeVoice: '自由交流',
    chatModeVoiceHint: '（Bella 会朗读回复）',
    transcribing: '转录中...',
    stopRecording: '停止录音',
    voiceInput: '语音输入 (Whisper 本地)',
    loadError: '加载出错',
    loadErrorHint: '请查看浏览器控制台 (F12) 获取完整报错',
  },
  en: {
    siteTitle: '',
    siteSubtitle: '',
    globalHot: 'Global Trending',
    hottestByComments: 'Most Commented',
    latestAiComments: 'Latest AI Comments',
    manualFetch: 'Refresh',
    autoRefreshing: 'Auto-refreshing latest hotspots...',
    loading: 'Loading latest hotspots...',
    noHotspots: 'No hotspots available yet, please try again later.',
    comments: 'Comments',
    backToHome: 'Back to Home',
    aiThinking: '🤖 AI is thinking...',
    noCommentsYet: 'No comments yet, be the first to comment!',
    postComment: 'Post Comment',
    posting: 'Posting...',
    nicknamePlaceholder: 'Your nickname (optional)',
    commentPlaceholder: 'Share your thoughts...',
    recentAiCommentEmpty: 'No AI comments yet.',
    mostCommentedHint: 'Sorted by comment count',
    currentLabel: 'Current: ',
    today: 'Today',
    yesterday: 'Yesterday',
    useLocalTzLabel: 'Show dates in local timezone',
    latestCountLabel: '{{n}} latest',
    assistantTitle: 'Bella',
    assistantSubtitle: 'AI companion · Chat and get things done',
    assistantGreet1: "Hi, I'm Bella～",
    assistantGreet2: 'Ask me to chat, process files, create content, or just talk.',
    assistantGreet3: 'Say "send a selfie" or "what are you doing" and I\'ll send a photo or video.',
    send: 'Send',
    inputPlaceholder: 'Type a message...',
    openVideo: 'Open video',
    imageFromAssistant: 'Photo from Bella',
    errorPrefix: 'Error: ',
    loadingDetail: 'Loading...',
    topicNotFound: 'Topic not found',
    contentLoading: 'Loading content...',
    viewOriginal: 'View original →',
    triggerAi: 'Let AI comment',
    cancelReply: 'Cancel',
    reply: 'Reply',
    replyPlaceholder: 'Write your reply...',
    postReply: 'Post Reply',
    cancel: 'Cancel',
    postCommentFailed: 'Failed to post comment, please try again later',
    replyFailed: 'Failed to reply, please try again later',
    aiCommentFailed: 'Failed to trigger AI comments, please try again later',
    guestName: 'Guest',
    chatModeLabel: 'Chat mode: ',
    chatModeNormal: 'Text',
    chatModeVoice: 'Voice',
    chatModeVoiceHint: '(Bella will speak replies)',
    transcribing: 'Transcribing...',
    stopRecording: 'Stop',
    voiceInput: 'Voice input (Whisper)',
    loadError: 'Load Error',
    loadErrorHint: 'Check browser console (F12) for details',
  },
};

interface LanguageContextValue {
  lang: Language;
  /** User changed language in UI — persists and sets `hotspot-lang-user-chose`. */
  setLang: (lang: Language) => void;
  /**
   * Align UI language with Bella region mode (china → zh, world → en) only when
   * the user has never explicitly chosen a language (`hotspot-lang-user-chose` unset).
   */
  syncLangFromModeDefault: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: TextKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'hotspot-lang';
/** When set to `1`, mode switches must not overwrite UI language. */
export const LANG_USER_CHOICE_KEY = 'hotspot-lang-user-chose';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === 'zh' || stored === 'en') {
        setLangState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const persistLang = useCallback((l: Language, markUserChose: boolean) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      if (markUserChose) window.localStorage.setItem(LANG_USER_CHOICE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const setLang = useCallback((l: Language) => {
    persistLang(l, true);
  }, [persistLang]);

  const syncLangFromModeDefault = useCallback((l: Language) => {
    try {
      if (window.localStorage.getItem(LANG_USER_CHOICE_KEY) === '1') return;
    } catch {
      // ignore
    }
    persistLang(l, false);
  }, [persistLang]);

  const toggleLang = () => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  };

  const t = (key: TextKey, vars?: Record<string, string | number>) => {
    let s = texts[lang][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    return s;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, syncLangFromModeDefault, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};

