import { useCallback, useRef, useState } from 'react';

function getVoice(): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const zh = voices.find((v) => v.lang.startsWith('zh'));
  const en = voices.find((v) => v.lang.startsWith('en'));
  return zh ?? en ?? voices[0] ?? null;
}

export function useTTS() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [voicesReady, setVoicesReady] = useState(false);

  const ensureVoices = useCallback(() => {
    if (voiceRef.current) return voiceRef.current;
    voiceRef.current = getVoice();
    if (voiceRef.current) return voiceRef.current;
    return new Promise<SpeechSynthesisVoice | null>((resolve) => {
      const onVoices = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        voiceRef.current = getVoice();
        setVoicesReady(true);
        resolve(voiceRef.current);
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      const v = getVoice();
      if (v) {
        voiceRef.current = v;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        setVoicesReady(true);
        resolve(v);
      }
    });
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const t = text?.trim();
      if (!t) return;
      if (!('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      await ensureVoices();
      const voice = voiceRef.current;
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 0.95;
      u.pitch = 1;
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');
      synth.speak(u);
    },
    [ensureVoices]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, stop, voicesReady };
}
