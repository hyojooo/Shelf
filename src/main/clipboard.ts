import { clipboard } from 'electron';
import { computeImageHash, computeTextHash } from '../shared/hash';
import type { ClipStore } from './store';

let lastTextSig = '';
let lastImageSig = '';
let lastTextLen = -1;
let lastTextHead = '';
let lastImageW = -1;
let lastImageH = -1;
let suppress = false;

export function suppressNextCapture(): void {
  suppress = true;
}

export function startClipboardMonitor(
  store: ClipStore,
  onAdded?: (added: boolean) => void,
): void {
  const tick = () => {
    if (suppress) {
      suppress = false;

      try {
        const formats = clipboard.availableFormats();
        if (formats.includes('text/plain')) {
          const text = clipboard.readText();
          if (text) {
            lastTextSig = computeTextHash(text);
            lastTextLen = text.length;
            lastTextHead = text.slice(0, 120);
          }
        }
        if (formats.some((f) => f.startsWith('image/'))) {
          const img = clipboard.readImage();
          if (!img.isEmpty()) {
            const { width, height } = img.getSize();
            const buf = img.toJPEG(80);
            lastImageSig = computeImageHash(buf);
            lastImageW = width;
            lastImageH = height;
          }
        }
      } catch {}
      return;
    }
    try {
      const formats = clipboard.availableFormats();

      if (formats.includes('text/plain')) {
        const text = clipboard.readText();
        if (text && text.length <= 5_000_000) {
          if (
            text.length !== lastTextLen ||
            text.slice(0, 120) !== lastTextHead
          ) {
            const sig = computeTextHash(text);
            if (sig !== lastTextSig) {
              lastTextSig = sig;
              void store
                .addText(text, sig, Date.now(), Buffer.byteLength(text, 'utf8'))
                .then((r) => {
                  if (r.added) onAdded?.(true);
                });
            }
          }
          lastTextLen = text.length;
          lastTextHead = text.slice(0, 120);
        }
      }

      if (formats.some((f) => f.startsWith('image/'))) {
        const img = clipboard.readImage();
        if (!img.isEmpty()) {
          const { width, height } = img.getSize();
          if (width !== lastImageW || height !== lastImageH) {
            const buf = img.toJPEG(80);
            const sig = computeImageHash(buf);
            if (sig !== lastImageSig) {
              lastImageSig = sig;
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
          lastImageW = width;
          lastImageH = height;
        }
      }
    } catch (e) {
      console.error('[clipboard] tick error', e);
    }
  };

  setInterval(tick, 750);
}
