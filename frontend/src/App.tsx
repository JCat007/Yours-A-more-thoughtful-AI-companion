import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useLocation, Link, Navigate } from 'react-router-dom';
import OfficeHome from './pages/OfficeHome';
import AgentModeView from './components/agent/AgentModeView';
import BellaAuthModal from './components/agent/BellaAuthModal';
import BellaHeaderAuth from './components/agent/BellaHeaderAuth';
import BellaMemorySettingsModal from './components/agent/BellaMemorySettingsModal';
import ModeModal from './components/agent/ModeModal';
import BellaCompanionMemoryPage from './pages/BellaCompanionMemoryPage';
import { useLanguage } from './contexts/LanguageContext';
import { useMode } from './contexts/ModeContext';

function AppContent() {
  const { lang, t, toggleLang } = useLanguage();
  const { mode } = useMode();
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = (localStorage.getItem('bellaTheme') || '').toLowerCase();
    if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isBellaPage = location.pathname === '/bella';
  const isBellaMemoryPage = location.pathname === '/bella/memory';
  const isBellaArea = isBellaPage || isBellaMemoryPage;
  const enableStarOfficeUi = (import.meta.env.VITE_ENABLE_STAR_OFFICE_UI || '').trim().toLowerCase() === '1';

  useEffect(() => {
    try {
      localStorage.setItem('bellaTheme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(ev.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) {
      document.addEventListener('mousedown', onDocClick);
    }
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [settingsOpen]);

  const rootClass = useMemo(() => {
    return `min-h-screen flex flex-col bella ${theme === 'dark' ? 'is-dark' : 'is-light'}`;
  }, [theme]);

  return (
      <div className={rootClass}>
        {!isHome && (
          <>
            <header className="bella-header">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="bella-header-topline">
                  <div className="bella-brand-word" aria-label="Yours brand">
                    Yours
                  </div>
                  <div className="flex items-center gap-2">
                  {isBellaArea ? <BellaHeaderAuth /> : null}
                  <div className="bella-settings-wrap" ref={settingsRef}>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((v) => !v)}
                      className="bella-btn-outline text-xs flex items-center gap-1.5"
                      title={lang === 'zh' ? '设置' : 'Settings'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.983 3.045a1.25 1.25 0 012.034 0l.53.796a1.25 1.25 0 001.364.525l.916-.28a1.25 1.25 0 011.549.897l.2.938a1.25 1.25 0 001.02.96l.948.13a1.25 1.25 0 011.068 1.73l-.37.884a1.25 1.25 0 00.288 1.432l.674.67a1.25 1.25 0 010 1.768l-.674.67a1.25 1.25 0 00-.288 1.432l.37.884a1.25 1.25 0 01-1.068 1.73l-.948.13a1.25 1.25 0 00-1.02.96l-.2.938a1.25 1.25 0 01-1.55.897l-.915-.28a1.25 1.25 0 00-1.364.525l-.53.796a1.25 1.25 0 01-2.034 0l-.53-.796a1.25 1.25 0 00-1.364-.525l-.915.28a1.25 1.25 0 01-1.55-.897l-.2-.938a1.25 1.25 0 00-1.02-.96l-.948-.13a1.25 1.25 0 01-1.068-1.73l.37-.884a1.25 1.25 0 00-.288-1.432l-.674-.67a1.25 1.25 0 010-1.768l.674-.67a1.25 1.25 0 00.288-1.432l-.37-.884a1.25 1.25 0 011.068-1.73l.948-.13a1.25 1.25 0 001.02-.96l.2-.938a1.25 1.25 0 011.549-.897l.916.28a1.25 1.25 0 001.364-.525l.53-.796z" />
                        <circle cx="12" cy="12" r="3" strokeWidth={2} />
                      </svg>
                      {lang === 'zh' ? '设置' : 'Settings'}
                    </button>

                    {settingsOpen && (
                      <div className="bella-settings-panel">
                        <button
                          type="button"
                          onClick={() => {
                            toggleLang();
                            setSettingsOpen(false);
                          }}
                          className="bella-btn-outline text-xs flex items-center gap-1.5 w-full justify-center"
                          title={lang === 'zh' ? 'English' : '中文'}
                        >
                          {lang === 'zh' ? 'English' : '中文'}
                        </button>
                        <button
                          onClick={() => {
                            setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
                            setSettingsOpen(false);
                          }}
                          className="bella-btn-outline text-xs flex items-center gap-1.5 w-full justify-center"
                          title={theme === 'dark' ? (lang === 'zh' ? '切换到白天' : 'Switch to Day') : (lang === 'zh' ? '切换到夜间' : 'Switch to Night')}
                        >
                          {theme === 'dark' ? (lang === 'zh' ? '白天' : 'Day') : (lang === 'zh' ? '夜间' : 'Night')}
                        </button>
                        <Link
                          to={isBellaPage ? '/' : '/bella'}
                          className="bella-btn-outline text-xs w-full text-center"
                          onClick={() => setSettingsOpen(false)}
                        >
                          {isBellaPage ? (lang === 'zh' ? '返回办公室' : 'Back to Office') : (lang === 'zh' ? '打开 Bella' : 'Open Bella')}
                        </Link>
                        <button
                          onClick={() => {
                            setModeModalOpen(true);
                            setSettingsOpen(false);
                          }}
                          className="bella-btn-outline text-xs flex items-center justify-center gap-1.5 w-full"
                          title={lang === 'zh' ? '模式与能力' : 'Mode & Capabilities'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0h.5a2.5 2.5 0 0010.5-1.5V3.935M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {mode === 'china' ? 'China' : 'World'}
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
                <div className="min-w-0 mt-1">
                  {t('siteTitle') ? <h1 className="bella-title">{t('siteTitle')}</h1> : null}
                  {t('siteSubtitle') ? <p className="bella-subtitle">{t('siteSubtitle')}</p> : null}
                </div>
              </div>
            </header>
            <ModeModal open={modeModalOpen} onClose={() => setModeModalOpen(false)} />
            {isBellaArea ? (
              <>
                <BellaAuthModal />
                <BellaMemorySettingsModal />
              </>
            ) : null}
          </>
        )}
        <main className={`bella-main flex-1 min-h-0 flex ${(isHome || isBellaPage || isBellaMemoryPage) ? 'overflow-hidden' : 'overflow-auto'}`}>
          <Routes>
            <Route path="/" element={enableStarOfficeUi ? <OfficeHome /> : <Navigate to="/bella" replace />} />
            <Route path="/bella" element={<AgentModeView />} />
            <Route
              path="/bella/memory"
              element={
                <div className="bella-page-shell flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden">
                  <div className="bella-page-inner flex-1 min-h-0 w-full flex">
                    <div className="bella-responsive-card w-full h-full flex-1 min-h-0">
                      <BellaCompanionMemoryPage />
                    </div>
                  </div>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
  );
}

export default function App() {
  return <AppContent />;
}
