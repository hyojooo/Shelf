import {
  app,
  ipcMain,
  clipboard,
  nativeImage,
  BrowserWindow,
  dialog,
} from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  IPC,
  isValidAccelerator,
  type Clip,
  type Settings,
} from '../shared/types';
import { installCrashHandlers, logError, logInfo } from './logger';
import { loadSettings, getSettings, saveSettings } from './settings';
import { ClipStore } from './store';
import {
  startClipboardMonitor,
  stopClipboardMonitor,
  suppressNextCapture,
} from './clipboard';
import {
  createPanelWindow,
  toggle,
  hide,
  getWindow,
  showPanel,
  showWhenReady,
  getSourceApp,
} from './window';
import { createTray, setTrayLanguage } from './tray';
import { openPreferencesWindow, getPreferencesWindow } from './preferences';
import { registerShortcut, unregister, unregisterAll } from './shortcut';
import {
  setupUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  isUpdateDownloaded,
  registerUpdateWindow,
} from './updater';

installCrashHandlers();

// Single-instance lock: prevent multiple Shelf processes on Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
}

app.on('second-instance', () => {
  const w = getWindow();
  if (!w) return;
  if (w.isMinimized()) w.restore();
  // 双击应用图标会先启动一个新进程再被单实例锁拦下，这期间 Finder 在抢焦点。
  // 稍等启动方激活完成再显示面板，避免「弹出即被隐藏」。
  setTimeout(() => showPanel(getSettings().panelPosition), 200);
});

let store: ClipStore;
let currentAccelerator = '';
let installing = false;
let quitting = false;
let onboardingPending: { shortcut: string } | null = null;
let pastePermWarned = false;

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const onboardingFile = () => path.join(app.getPath('userData'), 'onboarded');

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function setShortcutCapture(active: boolean): void {
  if (!currentAccelerator) return;
  if (active) {
    // 捕获期间必须让出全局快捷键，否则用户按下「原来的组合」会被系统直接吃掉
    unregister(currentAccelerator);
  } else {
    // 若保存时已注册了新键，registerShortcut 会因 isRegistered 直接返回，不会重复注册
    registerShortcut(currentAccelerator, () =>
      toggle(getSettings().panelPosition),
    );
  }
}

function applyShortcut(accel: string): boolean {
  if (currentAccelerator) unregister(currentAccelerator);
  const ok = registerShortcut(accel, () => toggle(getSettings().panelPosition));
  if (ok) {
    currentAccelerator = accel;
  } else if (currentAccelerator) {
    registerShortcut(currentAccelerator, () =>
      toggle(getSettings().panelPosition),
    );
  }
  return ok;
}

/** 返回是否真的写入成功；失败时不继续模拟粘贴按键，避免把旧剪贴板内容粘出去 */
function setClipboard(clip: Clip): boolean {
  try {
    if (clip.type === 'text') {
      clipboard.writeText(clip.text);
    } else {
      const p = store.getImagePath(clip.id);
      if (!p) {
        notifyPasteError('image file missing');
        return false;
      }
      const img = nativeImage.createFromPath(p);
      if (img.isEmpty()) {
        notifyPasteError('image file empty');
        return false;
      }
      clipboard.writeImage(img);
    }
    suppressNextCapture();
    return true;
  } catch (e) {
    notifyPasteError(String(e));
    return false;
  }
}

function notifyPasteError(detail: string): void {
  console.error('[paste]', detail);
  void logError(new Error(`paste failed: ${detail}`), 'paste');
  broadcast(IPC.PASTE_ERROR, detail);

  const needsPermission =
    /not authorized|assistive|accessibility|-1719|-1743|not allowed|permission|automation/i.test(
      detail,
    );
  if (
    process.platform === 'darwin' &&
    needsPermission &&
    !pastePermWarned
  ) {
    pastePermWarned = true;
    void dialog
      .showMessageBox({
        type: 'warning',
        title: 'Shelf',
        message: 'Shelf 需要「辅助功能 / 自动化」权限才能把内容粘贴到当前应用。',
        detail:
          '请在「系统设置 → 隐私与安全性 → 辅助功能」与「自动化」中勾选 Shelf，然后重新打开应用。也可以直接使用「复制」后手动按 ⌘V。',
        buttons: ['打开系统设置', '知道了'],
        defaultId: 0,
      })
      .then((r) => {
        if (r.response === 0) {
          execFile('open', [
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
          ]);
        }
      });
  }
}

