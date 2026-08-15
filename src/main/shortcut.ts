import { globalShortcut, dialog } from 'electron';

export function isRegistered(accelerator: string): boolean {
  try {
    return globalShortcut.isRegistered(accelerator);
  } catch {
    return false;
  }
}

export function registerShortcut(accelerator: string, cb: () => void): boolean {
  try {
    if (globalShortcut.isRegistered(accelerator)) return false;
    return globalShortcut.register(accelerator, cb);
  } catch {
    return false;
  }
}

export function unregister(accelerator: string): void {
  try {
    globalShortcut.unregister(accelerator);
  } catch {}
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}

export async function warnConflict(accelerator: string): Promise<void> {
  if (isRegistered(accelerator)) {
    await dialog.showMessageBox({
      type: 'warning',
      title: '快捷键冲突',
      message: `快捷键 "${accelerator}" 已被占用，请更换其它组合。`,
      buttons: ['知道了'],
    });
  }
}
