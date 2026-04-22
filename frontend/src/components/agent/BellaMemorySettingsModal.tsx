import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBellaAuth } from '../../contexts/BellaAuthContext';

export default function BellaMemorySettingsModal() {
  const { lang } = useLanguage();
  const isZh = lang === 'zh';
  const {
    user,
    settings,
    memoryModalOpen,
    setMemoryModalOpen,
    updateSettings,
  } = useBellaAuth();
  const [copiedUserId, setCopiedUserId] = useState(false);

  if (!memoryModalOpen || !user) return null;

  const openEditor = () => {
    window.open(`${window.location.origin}/bella/memory`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-4 text-sm text-white shadow-xl space-y-3">
        <h3 className="font-medium">{isZh ? '伴侣记忆（gbrain）' : 'Companion memory (gbrain)'}</h3>
        <p className="text-xs text-white/55">
          {isZh
            ? '需服务端已安装 gbrain、执行 init，并设置 GBRAIN_ENABLED=1。写入在后台异步执行。'
            : 'Requires gbrain CLI + init and GBRAIN_ENABLED=1 on the server; writes are asynchronous.'}
        </p>
        <button
          type="button"
          className="w-full rounded-lg border border-sky-400/40 bg-sky-500/15 text-sky-100 text-xs py-2 hover:bg-sky-500/25"
          onClick={openEditor}
        >
          {isZh ? '查看记忆' : 'View memory'}
        </button>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!settings?.companionMemoryEnabled}
            onChange={async (e) => {
              const v = e.target.checked;
              try {
                await updateSettings({ companionMemoryEnabled: v });
              } catch {
                // ignore; parent state unchanged on failure
              }
            }}
          />
          <span>{isZh ? '伴侣记忆总开关（读 gbrain + 允许写入时间线）' : 'Companion memory (read gbrain + timeline writes)'}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!settings?.autoLearnEnabled}
            onChange={async (e) => {
              const v = e.target.checked;
              try {
                await updateSettings({ autoLearnEnabled: v });
              } catch {
                // ignore
              }
            }}
          />
          <span>{isZh ? '自动学习（启发式写入，后台）' : 'Auto-learn (heuristic writes, background)'}</span>
        </label>
        <p className="text-[11px] text-white/45">
          {isZh
            ? '显式「记住…」类语句在开启记忆总开关后也会写入时间线。'
            : 'Explicit “remember …” phrases are written when companion memory is on.'}
        </p>
        <div className="rounded-lg bg-black/30 border border-white/10 p-2 flex items-center gap-2 min-w-0">
          <code className="text-[10px] text-white/80 truncate flex-1 font-mono">{user.id}</code>
          <button
            type="button"
            className="flex-shrink-0 rounded px-2 py-1 text-[11px] bg-white/15 hover:bg-white/25"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(user.id);
                setCopiedUserId(true);
                window.setTimeout(() => setCopiedUserId(false), 1600);
              } catch {
                // ignore
              }
            }}
          >
            {copiedUserId ? (isZh ? '已复制' : 'Copied') : isZh ? '复制 UUID' : 'Copy UUID'}
          </button>
        </div>
        <button
          type="button"
          className="w-full rounded-lg bg-white/10 py-2 hover:bg-white/15"
          onClick={() => setMemoryModalOpen(false)}
        >
          {isZh ? '关闭' : 'Close'}
        </button>
      </div>
    </div>
  );
}
