export type ClipType = 'text' | 'image';

export type ClipTab = 'all' | 'text' | 'image' | 'favorite';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface BaseClip {
  id: string;
  type: ClipType;

  hash: string;

  createdAt: number;

  updatedAt: number;
  favorite: boolean;

  size: number;
}

export interface TextClip extends BaseClip {
  type: 'text';
  text: string;

  preview: string;
}

export interface ImageClip extends BaseClip {
  type: 'image';
  format: 'jpeg' | 'png';
  width: number;
  height: number;

  thumb: string;

  file: string;
}

export type Clip = TextClip | ImageClip;

export type PanelPosition = 'cursor' | 'center';

export type Language = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru' | 'vi';

export interface Settings {
  globalShortcut: string;

  maxItems: number;

  cleanupBatch: number;

  launchAtLogin: boolean;

  theme: ThemeMode;

  pasteOnDoubleClick: boolean;

  panelPosition: PanelPosition;

  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  globalShortcut: 'CommandOrControl+Shift+V',
  maxItems: 500,
  cleanupBatch: 200,
  launchAtLogin: false,
  theme: 'system',
  pasteOnDoubleClick: true,
  panelPosition: 'center',
  language: 'en',
};

export const IPC = {
  GET_ALL: 'clip:getAll',
  FAVORITE: 'clip:favorite',
  DELETE: 'clip:delete',
  CLEAR: 'clip:clear',
  COPY: 'clip:copy',
  PASTE: 'clip:paste',
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  CHECK_UPDATE: 'updater:check',
  GET_VERSION: 'app:get-version',
  GET_IMAGE_URL: 'app:get-image-url',
  QUIT: 'app:quit',

  UPDATED: 'clip:updated',
  SETTINGS_UPDATED: 'settings:updated',
  UPDATE_STATE: 'updater:state',
  OPEN_SETTINGS: 'panel:open-settings',
  VISIBILITY: 'panel:visibility',
  SHORTCUT_ERROR: 'settings:shortcut-error',

  INSTALL_UPDATE: 'app:install-update',
} as const;
