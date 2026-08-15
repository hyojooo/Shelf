import { BrowserWindow, screen, app } from 'electron';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PanelPosition } from '../shared/types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;

let lastSourceApp = '';

function getPreloadPath(): string {
  return path.join(app.getAppPath(), 'out', 'preload', 'index.js');
}

export function createPanelWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 680,
    height: 520,
    minWidth: 560,
    minHeight: 380,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.on('blur', () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hide(), 120);
  });
  win.on('focus', () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  });

  return win;
}

function showAtCursor(): void {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const { width, height } = win.getBounds();
  const display = screen.getDisplayNearestPoint(cursor);
  let x = Math.round(cursor.x - width / 2);
  let y = Math.round(cursor.y + 24);
  x = Math.max(
    display.workArea.x,
    Math.min(x, display.workArea.x + display.workArea.width - width),
  );
  y = Math.max(
    display.workArea.y,
    Math.min(y, display.workArea.y + display.workArea.height - height),
  );
  win.setBounds({ x, y, width, height });
}

function showCenter(): void {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const { width, height } = win.getBounds();
  const display = screen.getDisplayNearestPoint(cursor);
  const x = Math.round(
    display.workArea.x + (display.workArea.width - width) / 2,
  );
  const y = Math.round(
    display.workArea.y + (display.workArea.height - height) / 2,
  );
  win.setBounds({ x, y, width, height });
}

export function showPanel(position: PanelPosition = 'center'): void {
  if (!win) return;
  captureSourceApp();
  if (position === 'cursor') showAtCursor();
  else showCenter();
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('panel:visibility', true);
}

export function hide(): void {
  if (win && win.isVisible()) {
    win.webContents.send('panel:visibility', false);
    win.hide();
  }
}

export function toggle(position?: PanelPosition): void {
  if (win && win.isVisible()) hide();
  else showPanel(position);
}

export function isVisible(): boolean {
  return !!win && win.isVisible();
}

export function getWindow(): BrowserWindow | null {
  return win;
}

function captureSourceApp(): void {
  if (process.platform !== 'darwin') return;
  try {
    const name = execFileSync(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get name of first process whose frontmost is true',
      ],
      { timeout: 1000 },
    )
      .toString()
      .trim();

    if (name && !/electron|shelf/i.test(name)) lastSourceApp = name;
  } catch {}
}

export function getSourceApp(): string {
  return lastSourceApp;
}
