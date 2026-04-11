import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { buildEmbeddedOfficeUrl, getEmbeddedOfficeUrl, getSettingsButtonWidth, getSettingsLabel, normalizePanelMenu, OFFICE_PANEL_MENU } from '../config';
import { fetchStarOfficeConfig } from '../api';
import type { OfficeMessage } from '../types';
import OfficeSettingsMenu from '../components/OfficeSettingsMenu';

export default function StarOfficePage() {
  const { lang } = useLanguage();
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [officeUrl, setOfficeUrl] = useState(getEmbeddedOfficeUrl());
  const [panelMenu, setPanelMenu] = useState(OFFICE_PANEL_MENU);
  const [btnAnchor, setBtnAnchor] = useState({ left: 12, top: 12 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const settingsLabel = getSettingsLabel(lang);
  const settingsBtnWidth = getSettingsButtonWidth(lang);
  useEffect(() => {
    let cancelled = false;
    const fallback = getEmbeddedOfficeUrl();
    const loadConfig = async () => {
      try {
        const cfg = await fetchStarOfficeConfig();
        if (cancelled) return;
        if (!cfg.enabled) {
          setOfficeUrl(fallback);
          setPanelMenu(OFFICE_PANEL_MENU);
          return;
        }
        const dynamic = buildEmbeddedOfficeUrl(cfg.officeBaseUrl, cfg.embeddedPath || '/?embed=1');
        setOfficeUrl(dynamic || fallback);
        setPanelMenu(normalizePanelMenu(cfg.panels));
      } catch {
        if (!cancelled) {
          setOfficeUrl(fallback);
          setPanelMenu(OFFICE_PANEL_MENU);
        }
      }
    };
    loadConfig();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data as OfficeMessage | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'open-bella') {
        window.open('/bella', '_blank', 'noopener');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const updateAnchor = () => {
      const container = containerRef.current;
      const iframe = iframeRef.current;
      if (!container || !iframe) return;
      const c = container.getBoundingClientRect();
      const f = iframe.getBoundingClientRect();
      const insetLeft = Math.max(10, Math.round(f.left - c.left + 10));
      const insetTop = Math.max(10, Math.round(f.top - c.top + 10));
      setBtnAnchor({ left: insetLeft, top: insetTop });
    };

    updateAnchor();
    const ro = new ResizeObserver(updateAnchor);
    if (containerRef.current) ro.observe(containerRef.current);
    if (iframeRef.current) ro.observe(iframeRef.current);
    window.addEventListener('resize', updateAnchor);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateAnchor);
    };
  }, [loaded]);

  const postToOffice = (msg: OfficeMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  };

  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full relative overflow-hidden">
      {!loaded && (
        <div className="h-full w-full flex items-center justify-center text-cyan-200/80">
          Loading Star Office UI...
        </div>
      )}

      <OfficeSettingsMenu
        menuOpen={menuOpen}
        settingsLabel={settingsLabel}
        settingsBtnWidth={settingsBtnWidth}
        panelMenu={panelMenu}
        btnAnchor={btnAnchor}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onOpenBella={() => window.open('/bella', '_blank', 'noopener')}
        postToOffice={postToOffice}
      />

      <iframe
        ref={iframeRef}
        id="star-office-iframe"
        title="Star Office UI"
        src={officeUrl}
        className={`w-full h-full border-0 ${loaded ? 'block' : 'hidden'}`}
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
