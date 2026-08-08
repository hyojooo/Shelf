import { Tray, Menu, app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'

// 菜单栏常驻图标：点击图标弹出菜单 → 打开面板 / 偏好设置 / 退出
export interface TrayController {
  show: () => void
  openPreferences: () => void
  quit: () => void
}

export function createTray(controller: TrayController): Tray {
  const icon = resolveIcon()
  const tray = new Tray(icon)
  tray.setToolTip('Shelf 剪切板管理')
  tray.setIgnoreDoubleClickEvents(true)

  const menu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => controller.show() },
    { label: '偏好设置', click: () => controller.openPreferences() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => controller.quit()
    }
  ])

  // macOS：左键点击弹出菜单（菜单内含「偏好设置」「退出」）
  tray.on('click', () => tray.popUpContextMenu(menu))
  // 其它平台右键也弹菜单（macOS 右键默认即弹出）
  tray.on('right-click', () => tray.popUpContextMenu(menu))

  return tray
}

/**
 * 解析菜单栏图标 —— macOS Template Image（透明背景 + 单色剪贴板符号）。
 *
 * 系统会根据菜单栏深/浅色自动反色显示：
 *   - 浅色菜单栏 → 黑色符号
 *   - 深色菜单栏 → 白色符号
 *
 * 图标文件已按正确尺寸产出（@1x=20px / @2x=40px），无需 resize。
 * 生产环境从 extraResources 拷贝的 assets/ 目录读取；
 * 开发环境直接读取项目源码 assets/ 目录。
 */
function resolveIcon(): NativeImage {
  const baseDirs = [
    path.join(process.resourcesPath || '', 'assets'),
    path.join(app.getAppPath(), 'assets'),
  ]
  for (const dir of baseDirs) {
    const p = path.join(dir, 'tray.png')
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p) // 自动加载同目录 tray@2x.png（Retina）
      if (!img.isEmpty()) {
        img.setTemplateImage(true)
        return img // 不 resize！resize 会破坏 template flag 和 @2x 分辨率
      }
    }
  }
  // 兜底：1×1 透明 PNG，保证不崩溃
  return nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  )
}
