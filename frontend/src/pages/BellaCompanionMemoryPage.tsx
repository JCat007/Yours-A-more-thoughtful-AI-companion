import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { htmlToMarkdown, markdownToHtml } from '../lib/companionMemoryHtml';
import { useLanguage } from '../contexts/LanguageContext';
import { useBellaAuth } from '../contexts/BellaAuthContext';

type ApiErrBody = { error?: string; code?: string };

function mapCompanionMemoryApiError(isZh: boolean, body?: ApiErrBody, fallbackMessage?: string): string {
  const code = body?.code;
  const raw = body?.error || fallbackMessage;
  if (code === 'GBRAIN_DISABLED') {
    return isZh
      ? '未启用 gbrain：在 backend/.env 中设置 GBRAIN_ENABLED=1，安装 gbrain 命令行，并对与 Bella 相同的 DATABASE_URL 执行 gbrain init，然后重启后端。'
      : 'gbrain is disabled. Set GBRAIN_ENABLED=1 in backend/.env, install the gbrain CLI, run gbrain init with the same DATABASE_URL as Bella, then restart the backend.';
  }
  if (code === 'GBRAIN_PUT_FAILED' || (raw && /gbrain put failed/i.test(raw))) {
    return isZh
      ? '写入 gbrain 失败：请确认 gbrain 已安装且在 PATH 中，数据库配置正确，并查看后端日志中的 [gbrain]。'
      : 'Failed to write to gbrain. Ensure the CLI is on PATH, DB config matches, and check server logs for [gbrain].';
  }
  if (raw && /not logged in/i.test(raw)) {
    return isZh ? '未登录，请重新登录。' : 'Not signed in; please sign in again.';
  }
  return raw || (isZh ? '操作失败' : 'Operation failed');
}

export default function BellaCompanionMemoryPage() {
  const { lang } = useLanguage();
  const isZh = lang === 'zh';
  const { user, loading: authLoading } = useBellaAuth();
  const [markdown, setMarkdown] = useState('');
  const [slug, setSlug] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [editing, setEditing] = useState(false);
  const editHostRef = useRef<HTMLDivElement>(null);
  const prevEditingRef = useRef(false);

  const readHtml = useMemo(() => {
    const md = markdown.trim();
    if (!md) {
      const empty = isZh ? '（暂无内容）' : '(Empty)';
      return `<p class="bella-memory-empty-note">${empty}</p>`;
    }
    return markdownToHtml(md);
  }, [markdown, isZh]);

  const loadCompanionPreferences = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setLoadErr('');
    try {
      const d = await authApi.getCompanionPreferences();
      setMarkdown(d.markdown);
      setSlug(d.slug);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: ApiErrBody }; message?: string };
      setLoadErr(mapCompanionMemoryApiError(isZh, ax.response?.data, ax.message));
    } finally {
      setBusy(false);
    }
  }, [user, isZh]);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadCompanionPreferences();
  }, [user, authLoading, loadCompanionPreferences]);

  /** Chat writes gbrain in the background; refetch when user returns to this tab or route. */
  useEffect(() => {
    if (!user || authLoading) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadCompanionPreferences();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, authLoading, loadCompanionPreferences]);

  useEffect(() => {
    const wasEditing = prevEditingRef.current;
    prevEditingRef.current = editing;
    if (!editing) return;
    if (wasEditing) return;
    const id = window.requestAnimationFrame(() => {
      const el = editHostRef.current;
      if (!el) return;
      el.innerHTML = markdownToHtml(markdown);
    });
    return () => window.cancelAnimationFrame(id);
  }, [editing, markdown]);

  if (authLoading) {
    return (
      <div className="bella-page-shell bella-memory-page flex flex-col flex-1 min-h-0 w-full p-6 text-sm bella-memory-muted">
        {isZh ? '加载中…' : 'Loading…'}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bella-page-shell bella-memory-page flex flex-col flex-1 min-h-0 w-full p-6 text-sm bella-memory-body-text space-y-3">
        <p>{isZh ? '请先登录后再查看伴侣记忆页面。' : 'Please sign in to view companion memory.'}</p>
        <Link to="/bella" className="bella-btn-outline text-xs inline-flex w-fit">
          {isZh ? '返回 Bella' : 'Back to Bella'}
        </Link>
      </div>
    );
  }

  const onSave = async () => {
    setBusy(true);
    setSaveErr('');
    setSavedOk(false);
    try {
      const rawHtml = editHostRef.current?.innerHTML || '';
      const nextMd = htmlToMarkdown(rawHtml);
      await authApi.putCompanionPreferences(nextMd);
      setMarkdown(nextMd);
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 2000);
      setEditing(false);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: ApiErrBody }; message?: string };
      setSaveErr(mapCompanionMemoryApiError(isZh, ax.response?.data, ax.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bella-page-shell bella-memory-page flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden bella-memory-chrome">
      <div className="bella-memory-topbar flex-shrink-0 px-4 py-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="bella-memory-page-title text-base sm:text-lg font-semibold">
            {isZh ? '伴侣记忆（gbrain）' : 'Companion memory (gbrain)'}
          </h1>
          {slug ? (
            <p className="text-[11px] bella-memory-slug font-mono mt-0.5 truncate max-w-full">{slug}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          {!editing ? (
            <>
              <button
                type="button"
                className="bella-btn-outline text-xs"
                disabled={busy}
                onClick={() => void loadCompanionPreferences()}
              >
                {isZh ? '刷新' : 'Refresh'}
              </button>
              <button
                type="button"
                className="bella-btn-outline text-xs"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {isZh ? '编辑' : 'Edit'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="bella-btn-outline text-xs"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                className="bella-btn-outline text-xs disabled:opacity-50"
                disabled={busy}
                onClick={() => void onSave()}
              >
                {busy ? '…' : isZh ? '保存' : 'Save'}
              </button>
            </>
          )}
          <Link to="/bella" className="bella-btn-outline text-xs">
            {isZh ? '返回聊天' : 'Back to chat'}
          </Link>
        </div>
      </div>
      {loadErr ? <p className="bella-memory-alert-error px-4 py-2 text-sm flex-shrink-0">{loadErr}</p> : null}
      {saveErr ? <p className="bella-memory-alert-error px-4 py-2 text-sm flex-shrink-0">{saveErr}</p> : null}
      {savedOk ? (
        <p className="bella-memory-saved-ok font-medium text-sm px-4 py-1 flex-shrink-0">{isZh ? '已保存' : 'Saved'}</p>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {!editing ? (
          <div className="bella-memory-body-scroll bella-memory-read-shell flex-1 min-h-0 overflow-x-auto">
            <div
              className="bella-md bella-memory-html-prose bella-memory-body-text break-words px-4 py-3 max-w-4xl mx-auto"
              dangerouslySetInnerHTML={{ __html: readHtml }}
            />
          </div>
        ) : (
          <div
            ref={editHostRef}
            role="textbox"
            tabIndex={0}
            aria-label={isZh ? '伴侣记忆编辑区' : 'Companion memory editor'}
            contentEditable
            suppressContentEditableWarning
            className="bella-memory-body-scroll bella-memory-ce bella-md bella-memory-html-prose bella-memory-body-text flex-1 min-h-0 px-4 py-3 max-w-4xl mx-auto w-full outline-none break-words"
          />
        )}
      </div>
    </div>
  );
}
