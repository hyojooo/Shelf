import { clipboard } from 'electron';
import { computeImageHash, computeTextHash } from '../shared/hash';
import type { ClipStore } from './store';

let lastTextSig = '';
let lastImageSig = '';
let suppressUntil = 0;
let monitorTimer: NodeJS.Timeout | null = null;

/** 写入剪贴板后短暂抑制采集，避免把自己写进去的内容当成新记录 */
export function suppressNextCapture(): void {
  suppressUntil = Date.now() + 900;
}

export function stopClipboardMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

export function startClipboardMonitor(
  store: ClipStore,
  onAdded?: (added: boolean) => void,
): void {
  stopClipboardMonitor();

  const tick = () => {
    try {
      const formats = clipboard.availableFormats();
      const suppressed = Date.now() < suppressUntil;

      if (formats.includes('text/plain')) {
        const text = clipboard.readText();
        if (text && text.length <= 5_000_000) {
          const sig = computeTextHash(text);
          if (sig !== lastTextSig) {
            lastTextSig = sig;
            if (!suppressed) {
              void store
                .addText(text, sig, Date.now(), Buffer.byteLength(text, 'utf8'))
                .then((r) => {
                  if (r.added) onAdded?.(true);
                });
            }
          }
        }
      }

      if (formats.some((f) => f.startsWith('image/'))) {
        const img = clipboard.readImage();
        if (!img.isEmpty()) {
          // 每次都按内容算指纹：只比宽/高会让「同尺寸不同图」永久漏记
          const sig = computeImageHash(img.toBitmap());
          if (sig !== lastImageSig) {
            lastImageSig = sig;
            if (!suppressed) {
              const { width, height } = img.getSize();
              const buf = img.toJPEG(80);
              const thumb = img.resize({ width: 240 }).toDataURL();
              void store
                .addImage(
                  {
                    hash: sig,
                    format: 'jpeg',
                    width,
                    height,
                    thumb,
                    buffer: buf,
                  },
                  Date.now(),
                )
                .then((r) => {
                  if (r.added) onAdded?.(true);
                });
            }
          }
        }
      }
    } catch (e) {
      console.error('[clipboard] tick error', e);
    }
  };

  monitorTimer = setInterval(tick, 750);
  tick();
}
