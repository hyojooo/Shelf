import { Tray, Menu, app, nativeImage, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { t, getLang, type Language } from '../shared/i18n';
import { logInfo } from './logger';

export interface TrayController {
  show: () => void;
  openPreferences: () => void;
  quit: () => void;
}

let trayRef: Tray | null = null;
let controllerRef: TrayController | null = null;
let trayLang: Language = 'en';

// macOS 菜单栏图标：黑色 template image（系统按菜单栏明暗自动着色）。
// 用户实测：绿色实体图标可见但太扎眼；黑色 template 与系统其它菜单栏图标风格一致。
// 为保证视觉居中，图形在 40x40 画布里按 alpha 包围盒做了垂直居中校正。
const MAC_ICON_2X =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAmklEQVR42u2Y0QnAIAxEHcS1OlYWcawsYv1IwY9WDFo95A7uT/CJuUASAkU1dRVrcf6w2pltasHVkNuUO01AuC+OxdIJMGq1u6IHbgXYG2gXpGyAeyzeukrWx/508tZr/aJrUbN3JZ6ABEQF1Mk9bzqgWEuYYWENEpApZopZgwQ8I8W6ElAG08ovhgGEn+rg52L4zQL8boY6SjdSMOFmYX2KTQAAAABJRU5ErkJggg==';

// Windows / Linux 按原样渲染，白色图标在深色任务栏上才看得清
const WIN_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAdElEQVR42mP4//8/AzUxA70NtPiPCSwoMXAVFgNXkWJgKBD3QjWB8DEsBh5Dku+F6sFqYO9/8kEvNgNhtpMaETBfYDVwFRkGrhoQAx8REW6PBtSFo16mnZcfDagLH0HxKhLxI2SXo5c0j8goGB4hlzhUL7EB+tcnL5NSYeYAAAAASUVORK5CYII=';

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
  const { icon, source } = resolveIcon();
  const size = icon.getSize();
  logInfo(
    `[tray] creating: platform=${process.platform} source=${source} size=${size.width}x${size.height} empty=${icon.isEmpty()}`,
  );
  const tray = new Tray(icon);
  tray.setToolTip('Shelf');
  tray.setIgnoreDoubleClickEvents(true);
  trayRef = tray;

  // 左键也弹出菜单（否则用户点图标毫无反应，会以为应用没启动）
  tray.on('click', () => trayRef?.popUpContextMenu(buildMenu(trayLang)));
  tray.on('right-click', () => trayRef?.popUpContextMenu(buildMenu(trayLang)));

  // 自检：图标实际落在屏幕上的位置。bounds 全 0 = 系统没有把它放上状态栏。
  setTimeout(() => {
    try {
      const b = tray.getBounds();
      logInfo(
        `[tray] bounds x=${b.x} y=${b.y} w=${b.width} h=${b.height} destroyed=${tray.isDestroyed()}`,
      );
    } catch (e) {
      logInfo(`[tray] bounds probe failed: ${String(e)}`);
    }
  }, 1200);

  return tray;
}

export function setTrayLanguage(lang: Language): void {
  trayLang = getLang(lang);
}

function resolveIcon(): { icon: NativeImage; source: string } {
  if (process.platform === 'darwin') {
    // 40x40 + scaleFactor:2 => 逻辑 20x20；template image 由系统自动适配明暗菜单栏
    const img = nativeImage.createFromBuffer(
      Buffer.from(MAC_ICON_2X, 'base64'),
      { scaleFactor: 2 },
    );
    img.setTemplateImage(true);
    return { icon: img, source: 'builtin-black-template-centered' };
  }

  const baseDirs = [
    path.join(process.resourcesPath || '', 'assets'),
    path.join(app.getAppPath(), 'assets'),
    path.join(__dirname, '../../assets'),
  ];
  for (const dir of baseDirs) {
    const p = path.join(dir, 'tray.png');
    if (!existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return { icon: img, source: p };
  }

  return {
    icon: nativeImage.createFromBuffer(Buffer.from(WIN_ICON, 'base64')),
    source: 'builtin-white-fallback',
  };
}
