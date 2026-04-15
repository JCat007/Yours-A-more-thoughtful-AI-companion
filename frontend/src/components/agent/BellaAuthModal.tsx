import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBellaAuth } from '../../contexts/BellaAuthContext';

export default function BellaAuthModal() {
  const { lang } = useLanguage();
  const isZh = lang === 'zh';
  const {
    authModalOpen,
    setAuthModalOpen,
    login,
    register,
    setAuthDraftUsername,
  } = useBellaAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!authModalOpen) {
      setTab('login');
      setUsername('');
      setPassword('');
      setErr('');
      setAuthDraftUsername('');
    }
  }, [authModalOpen, setAuthDraftUsername]);

  useEffect(() => {
    setAuthDraftUsername(username);
  }, [username, setAuthDraftUsername]);

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-4 text-sm text-white shadow-xl space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 ${tab === 'login' ? 'bg-white/15' : 'bg-white/5'}`}
            onClick={() => {
              setTab('login');
              setErr('');
            }}
          >
            {isZh ? '登录' : 'Sign in'}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 ${tab === 'register' ? 'bg-white/15' : 'bg-white/5'}`}
            onClick={() => {
              setTab('register');
              setErr('');
            }}
          >
            {isZh ? '注册' : 'Register'}
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-white/60 text-xs">{isZh ? '用户名' : 'Username'}</span>
          <input
            className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-white/60 text-xs">{isZh ? '密码' : 'Password'}</span>
          <input
            type="password"
            className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {err ? <p className="text-rose-300 text-xs">{err}</p> : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="flex-1 rounded-lg bg-white/10 py-2 hover:bg-white/15"
            onClick={() => setAuthModalOpen(false)}
          >
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-lg bg-amber-500/90 text-black font-medium py-2 hover:bg-amber-400 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                if (tab === 'login') await login(username, password);
                else await register(username, password);
                setPassword('');
              } catch (e: unknown) {
                const ex = e as { response?: { data?: { error?: string } }; message?: string };
                setErr(ex?.response?.data?.error || ex?.message || (isZh ? '失败' : 'Failed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '…' : tab === 'login' ? (isZh ? '登录' : 'Sign in') : isZh ? '注册' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
