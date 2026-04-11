import { useState, useRef, useEffect } from 'react';
import { assistantApi, type ChatMessage } from '../../api/assistant';
import { useLanguage } from '../../contexts/LanguageContext';
import { useMode } from '../../contexts/ModeContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const AVATAR =
  import.meta.env.VITE_ASSISTANT_AVATAR_URL || '/bella-avatar.png';

export default function BellaAgentChat() {
  const { t, lang } = useLanguage();
  const { mode } = useMode();
  const isZh = lang === 'zh';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressPct, setUploadProgressPct] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceWaitingFinal, setVoiceWaitingFinal] = useState(false);
  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmModeRef = useRef<'worklet' | 'scriptProcessor' | 'none'>('none');
  const workletMsgCountRef = useRef(0);
  const scriptProcessCountRef = useRef(0);
  const scriptOutputCountRef = useRef(0);
  const pcmBufferRef = useRef<Int16Array[]>([]);
  const pcmBufferedChunksRef = useRef(0);
  const finalizeQuietTimerRef = useRef<number | undefined>(undefined);
  const voiceSessionUuidRef = useRef<string>('');
  const iflySidRef = useRef<string>('');
  const transcriptRef = useRef<string>('');
  const stopRequestedRef = useRef<boolean>(false);
  const finalResolveRef = useRef<((text: string) => void) | null>(null);
  const pcmSentChunksRef = useRef(0);
  const pcmSentLogRef = useRef(0);
  const wsMsgLogCountRef = useRef(0);
  const backendApiKey = (import.meta.env.VITE_BACKEND_API_KEY || '').trim();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadCancelledRef = useRef(false);

  const MAX_PICK_FILES = 8;
  const MAX_UPLOAD_BYTES = Number(import.meta.env.VITE_ASSISTANT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
  const ALLOWED_UPLOAD_EXTS = new Set([
    '.pdf',
    '.txt',
    '.md',
    '.csv',
    '.json',
    '.xlsx',
    '.xls',
    '.docx',
    '.pptx',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.bmp',
    '.tiff',
    '.tif',
    '.heic',
    '.mp4',
    '.mov',
    '.webm',
  ]);

  function getFileExt(file: File): string {
    const parts = (file.name || '').toLowerCase().split('.');
    if (parts.length < 2) return '';
    return `.${parts[parts.length - 1]}`;
  }

  function newUuid(): string {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function extractIfltekText(payload: any): { text: string; isFinal: boolean } {
    try {
      // Fallback: recursively collect every `w` field (iFly payload shapes vary).
      const collectW = (v: any, out: string[], depth = 0) => {
        if (depth > 12) return;
        if (out.length >= 2000) return;
        if (!v) return;
        if (typeof v === 'string') return;
        if (Array.isArray(v)) {
          for (const it of v) collectW(it, out, depth + 1);
          return;
        }
        if (typeof v === 'object') {
          if (typeof v.w === 'string' && v.w) out.push(v.w);
          for (const k of Object.keys(v)) {
            collectW((v as any)[k], out, depth + 1);
            if (out.length >= 2000) break;
          }
        }
      };

      const st0 = payload?.data?.cn?.st?.[0];
      const isFinal = Boolean(st0?.ed);

      // 1) Try the common shapes first.
      let out = '';
      if (st0) {
        if (Array.isArray(st0.ws)) {
          for (const seg of st0.ws) {
            const w = seg?.cw?.[0]?.w;
            if (typeof w === 'string' && w) out += w;
          }
        }
        if (!out && Array.isArray(st0.cw)) {
          for (const cw of st0.cw) {
            const w = cw?.w;
            if (typeof w === 'string' && w) out += w;
          }
        }

        // 2) Fallback: read data.text / data.result.text
        if (!out) {
          const t1 = payload?.data?.text;
          if (typeof t1 === 'string' && t1) out = t1;
        }
        if (!out) {
          const t2 = payload?.data?.result?.text;
          if (typeof t2 === 'string' && t2) out = t2;
        }
      }

      // 3) Last resort: concatenate every nested `w` token.
      if (!out) {
        const words: string[] = [];
        collectW(payload?.data, words);
        out = words.join('');
      }

      return { text: out || '', isFinal };
    } catch {
      return { text: '', isFinal: false };
    }
  }

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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea with cap at 40% viewport height
  const autoResizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    const baseMin = 66; // px, matches CSS min-height
    const cap = Math.max(160, Math.min(Math.floor(window.innerHeight * 0.4), 420));
    el.style.height = 'auto';
    const next = Math.max(baseMin, Math.min(el.scrollHeight, cap));
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    autoResizeTextarea();
    // re-evaluate on viewport resize
    const onResize = () => autoResizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function fetchAsrWsUrl(uuid: string): Promise<{ wsUrl: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (backendApiKey) headers['x-api-key'] = backendApiKey;
    const resp = await fetch(`${apiBaseUrl}/asr/rtasr-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ uuid, mode }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(
        `${isZh ? '获取语音转写连接失败' : 'Failed to initialize voice transcription'}: ${resp.status} ${text || ''}`.trim()
      );
    }
    const data = (await resp.json()) as { wsUrl: string };
    if (!data.wsUrl) throw new Error(isZh ? '语音转写连接 wsUrl 为空' : 'Voice transcription wsUrl is empty');
    // eslint-disable-next-line no-console
    console.log('[asr] got wsUrl', { uuid, hasWsUrl: Boolean(data.wsUrl) });
    return data;
  }

  async function startVoiceTranscribe(): Promise<void> {
    if (loading || uploading || voiceListening || voiceWaitingFinal) return;

    stopRequestedRef.current = false;
    iflySidRef.current = '';
    transcriptRef.current = '';
    voiceSessionUuidRef.current = newUuid();
    pcmSentChunksRef.current = 0;
    pcmSentLogRef.current = 0;
    pcmModeRef.current = 'none';
    workletMsgCountRef.current = 0;
    scriptProcessCountRef.current = 0;
    scriptOutputCountRef.current = 0;
    pcmBufferRef.current = [];
    pcmBufferedChunksRef.current = 0;
    finalizeQuietTimerRef.current = undefined;
    setVoiceWaitingFinal(false);
    setVoiceListening(true);
    setInput('');
    // eslint-disable-next-line no-console
    console.log('[asr] startVoiceTranscribe', { mode });

    try {
      // Acquire the mic before awaiting WS open so permission timing stays reliable.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      // Some browsers leave AudioContext suspended until resume() after a gesture.
      try {
        await audioCtx.resume();
      } catch {
        // ignore
      }

      const source = audioCtx.createMediaStreamSource(stream);
      audioSourceRef.current = source;

      // Keep the AudioContext alive without audible output.
      const gain = audioCtx.createGain();
      // Fully muted gain prevents some browsers from optimizing away the processing graph.
      gain.gain.value = 0.00001;
      gain.connect(audioCtx.destination);

      // Prefer AudioWorklet → 16 kHz PCM frames (40 ms / 640 samples).
      // Fall back to ScriptProcessorNode when AudioWorklet is unavailable.
      let startedPcmSender = false;

      const sendPcmChunk = (pcmChunk: Int16Array) => {
        const curWs = wsRef.current;
        if (!curWs || curWs.readyState !== WebSocket.OPEN) {
          // Buffer PCM until the websocket is ready so early frames are not dropped.
          if (pcmBufferRef.current.length < 60) {
            pcmBufferRef.current.push(pcmChunk);
            pcmBufferedChunksRef.current += 1;
          }
          return;
        }

        // Flush any buffered audio once the socket is open.
        if (pcmBufferRef.current.length > 0) {
          const buf = pcmBufferRef.current.splice(0, pcmBufferRef.current.length);
          for (const c of buf) {
            try {
              curWs.send(c.buffer);
              pcmSentChunksRef.current += 1;
            } catch {
              // ignore
            }
          }
        }

        pcmSentChunksRef.current += 1;
        if (pcmSentLogRef.current < 10) {
          // eslint-disable-next-line no-console
          console.log('[asr] sent pcm chunk', pcmSentChunksRef.current, 'bytes', pcmChunk.byteLength);
          pcmSentLogRef.current += 1;
        }
        curWs.send(pcmChunk.buffer);
      };

      try {
        if (audioCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
          await audioCtx.audioWorklet.addModule('/ifly-pcm-16k-processor.js');

          const worklet = new AudioWorkletNode(audioCtx, 'pcm-16k-processor', {
            numberOfInputs: 1,
            // Some browsers require wiring the worklet to an output node for stable `process` callbacks.
            numberOfOutputs: 1,
            channelCount: 1,
          });
          workletNodeRef.current = worklet;
          worklet.port.onmessage = (e) => {
            const pcmChunk = (e.data as any)?.pcm as Int16Array | undefined;
            if (!pcmChunk) return;
            workletMsgCountRef.current += 1;
            sendPcmChunk(pcmChunk);
          };

          // Graph: source -> worklet -> muted gain
          source.connect(worklet);
          worklet.connect(gain);
          startedPcmSender = true;
          pcmModeRef.current = 'worklet';
        }
      } catch (workletErr) {
        // ignore here; fallback below
      }

      if (!startedPcmSender) {
        // Fallback: ScriptProcessorNode + JS resample to 16 kHz / 40 ms frames.
        const srcRate = audioCtx.sampleRate;
        const targetRate = 16000;
        const step = srcRate / targetRate;
        const chunkSamples = 640; // 40ms @ 16kHz

        const floatToInt16 = (s: number): number => {
          if (s > 1) s = 1;
          if (s < -1) s = -1;
          return s < 0 ? ((s * 0x8000) | 0) : ((s * 0x7fff) | 0);
        };

        const queue: number[] = [];
        let resamplePos = 0;
        const outSamples: number[] = [];

        const scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
        scriptProcessorRef.current = scriptProcessor;

        scriptProcessor.onaudioprocess = (ev) => {
          scriptProcessCountRef.current += 1;
          const input = ev.inputBuffer.getChannelData(0);
          // Push captured samples into the resampling queue.
          for (let i = 0; i < input.length; i++) queue.push(input[i]);

          // Emit resampled output while enough samples exist for interpolation.
          while (resamplePos + 1 < queue.length) {
            const idx = Math.floor(resamplePos);
            const frac = resamplePos - idx;
            const s0 = queue[idx];
            const s1 = queue[idx + 1];
            const s = s0 * (1 - frac) + s1 * frac;
            outSamples.push(floatToInt16(s));
            resamplePos += step;

            if (outSamples.length >= chunkSamples) {
              const chunk = new Int16Array(outSamples.splice(0, chunkSamples));
              scriptOutputCountRef.current += 1;
              sendPcmChunk(chunk);
            }
          }

          // Drop consumed prefix samples to bound memory usage.
          const drop = Math.floor(resamplePos);
          if (drop > 0) {
            queue.splice(0, drop);
            resamplePos -= drop;
          }
          // Hard cap queue growth as a safety net.
          if (queue.length > 20000) {
            const keepStart = queue.length - 20000;
            queue.splice(0, keepStart);
            resamplePos = Math.max(0, resamplePos - keepStart);
          }
        };

        // ScriptProcessorNode must connect to the destination graph to fire `onaudioprocess`.
        source.connect(scriptProcessor);
        scriptProcessor.connect(gain);
        startedPcmSender = true;
        pcmModeRef.current = 'scriptProcessor';
      }

      // Open the websocket after audio nodes exist; streaming starts on `open`.
      const { wsUrl } = await fetchAsrWsUrl(voiceSessionUuidRef.current);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log('[asr] ws open');
        const curWs = wsRef.current;
        if (curWs && curWs.readyState === WebSocket.OPEN && pcmBufferRef.current.length > 0) {
          const buf = pcmBufferRef.current.splice(0, pcmBufferRef.current.length);
          for (const c of buf) {
            try {
              curWs.send(c.buffer);
              pcmSentChunksRef.current += 1;
            } catch {
              // ignore
            }
          }
          pcmBufferedChunksRef.current = 0;
        }
      };

      ws.onmessage = (ev) => {
        try {
          const raw =
            typeof ev.data === 'string'
              ? ev.data
              : // Some servers may send JSON inside binary frames
                new TextDecoder().decode(ev.data);
          const msg = JSON.parse(raw);
          if (wsMsgLogCountRef.current < 10) {
            wsMsgLogCountRef.current += 1;
            console.log('[asr] ws msg', {
              action: msg?.action ?? msg?.data?.action,
              hasData: Boolean(msg?.data),
              hasCn: Boolean(msg?.data?.cn),
              msgKeys: msg && typeof msg === 'object' ? Object.keys(msg).slice(0, 12) : [],
              dataKeys: msg?.data && typeof msg.data === 'object' ? Object.keys(msg.data).slice(0, 12) : [],
              msgType: msg?.data?.msg_type,
              dataSessionId: typeof msg?.data?.sessionId === 'string' ? msg.data.sessionId : undefined,
            });
          }

          const action = msg?.action ?? msg?.data?.action;
          if (action === 'started' && typeof msg?.data?.sessionId === 'string' && !iflySidRef.current) {
            iflySidRef.current = msg.data.sessionId;
          }

          const { text } = extractIfltekText(msg);
          if (text) {
            transcriptRef.current = text;
            setInput(text);
          }

          // iFly payloads sometimes include `action`, but it is often undefined—do not rely on it.
          if (typeof msg?.sid === 'string' && !iflySidRef.current) {
            iflySidRef.current = msg.sid;
          }

          // After releasing the button, wait for a short silence window before closing.
          if (stopRequestedRef.current && (text || transcriptRef.current).trim() && finalResolveRef.current) {
            if (finalizeQuietTimerRef.current) window.clearTimeout(finalizeQuietTimerRef.current);
            // 800 ms tail window is usually enough for iFly’s final partial results.
            finalizeQuietTimerRef.current = window.setTimeout(() => {
              const curText = transcriptRef.current || text;
              const resolve = finalResolveRef.current;
              finalResolveRef.current = null;
              if (resolve && curText.trim()) resolve(curText);
              try {
                ws.close();
              } catch {
                // ignore
              }
            }, 800);
          }
        } catch {
          // Ignore non-JSON noise frames.
        }
      };

      ws.onerror = () => {
        const resolve = finalResolveRef.current;
        if (resolve) {
          finalResolveRef.current = null;
          resolve(transcriptRef.current);
        }
      };
    } catch (e: any) {
      setVoiceListening(false);
      setVoiceWaitingFinal(false);
      wsRef.current?.close();
      wsRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      setMessages((prev) => [...prev, { role: 'assistant', content: `${t('errorPrefix')}${e?.message || String(e)}` }]);
    }
  }

  async function stopVoiceAndResolveText(): Promise<string> {
    if (!voiceListening && !voiceWaitingFinal) return transcriptRef.current;

    stopRequestedRef.current = true;
    setVoiceListening(false);
    setVoiceWaitingFinal(true);

    const ws = wsRef.current;
    // Prefer sessionId from the `started` frame; fall back to the handshake UUID.
    const sessionId = iflySidRef.current || voiceSessionUuidRef.current;

    // eslint-disable-next-line no-console
    console.log('[asr] stopVoiceAndResolveText', {
      sentPcmChunks: pcmSentChunksRef.current,
      sessionId,
      wsReadyState: ws?.readyState,
      transcriptLen: transcriptRef.current?.length || 0,
      pcmMode: pcmModeRef.current,
      workletMsgCount: workletMsgCountRef.current,
      scriptProcessCount: scriptProcessCountRef.current,
      scriptOutputCount: scriptOutputCountRef.current,
      bufferedPcmChunks: pcmBufferedChunksRef.current,
    });

    // Notify the server that streaming finished.
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ end: true, sessionId }));
      }
    } catch {
      // ignore
    }

    // Release mic/audio tracks promptly.
    try {
      workletNodeRef.current?.port && (workletNodeRef.current.port.onmessage = null);
    } catch {
      // ignore
    }
    try {
      scriptProcessorRef.current?.disconnect();
    } catch {
      // ignore
    }
    try {
      audioSourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    try {
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    } catch {
      // ignore
    }
    try {
      await audioContextRef.current?.close();
    } catch {
      // ignore
    } finally {
      mediaStreamRef.current = null;
      audioContextRef.current = null;
      audioSourceRef.current = null;
      workletNodeRef.current = null;
      scriptProcessorRef.current = null;
    }

    const textNow = transcriptRef.current;
    return new Promise<string>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        const curText = transcriptRef.current || textNow;
        const curWs = wsRef.current;
        finalResolveRef.current = null;
        if (finalizeQuietTimerRef.current) window.clearTimeout(finalizeQuietTimerRef.current);
        setVoiceWaitingFinal(false);
        setVoiceListening(false);
        setInput(curText);
        wsRef.current = null;
        try {
          curWs?.close();
        } catch {
          // ignore
        }
        resolve(curText);
      }, 6000);

      finalResolveRef.current = (resolvedText) => {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (finalizeQuietTimerRef.current) window.clearTimeout(finalizeQuietTimerRef.current);
        setVoiceWaitingFinal(false);
        setVoiceListening(false);
        // Ensure the textarea reflects the final transcript.
        setInput(resolvedText || textNow);

        const curWs = wsRef.current;
        wsRef.current = null;
        try {
          curWs?.close();
        } catch {
          // ignore
        }
        resolve(resolvedText || textNow);
      };

      // If the socket closes first, stop waiting for manual release.
      ws?.addEventListener(
        'close',
        () => {
          if (timeoutId) window.clearTimeout(timeoutId);
          const curText = transcriptRef.current || textNow;
          const r = finalResolveRef.current;
          finalResolveRef.current = null;
          if (r) r(curText);
        },
        { once: true }
      );
    });
  }

  const send = async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || loading || uploading) return;
    setInput('');
    // reset textarea height to base after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }
    const fileSuffix = pendingFiles.length > 0
      ? isZh
        ? `\n\n[已上传文件]\n${pendingFiles.map((f) => `- ${f.name} (${Math.max(1, Math.round(f.size / 1024))}KB)`).join('\n')}`
        : `\n\n[Uploaded files]\n${pendingFiles.map((f) => `- ${f.name} (${Math.max(1, Math.round(f.size / 1024))}KB)`).join('\n')}`
      : '';
    const userMsg: ChatMessage = { role: 'user', content: toSend };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    let replyText = '';
    try {
      const res = await assistantApi.chat(
        `${toSend}${fileSuffix}`,
        messages,
        mode,
        pendingFiles.map((f) => f.id),
        lang,
      );
      if (res.jobId) {
        const jobId = res.jobId;
        const jobDescription = res.jobDescription || toSend;
        const stage = res.stage || 'queued';

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: isZh
              ? `我在做：${jobDescription}\n进度：${stage}\n你也可以问我“现在怎么样/还要多久”。`
              : `Working on: ${jobDescription}\nProgress: ${stage}\nYou can also ask: "How is it going?" or "How long will it take?"`,
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
                    }\nLast updated: ${timeAgoText(data.updatedAt)} ago`,
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
            // ignore parse errors
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
        replyText = res.reply || '';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: replyText, imageUrl: res.imageUrl, videoUrl: res.videoUrl, downloads: res.downloads },
        ]);
      }
      setPendingFiles([]);
    } catch (err: any) {
      replyText = `${t('errorPrefix')}${err.response?.data?.error || err.message}`;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: replyText },
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

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    const queue: File[] = [];
    const errors: string[] = [];

    for (const f of selected) {
      if (queue.length >= MAX_PICK_FILES) {
        errors.push(
          isZh
            ? `最多允许 ${MAX_PICK_FILES} 个文件/批次，已忽略多余文件。`
            : `Up to ${MAX_PICK_FILES} files per batch are allowed. Extra files were skipped.`
        );
        break;
      }

      const ext = getFileExt(f);
      if (!ext || !ALLOWED_UPLOAD_EXTS.has(ext)) {
        errors.push(isZh ? `不支持文件类型：${f.name}` : `Unsupported file type: ${f.name}`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        errors.push(
          isZh
            ? `文件过大（>${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）：${f.name}`
            : `File too large (>${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB): ${f.name}`
        );
        continue;
      }
      queue.push(f);
    }

    if (errors.length > 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: errors.join('\n') },
      ]);
    }

    if (queue.length === 0) return;

    setUploading(true);
    setUploadProgressPct(0);
    uploadCancelledRef.current = false;
    uploadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    try {
      for (let i = 0; i < queue.length; i++) {
        const file = queue[i];
        if (uploadCancelledRef.current) break;
        const uploaded = await assistantApi.uploadFile(file, {
          signal: abortController.signal,
          onReadProgress: (p01) => {
            const pct = ((i + p01 * 0.7) / queue.length) * 100;
            setUploadProgressPct(Math.max(0, Math.min(100, pct)));
          },
          onUploadProgress: (p01) => {
            const pct = ((i + 0.7 + p01 * 0.3) / queue.length) * 100;
            setUploadProgressPct(Math.max(0, Math.min(100, pct)));
          },
        });
        if (uploadCancelledRef.current) break;
        setPendingFiles((prev) => [...prev, { id: uploaded.fileId, name: uploaded.name, size: uploaded.size }]);
      }
      setUploadProgressPct(100);
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
      if (!isAbort && !uploadCancelledRef.current) {
      const msg = `${t('errorPrefix')}${err.response?.data?.error || err.message || (isZh ? '上传失败' : 'Upload failed')}`;
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      }
    } finally {
      setUploading(false);
      setUploadProgressPct(0);
      uploadAbortControllerRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const cancelUploads = () => {
    if (!uploading) return;
    uploadCancelledRef.current = true;
    try {
      uploadAbortControllerRef.current?.abort();
    } catch {
      // ignore
    }
    setUploading(false);
    setUploadProgressPct(0);
  };

  const copyMessage = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgIndex(idx);
      window.setTimeout(() => {
        setCopiedMsgIndex((prev) => (prev === idx ? null : prev));
      }, 1200);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${t('errorPrefix')}复制失败，请手动复制。` },
      ]);
    }
  };

  return (
    <div className="bella-chat-shell flex flex-col h-full min-h-0 rounded-2xl overflow-hidden">
      <div
        ref={listRef}
        className="bella-memo-content flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 min-h-0"
      >
        {/* 初始不显示占位提示，保持纯净背景 */}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {m.role === 'assistant' && (
              <img src={AVATAR} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 bella-avatar-glow" />
            )}
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bella-user-bubble'
                  : 'bella-assistant-bubble'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void copyMessage(m.content, i)}
                    title={isZh ? '复制回复' : 'Copy reply'}
                    className="bella-copy-btn"
                  >
                    {copiedMsgIndex === i ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')}
                  </button>
                </div>
              )}
              {m.role === 'assistant' ? (
                <div className="bella-md break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="bella-md-h1">{children}</h1>,
                      h2: ({ children }) => <h2 className="bella-md-h2">{children}</h2>,
                      h3: ({ children }) => <h3 className="bella-md-h3">{children}</h3>,
                      p: ({ children }) => <p className="bella-md-p">{children}</p>,
                      ul: ({ children }) => <ul className="bella-md-ul">{children}</ul>,
                      ol: ({ children }) => <ol className="bella-md-ol">{children}</ol>,
                      li: ({ children }) => <li className="bella-md-li">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="bella-md-blockquote">{children}</blockquote>
                      ),
                      hr: () => <hr className="bella-md-hr" />,
                      code: ({ children }) => (
                        <code className="bella-md-code">{children}</code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bella-md-pre">{children}</pre>
                      ),
                      table: ({ children }) => (
                        <div className="bella-md-table-wrap">
                          <table className="bella-md-table">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="bella-md-th">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="bella-md-td">{children}</td>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="bella-md-link">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
              {m.role === 'assistant' && (m as any).jobId && (
                <button
                  type="button"
                  onClick={() => send(`job_id=${(m as any).jobId} 现在进度怎么样？`)}
                  className="mt-2 bella-inline-link"
                  title={isZh ? '询问该任务进度' : 'Ask for this task progress'}
                >
                  {isZh ? '问这个任务进度' : 'Ask task progress'}
                </button>
              )}
              {m.role === 'assistant' && m.imageUrl && (
                <a href={m.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 rounded-xl overflow-hidden">
                  <img src={m.imageUrl} alt="" className="w-full max-h-48 object-cover" />
                </a>
              )}
              {m.role === 'assistant' && m.videoUrl && (
                <div className="mt-2 rounded-xl overflow-hidden">
                  <video src={m.videoUrl} controls className="w-full max-h-48" playsInline />
                </div>
              )}
              {m.role === 'assistant' && m.downloads && m.downloads.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.downloads.map((d) => (
                    <a
                      key={d.id}
                      href={d.url}
                      download={d.name}
                      target="_blank"
                      rel="noreferrer"
                      className="block bella-download-link"
                    >
                      {isZh ? '下载文件' : 'Download'}: {d.name} ({Math.max(1, Math.round(d.size / 1024))}KB)
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 items-center">
            <img src={AVATAR} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 bella-avatar-glow" />
            <div className="flex gap-1.5 px-3 py-2">
              <span className="bella-dot animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="bella-dot animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="bella-dot animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {pendingFiles.length > 0 && (
        <div className="px-3 sm:px-4 pb-1 flex flex-wrap gap-2">
          {pendingFiles.map((f) => (
            <span key={f.id} className="bella-file-chip">
              {f.name}
              <button
                type="button"
                className="bella-file-chip-remove"
                onClick={() => setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {uploading && (
        <div className="px-3 sm:px-4 pb-2">
          <div className="text-[11px] text-gray-500 mb-1">
            {isZh ? '上传中...' : 'Uploading...'} {uploadProgressPct.toFixed(0)}%
          </div>
          <div className="bella-progress-track w-full">
            <div className="bella-progress-bar" style={{ width: `${uploadProgressPct}%` }} />
          </div>
        </div>
      )}
      <div className="px-3 sm:px-4 pb-3 sm:pb-2 pt-2 flex gap-2 items-end">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.txt,.md,.csv,.json,.xlsx,.xls,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif,.heic,.mp4,.mov,.webm"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || uploading}
          title={uploading ? (isZh ? '上传中...' : 'Uploading...') : (isZh ? '上传文件' : 'Upload files')}
          className="bella-circle-btn flex-shrink-0 w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </button>
        {uploading && (
          <button
            type="button"
            onClick={cancelUploads}
            title={isZh ? '取消上传' : 'Cancel upload'}
            className="bella-circle-btn flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // grow as user types
            autoResizeTextarea();
          }}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={t('inputPlaceholder')}
          rows={2}
          className="bella-broker-input flex-1"
          readOnly={voiceListening || voiceWaitingFinal}
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!voiceListening && !voiceWaitingFinal) void startVoiceTranscribe();
          }}
          onMouseUp={async () => {
            try {
              const text = await stopVoiceAndResolveText();
              if (text.trim()) await send(text);
            } catch {
              // ignore
            }
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            if (!voiceListening && !voiceWaitingFinal) void startVoiceTranscribe();
          }}
          onTouchEnd={async (e) => {
            e.preventDefault();
            try {
              const text = await stopVoiceAndResolveText();
              if (text.trim()) await send(text);
            } catch {
              // ignore
            }
          }}
          disabled={loading || uploading || voiceWaitingFinal}
          title={voiceListening ? (isZh ? '松开结束并发送' : 'Release to stop and send') : (isZh ? '按住说话' : 'Hold to talk')}
          className={`bella-circle-btn flex-shrink-0 w-10 h-10 flex items-center justify-center ${
            voiceListening ? 'bella-circle-btn-recording animate-pulse' : ''
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 11a7 7 0 01-14 0M12 18v4"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => send()}
          disabled={loading || uploading || voiceWaitingFinal || !input.trim()}
          className="bella-circle-btn w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
