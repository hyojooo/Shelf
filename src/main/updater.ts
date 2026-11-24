import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import { logError, logInfo } from './logger';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const updateWindows: Array<() => BrowserWindow | null> = [];
let downloaded = false;

function broadcast(payload: Record<string, unknown>): void {
  for (const getW of updateWindows) {
    const w = getW();
    if (w && !w.isDestroyed()) w.webContents.send(IPC.UPDATE_STATE, payload);
  }
}

export function setupUpdater(getWindow: () => BrowserWindow | null): void {
  if (!updateWindows.includes(getWindow)) updateWindows.push(getWindow);

  autoUpdater.on('update-available', (info) => {
    logInfo(`update available: ${info.version}`);
    downloaded = false;
    broadcast({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    });
  });
  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'not-available' });
  });
  autoUpdater.on('download-progress', (p) => {
    broadcast({ status: 'progress', percent: p.percent });
  });
  autoUpdater.on('update-downloaded', () => {
    downloaded = true;
    broadcast({ status: 'downloaded' });
  });
  autoUpdater.on('error', (e) => {
    logError(e, 'updater');
    broadcast({ status: 'error', message: String(e) });
  });
}

/** 注册额外窗口（如偏好设置）以接收更新状态广播 */
export function registerUpdateWindow(
  getWindow: () => BrowserWindow | null,
): void {
  if (!updateWindows.includes(getWindow)) updateWindows.push(getWindow);
}

export function isUpdateDownloaded(): boolean {
  return downloaded;
}

export async function checkForUpdates(): Promise<unknown> {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (e) {
    logError(e, 'updater');
    broadcast({
      status: 'error',
      message: String(e instanceof Error ? e.message : e),
    });
    return null;
  }
}

export async function downloadUpdate(): Promise<unknown> {
  try {
    downloaded = false;
    return await autoUpdater.downloadUpdate();
  } catch (e) {
    logError(e, 'updater');
    broadcast({
      status: 'error',
      message: String(e instanceof Error ? e.message : e),
    });
    return null;
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
