import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { BellaAuthProvider } from './contexts/BellaAuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ModeProvider } from './contexts/ModeContext';

function ErrorFallback({ error }: { error: Error }) {
  const isZh = typeof navigator !== 'undefined' && navigator.language.startsWith('zh');
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#1a1a2e', color: '#ff6b6b', minHeight: '100vh' }}>
      <h2>{isZh ? '加载出错' : 'Load Error'}</h2>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error.message}</pre>
      <p style={{ color: '#aaa', marginTop: 16 }}>{isZh ? '请查看浏览器控制台 (F12) 获取完整报错' : 'Check browser console (F12) for full error'}</p>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App Error:', error, info);
  }
  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <ModeProvider>
          <BrowserRouter>
            <BellaAuthProvider>
              <App />
            </BellaAuthProvider>
          </BrowserRouter>
        </ModeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