function sendPasteKeystroke(targetApp: string): void {
  if (process.platform === 'darwin') {
    // 智能发键：面板 hide 后系统通常已把焦点还给目标应用——此时直接发 ⌘V 最安全
    //（不扰乱用户窗口状态）。只有当前台还是 Shelf 自己（焦点没归还）时，
    // 才用打开面板前记录的进程名强制切回去。targetApp 经 argv 传入，无需转义。
    const script = `on run argv
  set targetName to item 1 of argv
  set fp to ""
  tell application "System Events"
    try
      set fp to name of first application process whose frontmost is true
      if fp is "Electron" or fp is "Shelf" or fp is "electron" then
        set frontmost of (first application process whose name is targetName) to true
        delay 0.25
        set fp to name of first application process whose frontmost is true
      end if
    end try
    -- key code 9 = 字母 V 的物理键码；字符模式的 keystroke 会被
    -- 中文等输入法拦截转换，物理键码事件则直达应用
    key code 9 using {command down}
  end tell
  return fp
end run`;
    logInfo(
      `[paste] keystroke: frontmost-check, fallback target=${targetApp || '(none)'}`,
    );
    execFile(
      'osascript',
      ['-e', script, targetApp || ''],
      { timeout: 5000 },
      (err, stdout, stderr) => {
        if (err) {
          notifyPasteError(String(stderr || err.message || err));
        } else {
          // 回报发键那一刻的最终前台进程：delivered 但前台不是目标应用 = 焦点问题
          logInfo(
            `[paste] keystroke delivered, frontmost at key-time="${String(stdout).trim()}"`,
          );
        }
      },
    );
  } else if (process.platform === 'win32') {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Start-Sleep -Milliseconds 120; (New-Object -ComObject WScript.Shell).SendKeys("^v")',
      ],
      { timeout: 5000 },
      (err, _o, stderr) => {
        if (err) notifyPasteError(String(stderr || err.message || err));
      },
    );
  }
}

function openSettings(): void {
  openPreferencesWindow();
}

