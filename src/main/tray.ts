import { Tray, Menu, app, nativeImage, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { t, getLang, type Language } from '../shared/i18n';

export interface TrayController {
  show: () => void;
  openPreferences: () => void;
  quit: () => void;
}

let trayRef: Tray | null = null;
let controllerRef: TrayController | null = null;
let trayLang: Language = 'en';

function buildMenu(lang: Language): Menu {
  return Menu.buildFromTemplate([
    { label: t(lang, 'tray.openPanel'), click: () => controllerRef?.show() },
    {
      label: t(lang, 'tray.preferences'),
      click: () => controllerRef?.openPreferences(),
    },
    { type: 'separator' },
    { label: t(lang, 'tray.quit'), click: () => controllerRef?.quit() },
  ]);
}

export function createTray(
  controller: TrayController,
  lang: Language = 'en',
): Tray {
  controllerRef = controller;
  trayLang = getLang(lang);
  const icon = resolveIcon();
  const tray = new Tray(icon);
  tray.setToolTip('Shelf');
  tray.setIgnoreDoubleClickEvents(true);
  trayRef = tray;

  tray.on('click', () => trayRef?.popUpContextMenu(buildMenu(trayLang)));
  tray.on('right-click', () => trayRef?.popUpContextMenu(buildMenu(trayLang)));

  return tray;
}

export function setTrayLanguage(lang: Language): void {
  trayLang = getLang(lang);
}

function resolveIcon(): NativeImage {
  const baseDirs = [
    path.join(process.resourcesPath || '', 'assets'),
    path.join(app.getAppPath(), 'assets'),
  ];
  for (const dir of baseDirs) {
    const p = path.join(dir, 'tray.png');
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        img.setTemplateImage(true);
        return img;
      }
    }
  }
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    ),
  );
}
