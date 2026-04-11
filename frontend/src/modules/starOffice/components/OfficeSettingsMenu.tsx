import type { OfficeMessage } from '../types';

interface Props {
  menuOpen: boolean;
  settingsLabel: string;
  settingsBtnWidth: number;
  panelMenu: Array<{ panel: 'memo' | 'guest' | 'status' | 'assets' | 'coords'; label: string }>;
  btnAnchor: { left: number; top: number };
  onToggleMenu: () => void;
  onOpenBella: () => void;
  postToOffice: (msg: OfficeMessage) => void;
}

export default function OfficeSettingsMenu(props: Props) {
  const {
    menuOpen,
    settingsLabel,
    settingsBtnWidth,
    panelMenu,
    btnAnchor,
    onToggleMenu,
    onOpenBella,
    postToOffice,
  } = props;

  return (
    <div className="absolute z-50" style={{ left: `${btnAnchor.left}px`, top: `${btnAnchor.top}px` }}>
      <button
        type="button"
        onClick={onToggleMenu}
        className="text-xs"
        title="Settings"
        style={{
          width: `${settingsBtnWidth}px`,
          height: '34px',
          padding: '0 8px',
          fontFamily: 'ArkPixel, monospace',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          border: '2px solid #3e2723',
          borderRadius: '6px',
          background: '#5d4037',
          color: '#f8e8cf',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
          textShadow: '0 1px 0 rgba(0,0,0,0.5)',
          letterSpacing: '0.5px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'clip',
        }}
      >
        {settingsLabel}
      </button>
      {menuOpen && (
        <div className="mt-2 rounded-xl border border-cyan-500/30 bg-black/70 backdrop-blur-sm p-2 space-y-2 min-w-[180px]">
          <button type="button" onClick={onOpenBella} className="w-full cyberpunk-btn-outline text-xs">
            打开 Bella
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => postToOffice({ type: 'set-lang', lang: 'zh' })} className="flex-1 cyberpunk-btn-outline text-xs">
              CN
            </button>
            <button type="button" onClick={() => postToOffice({ type: 'set-lang', lang: 'en' })} className="flex-1 cyberpunk-btn-outline text-xs">
              EN
            </button>
          </div>
          <div className="flex flex-col gap-1 pt-1 border-t border-cyan-500/30 mt-1">
            {panelMenu.map((item) => (
              <button
                key={item.panel}
                type="button"
                onClick={() => postToOffice({ type: 'toggle-panel', panel: item.panel })}
                className="w-full cyberpunk-btn-outline text-xs"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
