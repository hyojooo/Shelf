import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Clip, ImageClip, TextClip } from '../shared/types'
import { selectForCleanup, type CleanupClip } from '../shared/cleanup'
import { makeId } from '../shared/hash'

export interface AddImageInput {
  hash: string
  format: 'jpeg' | 'png'
  width: number
  height: number
  thumb: string
  buffer: Buffer
}

/**
 * 剪切板历史存储（功能 1 / 4 / 7 / 8 / 9）。
 * - 元数据以 JSON 原子写入持久化（应用重启后完整保留）
 * - 图片压缩后作为文件存盘，列表缩略图以内联 dataURL 加速渲染
 * - 基于内容哈希去重；超量按时间从旧到新自动清理，收藏项豁免
 */
export class ClipStore {
  private clips: Clip[] = []
  private dataFile: string
  private imagesDir: string
  private maxItems: number
  private cleanupBatch: number
  private saveTimer: NodeJS.Timeout | null = null
  private listeners = new Set<(clips: Clip[]) => void>()

  constructor(dataDir: string, maxItems: number, cleanupBatch: number) {
    this.dataFile = path.join(dataDir, 'clips.json')
    this.imagesDir = path.join(dataDir, 'images')
    this.maxItems = maxItems
    this.cleanupBatch = cleanupBatch
  }

  async init(): Promise<void> {
    await fs.mkdir(this.imagesDir, { recursive: true })
    try {
      const raw = await fs.readFile(this.dataFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) this.clips = parsed as Clip[]
    } catch {
      this.clips = []
    }
  }

  subscribe(fn: (clips: Clip[]) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.clips)
  }

  getClips(): Clip[] {
    return this.clips
  }

  setLimits(maxItems: number, cleanupBatch: number): void {
    this.maxItems = maxItems
    this.cleanupBatch = cleanupBatch
    void this.runCleanup()
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.saveNow()
    }, 400)
  }

  private async saveNow(): Promise<void> {
    try {
      const tmp = this.dataFile + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(this.clips), 'utf8')
      await fs.rename(tmp, this.dataFile)
    } catch (e) {
      console.error('[store] save failed', e)
    }
  }

  async addText(text: string, hash: string, now: number, size: number): Promise<{ added: boolean }> {
    const existing = this.clips.find((c) => c.type === 'text' && c.hash === hash)
    if (existing) {
      // 命中重复项：仅刷新时间戳并落盘，不广播给渲染进程（避免无效 IPC 放大重渲染）
      existing.updatedAt = now
      this.scheduleSave()
      return { added: false }
    }
    const firstLine = text.split('\n')[0] ?? ''
    const clip: TextClip = {
      id: makeId(hash, now),
      type: 'text',
      hash,
      text,
      preview: firstLine.slice(0, 200) || text.slice(0, 200),
      createdAt: now,
      updatedAt: now,
      favorite: false,
      size
    }
    this.clips = [clip, ...this.clips]
    await this.runCleanup()
    this.emit()
    return { added: true }
  }

  async addImage(input: AddImageInput, now: number): Promise<{ added: boolean }> {
    const existing = this.clips.find((c) => c.type === 'image' && c.hash === input.hash)
    if (existing) {
      // 命中重复项：仅刷新时间戳并落盘，不广播给渲染进程（避免无效 IPC 放大重渲染）
      existing.updatedAt = now
      this.scheduleSave()
      return { added: false }
    }
    const id = makeId(input.hash, now)
    const file = `${id}.${input.format}`
    await fs.writeFile(path.join(this.imagesDir, file), input.buffer)
    const clip: ImageClip = {
      id,
      type: 'image',
      hash: input.hash,
      format: input.format,
      width: input.width,
      height: input.height,
      thumb: input.thumb,
      file,
      createdAt: now,
      updatedAt: now,
      favorite: false,
      size: input.buffer.length
    }
    this.clips = [clip, ...this.clips]
    await this.runCleanup()
    this.emit()
    return { added: true }
  }

  private async runCleanup(): Promise<void> {
    const ids = selectForCleanup(this.clips as CleanupClip[], this.maxItems, this.cleanupBatch)
    if (ids.length === 0) return
    const idSet = new Set(ids)
    for (const c of this.clips) {
      if (c.type === 'image' && idSet.has(c.id)) {
        try {
          await fs.unlink(path.join(this.imagesDir, c.file))
        } catch {
          /* ignore */
        }
      }
    }
    this.clips = this.clips.filter((c) => !idSet.has(c.id))
    this.scheduleSave()
  }

  async deleteClip(id: string): Promise<void> {
    const c = this.clips.find((x) => x.id === id)
    if (!c) return
    if (c.type === 'image') {
      try {
        await fs.unlink(path.join(this.imagesDir, c.file))
      } catch {
        /* ignore */
      }
    }
    this.clips = this.clips.filter((x) => x.id !== id)
    this.scheduleSave()
    this.emit()
  }

  async clearAll(): Promise<void> {
    for (const c of this.clips) {
      if (c.type === 'image') {
        try {
          await fs.unlink(path.join(this.imagesDir, c.file))
        } catch {
          /* ignore */
        }
      }
    }
    this.clips = []
    this.scheduleSave()
    this.emit()
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const c = this.clips.find((x) => x.id === id)
    if (!c) return
    this.clips = this.clips.map((x) => (x.id === id ? { ...x, favorite } : x))
    this.scheduleSave()
    this.emit()
  }

  getImagePath(id: string): string | null {
    const c = this.clips.find((x) => x.id === id)
    if (c && c.type === 'image') return path.join(this.imagesDir, c.file)
    return null
  }

  async flush(): Promise<void> {
    await this.saveNow()
  }
}
