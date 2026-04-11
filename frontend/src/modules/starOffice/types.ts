export type OfficePanel = 'memo' | 'guest' | 'status' | 'assets' | 'coords';

export type OfficeMessage =
  | { type: 'open-bella' }
  | { type: 'set-lang'; lang: 'zh' | 'en' }
  | { type: 'toggle-panel'; panel: OfficePanel }
  | { type: string; [k: string]: unknown };

export interface UploadedOfficeMessageEvent extends MessageEvent {
  data: OfficeMessage | undefined;
}
