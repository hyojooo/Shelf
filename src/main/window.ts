import { BrowserWindow, screen, app } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { IPC, type PanelPosition } from '../shared/types';
import { logInfo } from './logger';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let hideTimer: NodeJS.Timeout | null = null;

// 记录「唤起面板前」的前台应用，用于粘贴时把焦点精确还回去。
// 必须带时间戳：否则托盘打开面板时拿不到源应用，会一直沿用几个小时前的旧值。
let sourceApp = { name: '', at: 0 };
// 面板显示时刻：双击应用图标启动时，系统会先把焦点给 Finder，
// 面板刚 show 就收到 blur —— 这种"闪现即消失"必须忽略
let shownAt = 0;
let sourceProbePausedUntil = 0;
const SOURCE_APP_TTL = 60_000;

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
    // 刚显示时的失焦不算用户主动离开（双击图标启动/系统激活顺序都会触发），
    // 否则面板会"闪现 1 秒就消失"
    if (Date.now() - shownAt < 600) return;
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

/** 等待首屏渲染完成再显示，避免首次启动弹出一个白窗口 */
export function showWhenReady(cb: () => void): void {
  if (!win) return;
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => cb());
  } else {
    cb();
  }
  // 兜底：极端情况下 did-finish-load 不触发也要把窗口露出来
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) cb();
  }, 1200);
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
  // 必须在 show() 之前同步抓取：窗口一旦显示，前台就变成 Shelf 自己了
  captureSourceApp();
  if (position === 'cursor') showAtCursor();
  else showCenter();
  if (!win.isVisible()) win.show();
  // app.hide() 之后需要显式激活应用，否则窗口可能显示但不接收键盘输入
  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();
  shownAt = Date.now();
  win.webContents.send(IPC.VISIBILITY, true);
  // 启动瞬间的激活竞争可能把焦点又推回去，稍后再补一次
  setTimeout(() => {
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.focus();
      win.webContents.focus();
    }
  }, 120);
}

export function hide(): void {
  if (win && win.isVisible()) {
    win.webContents.send(IPC.VISIBILITY, false);
    win.hide();
  }
  // 关键：Shelf 是 accessory 应用（Dock 已隐藏），单靠 win.hide() 不会让应用退出
  // 激活状态，macOS 也就不会把焦点还给用户原来的应用 —— 后续模拟的 ⌘V 会打回
  // 自己（表现就是「粘贴没反应」）。app.hide() 强制让出前台，系统才会激活上一个应用。
  // 但 app.hide() 会隐藏应用的所有窗口：偏好设置窗口还开着时不能调用。
  if (process.platform === 'darwin') {
    const otherVisible = BrowserWindow.getAllWindows().some(
      (w) => w !== win && !w.isDestroyed() && w.isVisible(),
    );
    if (!otherVisible) app.hide();
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
  sourceApp = { name: '', at: 0 };
  if (process.platform !== 'darwin') return;
  // 授权未给时 osascript 会挂起；暂停探测 60s，用户授权后能自动恢复
  if (Date.now() < sourceProbePausedUntil) return;
  // 必须异步：osascript 首次运行冷启动就要几百毫秒，同步会卡住面板显示
  execFile(
    'osascript',
    [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ],
    { timeout: 1500 },
    (err, stdout) => {
      if (err) {
        sourceProbePausedUntil = Date.now() + 60 * 1000;
        logInfo(
          `[source-app] probe failed (${(err.message || String(err)).slice(0, 120)}) — paste falls back to frontmost-check`,
        );
        return;
      }
      const name = String(stdout).trim();
      // 排除自身：从托盘打开面板时前台可能就是 Shelf
      if (name && !/electron|shelf/i.test(name)) {
        sourceApp = { name, at: Date.now() };
        logInfo(`[source-app] captured "${name}"`);
      } else {
        logInfo(`[source-app] frontmost is self ("${name}"), keep previous`);
      }
    },
  );
}

export function getSourceApp(): string {
  if (!sourceApp.name || Date.now() - sourceApp.at > SOURCE_APP_TTL) return '';
  return sourceApp.name;
}
