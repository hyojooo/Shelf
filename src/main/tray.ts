import { Tray, Menu, app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'

// 菜单栏常驻图标（功能 5）：托盘 + 右键菜单，提供打开面板 / 设置 / 退出
export interface TrayController {
  show: () => void
  openSettings: () => void
  quit: () => void
}

export function createTray(controller: TrayController): Tray {
  const icon = resolveIcon()
  const tray = new Tray(icon)
  tray.setToolTip('Shelf 剪切板管理')
  tray.setIgnoreDoubleClickEvents(true)

  const menu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => controller.show() },
    { label: '设置', click: () => controller.openSettings() },
    { type: 'separator' },
    {
      label: '退出 Shelf',
      click: () => controller.quit()
    }
  ])
  tray.setContextMenu(menu)
  // macOS 左键点击切换面板；其它平台左键也切换
  tray.on('click', () => controller.show())

  return tray
}

function resolveIcon(): NativeImage {
  // 优先使用打包资源中的图标；缺失时使用内置兜底（用户应补充 assets/icon.png）
  const candidates = [
    path.join(app.getPath('userData'), 'tray.png'),
    path.join(process.resourcesPath || '', 'tray.png')
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return nativeImage.createFromPath(c)
  }
  // 1x1 透明 PNG 兜底，保证不崩溃（仅开发期占位）
  return nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  )
}
