import { useState, useRef, useEffect } from 'react';
import { assistantApi, type ChatMessage } from '../api/assistant';
import { useLanguage } from '../contexts/LanguageContext';

const DEFAULT_AVATAR =
  import.meta.env.VITE_ASSISTANT_AVATAR_URL ||
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella&backgroundColor=ffdfbf';

export default function AssistantChat() {
  const { t, lang } = useLanguage();
  const isZh = lang === 'zh';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const backendApiKey = (import.meta.env.VITE_BACKEND_API_KEY || '').trim();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  function timeAgoText(ts: number): string {
    const d = Math.max(0, Date.now() - ts);
    const sec = Math.floor(d / 1000);
    if (sec < 10) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    return `${hr}h`;
  }

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  const send = async (overrideText?: string) => {
    const text = (overrideText !== undefined && overrideText !== '' ? overrideText : input).trim();
    if (!text || loading) return;
    if (overrideText === undefined) setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await assistantApi.chat(text, messages, undefined, [], lang);
      if (res.jobId) {
        const jobId = res.jobId;
        const jobDescription = res.jobDescription || text;
        const stage = res.stage || 'queued';

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: isZh
              ? `我在做：${jobDescription}\n进度：${stage}\n你也可以问我“现在怎么样/还要多久”。`
              : `Working on: ${jobDescription}\nProgress: ${stage}\nYou can also ask how it is going or how long it will take.`,
            jobId,
            jobDescription,
            downloads: [],
          } as any,
        ]);

        const url = `${apiBaseUrl}/assistant/job/${encodeURIComponent(jobId)}/events${
          backendApiKey ? `?apiKey=${encodeURIComponent(backendApiKey)}` : ''
        }`;
        const es = new EventSource(url);
        eventSourcesRef.current.set(jobId, es);

        es.addEventListener('job_status', (ev) => {
          try {
            const data = JSON.parse(ev.data) as { jobId: string; jobDescription: string; stage: string; updatedAt: number; error?: string };
            setMessages((prev) =>
              prev.map((m) => {
                if (m.role !== 'assistant') return m;
                if ((m as any).jobId !== jobId) return m;
                return {
                  ...m,
                  content: isZh
                    ? `我在做：${data.jobDescription}\n进度：${data.stage}${
                      data.error ? `\n错误：${data.error}` : ''
                    }\n最后更新时间：${timeAgoText(data.updatedAt)} 前`
                    : `Working on: ${data.jobDescription}\nProgress: ${data.stage}${
                      data.error ? `\nError: ${data.error}` : ''
                    }\nUpdated ${timeAgoText(data.updatedAt)} ago`,
                  jobDescription: data.jobDescription,
                } as any;
              })
            );

            if (data.stage === 'failed' || data.stage === 'cancelled') {
              const s = eventSourcesRef.current.get(jobId);
              if (s) s.close();
              eventSourcesRef.current.delete(jobId);
            }
          } catch {
            // ignore
          }
        });

        es.addEventListener('job_result', (ev) => {
          try {
            const data = JSON.parse(ev.data) as { reply: string; imageUrl?: string; videoUrl?: string; downloads: any[] };
            setMessages((prev) =>
              prev.map((m) => {
                if (m.role !== 'assistant') return m;
                if ((m as any).jobId !== jobId) return m;
                return {
                  ...m,
                  content: data.reply,
                  imageUrl: data.imageUrl || undefined,
                  videoUrl: data.videoUrl || undefined,
                  downloads: data.downloads || [],
                  jobId: undefined,
                  jobDescription: undefined,
                } as any;
              })
            );
          } finally {
            const s = eventSourcesRef.current.get(jobId);
            if (s) s.close();
            eventSourcesRef.current.delete(jobId);
          }
        });
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.reply || '', imageUrl: res.imageUrl || undefined, videoUrl: res.videoUrl || undefined },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${t('errorPrefix')}${err.response?.data?.error || err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      for (const es of eventSourcesRef.current.values()) {
        try {
          es.close();
        } catch {
          // ignore
        }
      }
      eventSourcesRef.current.clear();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg border-2 border-white overflow-hidden bg-white hover:scale-105 transition-transform"
        title={`${t('assistantTitle')} · ${t('assistantSubtitle')}`}
      >
        <img src={DEFAULT_AVATAR} alt={t('assistantTitle')} className="w-full h-full object-cover" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-xl border border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-white">
            <img
              src={DEFAULT_AVATAR}
              alt={t('assistantTitle')}
              className="w-10 h-10 rounded-full object-cover border border-rose-200"
            />
            <div>
              <p className="font-semibold text-gray-900">{t('assistantTitle')}</p>
              <p className="text-xs text-gray-500">{t('assistantSubtitle')}</p>
            </div>
          </div>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto min-h-[240px] max-h-[360px] p-4 space-y-4"
          >
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">
                <p>{t('assistantGreet1')}</p>
                <p className="mt-1">{t('assistantGreet2')}</p>
                <p className="mt-2 text-xs">{t('assistantGreet3')}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {m.role === 'assistant' && (
                  <img
                    src={DEFAULT_AVATAR}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-rose-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  {m.role === 'assistant' && (m as any).jobId && (
                    <button
                      type="button"
                      onClick={() =>
                        send(
                          isZh
                            ? `job_id=${(m as any).jobId} 现在进度怎么样？`
                            : `job_id=${(m as any).jobId} What is the status of this task?`
                        )}
                      className="mt-2 text-[11px] text-cyan-700 hover:text-cyan-900 underline"
                      title={isZh ? '询问该任务进度' : 'Ask for this task status'}
                    >
                      {isZh ? '问这个任务进度' : 'Ask task status'}
                    </button>
                  )}
                  {m.role === 'assistant' && m.imageUrl && (
                    <a
                      href={m.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-2 rounded-lg overflow-hidden border border-gray-200"
                    >
                      <img
                        src={m.imageUrl}
                        alt={t('imageFromAssistant')}
                        className="w-full max-h-64 object-cover"
                      />
                    </a>
                  )}
                  {m.role === 'assistant' && m.videoUrl && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                      <video
                        src={m.videoUrl}
                        controls
                        className="w-full max-h-64"
                        playsInline
                      />
                      <a href={m.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 mt-1 block">
                        {t('openVideo')}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <img
                  src={DEFAULT_AVATAR}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
                <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-2 text-sm">
                  ...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder={t('inputPlaceholder')}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50 hover:bg-rose-600"
              >
                {t('send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
