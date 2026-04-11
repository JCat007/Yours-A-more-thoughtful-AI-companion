import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBellaAuth } from '../../contexts/BellaAuthContext';

export default function BellaHeaderAuth() {
  const { lang } = useLanguage();
  const isZh = lang === 'zh';
  const {
    user,
    authModalOpen,
    authDraftUsername,
    openAuthModal,
    setMemoryModalOpen,
    logout,
  } = useBellaAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const headerLabel = user
    ? user.username
    : authModalOpen && authDraftUsername.trim()
      ? authDraftUsername.trim()
      : isZh
        ? '登录 / 注册'
        : 'Sign in / Register';

  return (
    <div className="bella-header-auth-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bella-btn-outline text-xs flex items-center gap-1.5 max-w-[10rem] sm:max-w-[14rem]"
        title={user ? (isZh ? '账号菜单' : 'Account menu') : isZh ? '登录或注册' : 'Sign in or register'}
        onClick={() => {
          if (user) setMenuOpen((v) => !v);
          else openAuthModal();
        }}
      >
        <span className="truncate">{headerLabel}</span>
      </button>
      {user && menuOpen && (
        <div className="bella-header-auth-panel">
          <button
            type="button"
            className="bella-btn-outline text-xs w-full justify-center"
            onClick={() => {
              setMemoryModalOpen(true);
              setMenuOpen(false);
            }}
          >
            {isZh ? '伴侣记忆设置' : 'Memory settings'}
          </button>
          <Link
            to="/bella/memory"
            target="_blank"
            rel="noreferrer"
            className="bella-btn-outline text-xs w-full text-center"
            onClick={() => setMenuOpen(false)}
          >
            {isZh ? '查看记忆' : 'View memory'}
          </Link>
          <button
            type="button"
            className="bella-btn-outline text-xs w-full justify-center"
            onClick={async () => {
              setMenuOpen(false);
              await logout();
            }}
          >
            {isZh ? '退出' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
