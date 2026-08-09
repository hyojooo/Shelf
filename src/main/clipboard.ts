import { clipboard } from 'electron'
import { computeImageHash, computeTextHash } from '../shared/hash'
import type { ClipStore } from './store'

// 监听系统剪切板，捕获文本与图片（功能 1）
// - 基于内容哈希去重（同内容不重复入库）
// - 图片用 NativeImage 压缩（toJPEG 质量 80）后交给 store 存盘
// - 程序自身写入剪切板时抑制下一次捕获，避免回环

let lastTextSig = ''
let lastImageSig = ''
let lastTextLen = -1
let lastTextHead = ''
let lastImageW = -1
let lastImageH = -1
let suppress = false

/** 程序即将写入剪切板（复制/粘贴）时调用，跳过紧接着的一次捕获 */
export function suppressNextCapture(): void {
  suppress = true
}

export function startClipboardMonitor(store: ClipStore, onAdded?: (added: boolean) => void): void {
  const tick = () => {
    if (suppress) {
      suppress = false
      // 吸收自身写入：把当前剪贴板记为基线，避免下一轮把它当作「新内容」回环捕获
      try {
        const formats = clipboard.availableFormats()
        if (formats.includes('text/plain')) {
          const text = clipboard.readText()
          if (text) {
            lastTextSig = computeTextHash(text)
            lastTextLen = text.length
            lastTextHead = text.slice(0, 120)
          }
        }
        if (formats.some((f) => f.startsWith('image/'))) {
          const img = clipboard.readImage()
          if (!img.isEmpty()) {
            const { width, height } = img.getSize()
            const buf = img.toJPEG(80)
            lastImageSig = computeImageHash(buf)
            lastImageW = width
            lastImageH = height
          }
        }
      } catch {
        /* 忽略吸收阶段的偶发错误 */
      }
      return
    }
    try {
      const formats = clipboard.availableFormats()
      // 文本：廉价前置检测（长度 + 前 120 字符）通过后再做昂贵的 SHA-256
      if (formats.includes('text/plain')) {
        const text = clipboard.readText()
        if (text && text.length <= 5_000_000) {
          if (text.length !== lastTextLen || text.slice(0, 120) !== lastTextHead) {
            const sig = computeTextHash(text)
            if (sig !== lastTextSig) {
              lastTextSig = sig
              void store.addText(text, sig, Date.now(), Buffer.byteLength(text, 'utf8')).then((r) => {
                if (r.added) onAdded?.(true)
              })
            }
          }
          lastTextLen = text.length
          lastTextHead = text.slice(0, 120)
        }
      }
      // 图片：先用廉价的尺寸检测（无需解码），尺寸不变则跳过昂贵的 JPEG 重编码 + 哈希
      if (formats.some((f) => f.startsWith('image/'))) {
        const img = clipboard.readImage()
        if (!img.isEmpty()) {
          const { width, height } = img.getSize()
          if (width !== lastImageW || height !== lastImageH) {
            const buf = img.toJPEG(80) // 压缩存储，控制磁盘占用（功能 8）
            const sig = computeImageHash(buf)
            if (sig !== lastImageSig) {
              lastImageSig = sig
              const thumb = img.resize({ width: 240 }).toDataURL()
              void store
                .addImage({ hash: sig, format: 'jpeg', width, height, thumb, buffer: buf }, Date.now())
                .then((r) => {
                  if (r.added) onAdded?.(true)
                })
            }
          }
          lastImageW = width
          lastImageH = height
        }
      }
    } catch (e) {
      // 偶发读取失败（如非文本/图片格式）忽略
      console.error('[clipboard] tick error', e)
    }
  }
  // 每 750ms 轮询一次（兼顾实时性与性能；空闲时因廉价前置检测几乎零成本）
  setInterval(tick, 750)
}
