import { BrowserWindow, screen, app } from 'electron'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { PanelPosition } from '../shared/types'

// 弹窗面板窗口（功能 2）：全局快捷键唤起、始终置顶、失焦自动隐藏
const isDev = !!process.env.VITE_DEV_SERVER_URL
let win: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null
/** 唤起面板前处于前台的「源应用」，粘贴时需精准回切到这里 */
let lastSourceApp = ''

/** 获取 preload 脚本的绝对路径（兼容开发 / 生产模式） */
function getPreloadPath(): string {
  // electron-vite 开发模式：main 输出到 out/main/，preload 到 out/preload/
  // 生产模式：同目录结构
  return path.join(app.getAppPath(), 'out', 'preload', 'index.js')
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
      sandbox: false
    }
  })

  // 始终置顶（floating 级别，位于绝大多数窗口之上）
  win.setAlwaysOnTop(true, 'floating', 1)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // 失焦自动隐藏（功能 2），轻微延时避免点击面板内元素误触
  win.on('blur', () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => hide(), 120)
  })
  win.on('focus', () => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  })

  return win
}

/** 在鼠标光标附近弹出面板 */
function showAtCursor(): void {
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const { width, height } = win.getBounds()
  const display = screen.getDisplayNearestPoint(cursor)
  let x = Math.round(cursor.x - width / 2)
  let y = Math.round(cursor.y + 24)
  x = Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - width))
  y = Math.max(display.workArea.y, Math.min(y, display.workArea.y + display.workArea.height - height))
  win.setBounds({ x, y, width, height })
}

/** 在当前屏幕工作区居中弹出面板 */
function showCenter(): void {
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const { width, height } = win.getBounds()
  const display = screen.getDisplayNearestPoint(cursor)
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  win.setBounds({ x, y, width, height })
}

/**
 * 根据设置的面板位置模式显示面板
 * @param position 'cursor' 跟随光标 | 'center' 屏幕居中（默认）
 */
export function showPanel(position: PanelPosition = 'center'): void {
  if (!win) return
  captureSourceApp() // 在面板抢焦点前先记录源应用
  if (position === 'cursor') showAtCursor()
  else showCenter()
  if (!win.isVisible()) win.show()
  win.focus()
  win.webContents.send('panel:visibility', true)
}

export function hide(): void {
  if (win && win.isVisible()) {
    win.webContents.send('panel:visibility', false)
    win.hide()
  }
}

export function toggle(position?: PanelPosition): void {
  if (win && win.isVisible()) hide()
  else showPanel(position)
}

export function isVisible(): boolean {
  return !!win && win.isVisible()
}

export function getWindow(): BrowserWindow | null {
  return win
}

/** 在窗口抢占焦点前，记录当前前台应用（即用户原本正在操作的 App） */
function captureSourceApp(): void {
  if (process.platform !== 'darwin') return
  try {
    const name = execFileSync(
      'osascript',
      ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'],
      { timeout: 1000 }
    )
      .toString()
      .trim()
    // 排除自身，避免把面板当源
    if (name && !/electron|shelf/i.test(name)) lastSourceApp = name
  } catch {
    /* 偶发读取失败忽略 */
  }
}

/** 供粘贴逻辑获取源应用名称 */
export function getSourceApp(): string {
  return lastSourceApp
}
