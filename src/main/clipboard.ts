import { clipboard } from 'electron'
import { computeImageHash, computeTextHash } from '../shared/hash'
import type { ClipStore } from './store'

// 监听系统剪切板，捕获文本与图片（功能 1）
// - 基于内容哈希去重（同内容不重复入库）
// - 图片用 NativeImage 压缩（toJPEG 质量 80）后交给 store 存盘
// - 程序自身写入剪切板时抑制下一次捕获，避免回环

let lastTextSig = ''
let lastImageSig = ''
let suppress = false

/** 程序即将写入剪切板（复制/粘贴）时调用，跳过紧接着的一次捕获 */
export function suppressNextCapture(): void {
  suppress = true
}

export function startClipboardMonitor(store: ClipStore, onAdded?: (added: boolean) => void): void {
  const tick = () => {
    if (suppress) {
      suppress = false
      return
    }
    try {
      const formats = clipboard.availableFormats()
      // 文本
      if (formats.includes('text/plain')) {
        const text = clipboard.readText()
        if (text && text.length <= 5_000_000) {
          const sig = computeTextHash(text)
          if (sig !== lastTextSig) {
            lastTextSig = sig
            void store.addText(text, sig, Date.now(), Buffer.byteLength(text, 'utf8')).then((r) => {
              if (r.added) onAdded?.(true)
            })
          }
        }
      }
      // 图片
      if (formats.some((f) => f.startsWith('image/'))) {
        const img = clipboard.readImage()
        if (!img.isEmpty()) {
          const buf = img.toJPEG(80) // 压缩存储，控制磁盘占用（功能 8）
          const sig = computeImageHash(buf)
          if (sig !== lastImageSig) {
            lastImageSig = sig
            const thumb = img.resize({ width: 240 }).toDataURL()
            const { width, height } = img.getSize()
            void store
              .addImage({ hash: sig, format: 'jpeg', width, height, thumb, buffer: buf }, Date.now())
              .then((r) => {
                if (r.added) onAdded?.(true)
              })
          }
        }
      }
    } catch (e) {
      // 偶发读取失败（如非文本/图片格式）忽略
      console.error('[clipboard] tick error', e)
    }
  }
  // 每 500ms 轮询一次，兼顾实时性与性能
  setInterval(tick, 500)
}
