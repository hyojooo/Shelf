import { globalShortcut, dialog } from 'electron'

// 全局快捷键注册（功能 2 / 功能 6）
// 返回 false 表示注册失败（常与系统或其它程序冲突），由调用方提示用户

export function isRegistered(accelerator: string): boolean {
  try {
    return globalShortcut.isRegistered(accelerator)
  } catch {
    return false
  }
}

export function registerShortcut(accelerator: string, cb: () => void): boolean {
  try {
    if (globalShortcut.isRegistered(accelerator)) return false
    return globalShortcut.register(accelerator, cb)
  } catch {
    return false
  }
}

export function unregister(accelerator: string): void {
  try {
    globalShortcut.unregister(accelerator)
  } catch {
    /* ignore */
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
}

/** 校验快捷键字符串是否合法（交给 Electron 实际注册时检测，这里做基础提示） */
export async function warnConflict(accelerator: string): Promise<void> {
  if (isRegistered(accelerator)) {
    await dialog.showMessageBox({
      type: 'warning',
      title: '快捷键冲突',
      message: `快捷键 "${accelerator}" 已被占用，请更换其它组合。`,
      buttons: ['知道了']
    })
  }
}
