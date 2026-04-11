import type { OfficePanel } from './types';

export function getStarOfficeBaseUrl(): string {
  const raw = (import.meta.env.VITE_STAR_OFFICE_URL || 'http://127.0.0.1:19000').trim();
  return raw.replace(/\/$/, '');
}

export function getEmbeddedOfficeUrl(): string {
  return `${getStarOfficeBaseUrl()}/?embed=1`;
}

export function buildEmbeddedOfficeUrl(officeBaseUrl: string, embeddedPath = '/?embed=1'): string {
  const base = (officeBaseUrl || '').trim().replace(/\/$/, '');
  const path = embeddedPath.startsWith('/') ? embeddedPath : `/${embeddedPath}`;
  return `${base}${path}`;
}

export function getSettingsLabel(lang: 'zh' | 'en'): string {
  return lang === 'zh' ? '设置' : 'Setting';
}

export function getSettingsButtonWidth(lang: 'zh' | 'en'): number {
  return lang === 'zh' ? 96 : 132;
}

export const OFFICE_PANEL_MENU: Array<{ panel: OfficePanel; label: string }> = [
  { panel: 'memo', label: '昨日小记' },
  { panel: 'guest', label: '访客列表' },
  { panel: 'status', label: '状态栏' },
  { panel: 'assets', label: '装修侧边栏' },
  { panel: 'coords', label: '坐标 / 视野' },
];

export function normalizePanelMenu(panels?: string[]): Array<{ panel: OfficePanel; label: string }> {
  if (!panels || panels.length === 0) return OFFICE_PANEL_MENU;
  const allowed = new Set<OfficePanel>(['memo', 'guest', 'status', 'assets', 'coords']);
  const byPanel = new Map(OFFICE_PANEL_MENU.map((item) => [item.panel, item]));
  const normalized = panels
    .map((p) => p.trim())
    .filter((p): p is OfficePanel => allowed.has(p as OfficePanel))
    .map((p) => byPanel.get(p))
    .filter((v): v is { panel: OfficePanel; label: string } => !!v);
  return normalized.length > 0 ? normalized : OFFICE_PANEL_MENU;
}
