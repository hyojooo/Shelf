// 全局共享类型定义（主进程 / 预加载 / 渲染进程通用）
// 该文件仅包含类型，运行时无副作用，可被任意模块以 `import type` 引入。

export type ClipType = 'text' | 'image'

export type ClipTab = 'all' | 'text' | 'image' | 'favorite'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface BaseClip {
  id: string
  type: ClipType
  /** 内容 SHA-256 哈希，用于自动去重 */
  hash: string
  /** 首次写入的时间戳（ms），清理策略以此为准 */
  createdAt: number
  /** 最近一次更新/复现的时间戳（ms），列表排序以此为准 */
  updatedAt: number
  favorite: boolean
  /** 存储占用字节数（文本为字符数估算，图片为压缩后文件大小） */
  size: number
}

export interface TextClip extends BaseClip {
  type: 'text'
  text: string
  /** 列表展示用的一行预览 */
  preview: string
}

export interface ImageClip extends BaseClip {
  type: 'image'
  format: 'jpeg' | 'png'
  width: number
  height: number
  /** 列表用小型缩略图 dataURL（已压缩），避免每条都读盘 */
  thumb: string
  /** 磁盘文件名（位于 userData/images/ 下） */
  file: string
}

export type Clip = TextClip | ImageClip

export type PanelPosition = 'cursor' | 'center'

export interface Settings {
  /** 全局唤起快捷键，如 CommandOrControl+Shift+V */
  globalShortcut: string
  /** 最大存储条数，默认 500 */
  maxItems: number
  /** 超出后单次清理的最多条数，默认 200 */
  cleanupBatch: number
  /** 是否开机自启动 */
  launchAtLogin: boolean
  /** 主题：跟随系统 / 浅色 / 深色 */
  theme: ThemeMode
  /** 双击是否直接粘贴到焦点窗口 */
  pasteOnDoubleClick: boolean
  /** 面板弹出位置：跟随光标 / 屏幕居中（默认 center） */
  panelPosition: PanelPosition
}

export const DEFAULT_SETTINGS: Settings = {
  globalShortcut: 'CommandOrControl+Shift+V',
  maxItems: 500,
  cleanupBatch: 200,
  launchAtLogin: false,
  theme: 'system',
  pasteOnDoubleClick: true,
  panelPosition: 'center'
}

// 主进程 -> 渲染进程 事件
export const IPC = {
  // 渲染进程 -> 主进程（invoke）
  GET_ALL: 'clip:getAll',
  FAVORITE: 'clip:favorite',
  DELETE: 'clip:delete',
  CLEAR: 'clip:clear',
  COPY: 'clip:copy',
  PASTE: 'clip:paste',
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  CHECK_UPDATE: 'updater:check',
  QUIT: 'app:quit',
  // 主进程 -> 渲染进程（send / on）
  UPDATED: 'clip:updated',
  SETTINGS_UPDATED: 'settings:updated',
  UPDATE_STATE: 'updater:state',
  OPEN_SETTINGS: 'panel:open-settings',
  VISIBILITY: 'panel:visibility',
  SHORTCUT_ERROR: 'settings:shortcut-error',
  // 渲染进程 -> 主进程（一次性）
  INSTALL_UPDATE: 'app:install-update'
} as const
