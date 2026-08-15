import { BrowserWindow, app } from 'electron';
import path from 'node:path';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let prefWin: BrowserWindow | null = null;

function getPreloadPath(): string {
  return path.join(app.getAppPath(), 'out', 'preload', 'index.js');
}

export function openPreferencesWindow(): void {
  if (prefWin && !prefWin.isDestroyed()) {
    prefWin.show();
    prefWin.focus();
    return;
  }

  prefWin = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 480,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    title: '偏好设置 · Shelf',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  prefWin.setAlwaysOnTop(true, 'floating', 1);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void prefWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}/preferences.html`);
  } else {
    void prefWin.loadFile(
      path.join(app.getAppPath(), 'out', 'renderer', 'preferences.html'),
    );
  }

  prefWin.once('ready-to-show', () => {
    prefWin?.show();
    prefWin?.focus();
  });

  prefWin.on('closed', () => {
    prefWin = null;
  });
}

/** 供托盘 / 升级逻辑查询窗口是否已打开 */
export function isPreferencesOpen(): boolean {
  return !!prefWin && !prefWin.isDestroyed();
}

/** 供更新模块获取偏好窗口引用（用于广播 UPDATE_STATE） */
export function getPreferencesWindow(): BrowserWindow | null {
  return prefWin && !prefWin.isDestroyed() ? prefWin : null;
}