async function bootstrap(): Promise<void> {
  const settings = await loadSettings();
  store = new ClipStore(
    app.getPath('userData'),
    settings.maxItems,
    settings.cleanupBatch,
  );
  await store.init();

  // 首次启动保留 Dock 图标并弹出主窗口；开机自启（--hidden）不弹窗
  const firstRun =
    !existsSync(onboardingFile()) && !process.argv.includes('--hidden');

  createPanelWindow();
  setupUpdater(getWindow);
  registerUpdateWindow(getPreferencesWindow);
  try {
    // 顺序关键：必须在应用还是 regular（有 Dock 图标）时创建 NSStatusItem，
    // 否则部分 macOS 版本上状态栏图标不会挂上。
    createTray(
      {
        show: () => showPanel(getSettings().panelPosition),
        openPreferences: openSettings,
        quit: () => app.quit(),
      },
      settings.language,
    );
  } catch (e) {
    // 托盘创建失败会让应用变成「完全看不见」，必须留痕并明确告知
    void logError(e, 'tray');
    dialog.showErrorBox('Shelf', `菜单栏图标创建失败：${String(e)}`);
  }
  if (process.platform === 'darwin' && !firstRun) app.dock?.hide();

  applyShortcut(settings.globalShortcut);
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    args: ['--hidden'],
  });

  startClipboardMonitor(store);
  store.subscribe((clips) => broadcast(IPC.UPDATED, clips));

  if (firstRun) {
    onboardingPending = { shortcut: settings.globalShortcut };
    showWhenReady(() => {
      showPanel(settings.panelPosition);
      // 同时广播；renderer 挂载竞态由 GET_ONBOARDING_STATE 主动查询兜底
      broadcast(IPC.FIRST_RUN, onboardingPending);
    });
  }

  // 预热 osascript（首次冷启动数百毫秒）并提前触发 System Events 授权弹窗，
  // 避免用户第一次唤起面板时源应用捕获因 ETIMEDOUT 而失败
  if (process.platform === 'darwin') {
    execFile(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      { timeout: 5000 },
      () => {},
    );
  }

  // 启动后自动检查更新（README 承诺的行为），之后每 6 小时一次
  if (!isDev) {
    setTimeout(() => void checkForUpdates(), 4000);
    setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000).unref();
  }

  // —— IPC 处理 ——
  const validId = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length < 200;

  ipcMain.handle(IPC.GET_ALL, () => store.getClips());

  ipcMain.handle(IPC.FAVORITE, async (_e, payload: unknown) => {
    const p = payload as { id?: unknown; favorite?: unknown } | null;
    if (!validId(p?.id) || typeof p?.favorite !== 'boolean') return false;
    await store.setFavorite(p.id, p.favorite);
    return true;
  });

  ipcMain.handle(IPC.DELETE, async (_e, payload: unknown) => {
    const id = (payload as { id?: unknown } | null)?.id;
    if (!validId(id)) return false;
    await store.deleteClip(id);
    return true;
  });

  ipcMain.handle(IPC.CLEAR, async () => {
    await store.clearAll();
    return true;
  });

  ipcMain.handle(IPC.COPY, (_e, payload: unknown) => {
    const id = (payload as { id?: unknown } | null)?.id;
    if (!validId(id)) return false;
    const clip = store.getClips().find((c) => c.id === id);
    return clip ? setClipboard(clip) : false;
  });

  ipcMain.handle(IPC.PASTE, (_e, payload: unknown) => {
    const id = (payload as { id?: unknown } | null)?.id;
    if (!validId(id)) return false;
    const clip = store.getClips().find((c) => c.id === id);
    if (!clip) return false;
    // 写剪贴板不需要焦点，立即执行；hide 之后只需等焦点归还给目标应用再发 ⌘V。
    // 150ms 是给 macOS 完成焦点切换留的余量（原 60ms 经常抢在切换前）。
    if (!setClipboard(clip)) return false;
    logInfo(
      `[paste] clipboard set: ${
        clip.type === 'text' ? JSON.stringify(clip.text.slice(0, 40)) : '(image)'
      }`,
    );
    hide();
    const targetApp = getSourceApp();
    logInfo(
      `[paste] begin: type=${clip.type} target=${targetApp || '(unknown)'}`,
    );
    setTimeout(() => sendPasteKeystroke(targetApp), 150);
    return true;
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());

  ipcMain.handle(IPC.UPDATE_SETTINGS, async (_e, raw: unknown) => {
    const r = (raw ?? {}) as Partial<Settings>;
    const partial: Partial<Settings> = {};

    if (typeof r.maxItems === 'number' && Number.isFinite(r.maxItems))
      partial.maxItems = clampInt(r.maxItems, 10, 100_000);
    if (typeof r.cleanupBatch === 'number' && Number.isFinite(r.cleanupBatch))
      partial.cleanupBatch = clampInt(r.cleanupBatch, 1, 10_000);
    if (typeof r.launchAtLogin === 'boolean')
      partial.launchAtLogin = r.launchAtLogin;
    if (typeof r.pasteOnDoubleClick === 'boolean')
      partial.pasteOnDoubleClick = r.pasteOnDoubleClick;
    if (r.theme === 'system' || r.theme === 'light' || r.theme === 'dark')
      partial.theme = r.theme;
    if (r.panelPosition === 'center' || r.panelPosition === 'cursor')
      partial.panelPosition = r.panelPosition;
    if (
      typeof r.language === 'string' &&
      ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru', 'vi'].includes(r.language)
    )
      partial.language = r.language as Settings['language'];
    if (isValidAccelerator(r.globalShortcut))
      partial.globalShortcut = r.globalShortcut;

    // 先注册快捷键，成功才落盘：否则重启后会用上一个冲突的键
    if (partial.globalShortcut) {
      const ok = applyShortcut(partial.globalShortcut);
      if (!ok) {
        broadcast(IPC.SHORTCUT_ERROR, partial.globalShortcut);
        delete partial.globalShortcut;
      }
    }

    const next =
      Object.keys(partial).length > 0
        ? await saveSettings(partial)
        : getSettings();

    if (typeof partial.launchAtLogin === 'boolean') {
      app.setLoginItemSettings({
        openAtLogin: partial.launchAtLogin,
        args: ['--hidden'],
      });
    }
    if (partial.maxItems !== undefined || partial.cleanupBatch !== undefined) {
      store.setLimits(next.maxItems, next.cleanupBatch);
    }
    if (partial.language) setTrayLanguage(partial.language);

    // 广播到所有窗口：偏好设置窗口与主面板各自持有独立的 zustand store
    broadcast(IPC.SETTINGS_UPDATED, next);
    return next;
  });

  ipcMain.handle(IPC.CHECK_UPDATE, () => checkForUpdates());
  ipcMain.handle(IPC.DOWNLOAD_UPDATE, () => downloadUpdate());
  ipcMain.handle(IPC.GET_VERSION, () => app.getVersion());
  ipcMain.handle(IPC.GET_IMAGE_URL, (_e, payload: unknown) => {
    const id = (payload as { id?: unknown } | null)?.id;
    if (!validId(id)) return '';
    const p = store.getImagePath(id);
    return p ? pathToFileURL(p).href : '';
  });
  ipcMain.handle(IPC.QUIT, () => {
    app.quit();
    return true;
  });
  ipcMain.handle(IPC.FINISH_ONBOARDING, () => {
    try {
      writeFileSync(onboardingFile(), new Date().toISOString(), 'utf8');
    } catch (e) {
      void logError(e, 'onboarding');
    }
    onboardingPending = null;
    if (process.platform === 'darwin') app.dock?.hide();
    return true;
  });
  ipcMain.handle(IPC.GET_ONBOARDING_STATE, () => onboardingPending);

  ipcMain.on(IPC.SHORTCUT_CAPTURE, (_e, active: unknown) => {
    setShortcutCapture(active === true);
  });

  ipcMain.on(IPC.INSTALL_UPDATE, () => {
    if (!isUpdateDownloaded() || installing) return;
    installing = true;
    // 先落盘再退出安装，避免 before-quit 的异步 flush 与安装流程互抢
    void store.flush().finally(() => quitAndInstall());
  });
}

app
  .whenReady()
  .then(bootstrap)
  .catch((e) => {
    void logError(e, 'bootstrap');
    // 启动失败时不能静默无 UI，否则用户看到的就是「装了却什么都没有」
    dialog.showErrorBox(
      'Shelf',
      `启动失败：${e instanceof Error ? e.message : String(e)}`,
    );
  });

app.on('before-quit', (e) => {
  if (quitting || installing) return;
  quitting = true;
  // Electron 不会等待异步监听器：必须阻止默认退出，flush 完成后显式 exit
  e.preventDefault();
  void (async () => {
    try {
      stopClipboardMonitor();
      unregisterAll();
      if (store) await store.flush();
    } catch (err) {
      console.error('[quit] flush failed', err);
    }
    app.exit(0);
  })();
});

// 托盘常驻：关闭最后一个窗口不退出应用
app.on('window-all-closed', () => {
  /* noop */
});
