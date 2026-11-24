import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import type { Clip, ImageClip, TextClip } from '../shared/types';
import { selectForCleanup, type CleanupClip } from '../shared/cleanup';
import { makeId } from '../shared/hash';

export interface AddImageInput {
  hash: string;
  format: 'jpeg' | 'png';
  width: number;
  height: number;
  thumb: string;
  buffer: Buffer;
}

export class ClipStore {
  private clips: Clip[] = [];
  private dataFile: string;
  private imagesDir: string;
  private maxItems: number;
  private cleanupBatch: number;
  private saveTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(clips: Clip[]) => void>();
  // 所有落盘串行化，避免 400ms 定时器与 flush() 同时写同一个临时文件
  private writeChain: Promise<void> = Promise.resolve();
  private writeSeq = 0;

  constructor(dataDir: string, maxItems: number, cleanupBatch: number) {
    this.dataFile = path.join(dataDir, 'clips.json');
    this.imagesDir = path.join(dataDir, 'images');
    this.maxItems = maxItems;
    this.cleanupBatch = cleanupBatch;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.imagesDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.dataFile, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.clips = Array.isArray(parsed)
        ? (parsed.filter(
            (c): c is Clip =>
              !!c &&
              typeof c === 'object' &&
              typeof (c as Clip).id === 'string' &&
              ((c as Clip).type === 'text' || (c as Clip).type === 'image'),
          ) as Clip[])
        : [];
    } catch (e) {
      this.clips = [];
      // 文件损坏时先留一份现场，避免随后被空数组覆盖导致历史彻底丢失
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        try {
          await fs.copyFile(
            this.dataFile,
            `${this.dataFile}.corrupt-${Date.now()}`,
          );
        } catch {
          /* ignore */
        }
      }
    }
  }

  subscribe(fn: (clips: Clip[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.clips);
  }

  getClips(): Clip[] {
    return this.clips;
  }

  setLimits(maxItems: number, cleanupBatch: number): void {
    this.maxItems = maxItems;
    this.cleanupBatch = cleanupBatch;
    void this.runCleanup().then((removed) => {
      // 调小上限会真的删数据，必须通知 renderer 刷新，否则界面仍显示已删条目
      if (removed > 0) this.emit();
      this.scheduleSave();
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.enqueueSave();
    }, 400);
  }

  private enqueueSave(): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.saveNow());
    return this.writeChain;
  }

  private async saveNow(): Promise<void> {
    // 每次使用唯一临时文件，杜绝并发写交错 / rename ENOENT
    const tmp = `${this.dataFile}.${process.pid}.${++this.writeSeq}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(this.clips), 'utf8');
      await fs.rename(tmp, this.dataFile);
    } catch (e) {
      console.error('[store] save failed', e);
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  private touchExisting(existing: Clip, now: number): void {
    existing.updatedAt = now;
    // 重复复制同一内容时应刷新位置，且不改变收藏状态
    this.clips = [existing, ...this.clips.filter((c) => c.id !== existing.id)];
    this.scheduleSave();
    this.emit();
  }

  async addText(
    text: string,
    hash: string,
    now: number,
    size: number,
  ): Promise<{ added: boolean }> {
    const existing = this.clips.find(
      (c) => c.type === 'text' && c.hash === hash,
    );
    if (existing) {
      this.touchExisting(existing, now);
      return { added: false };
    }
    const firstLine = text.split('\n')[0] ?? '';
    const clip: TextClip = {
      id: makeId(hash, now),
      type: 'text',
      hash,
      text,
      preview: firstLine.slice(0, 200) || text.slice(0, 200),
      createdAt: now,
      updatedAt: now,
      favorite: false,
      size,
    };
    this.clips = [clip, ...this.clips];
    await this.runCleanup();
    this.emit();
    return { added: true };
  }

  async addImage(
    input: AddImageInput,
    now: number,
  ): Promise<{ added: boolean }> {
    const existing = this.clips.find(
      (c) => c.type === 'image' && c.hash === input.hash,
    );
    if (existing) {
      this.touchExisting(existing, now);
      return { added: false };
    }
    const id = makeId(input.hash, now);
    const file = `${id}.${input.format}`;
    await fs.writeFile(this.safeImagePath(file), input.buffer);
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
      size: input.buffer.length,
    };
    this.clips = [clip, ...this.clips];
    await this.runCleanup();
    this.emit();
    return { added: true };
  }

  /** 防止历史文件里的 file 字段带 ../ 逃出 images 目录 */
  private safeImagePath(file: string): string {
    return path.join(this.imagesDir, path.basename(file));
  }

  private async runCleanup(): Promise<number> {
    const ids = selectForCleanup(
      this.clips as CleanupClip[],
      this.maxItems,
      this.cleanupBatch,
    );
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    for (const c of this.clips) {
      if (c.type === 'image' && idSet.has(c.id)) {
        try {
          await fs.unlink(this.safeImagePath(c.file));
        } catch {
          /* ignore */
        }
      }
    }
    this.clips = this.clips.filter((c) => !idSet.has(c.id));
    this.scheduleSave();
    return ids.length;
  }

  async deleteClip(id: string): Promise<void> {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return;
    if (c.type === 'image') {
      try {
        await fs.unlink(this.safeImagePath(c.file));
      } catch {
        /* ignore */
      }
    }
    this.clips = this.clips.filter((x) => x.id !== id);
    this.scheduleSave();
    this.emit();
  }

  async clearAll(): Promise<void> {
    for (const c of this.clips) {
      if (c.type === 'image') {
        try {
          await fs.unlink(this.safeImagePath(c.file));
        } catch {
          /* ignore */
        }
      }
    }
    this.clips = [];
    this.scheduleSave();
    this.emit();
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const c = this.clips.find((x) => x.id === id);
    if (!c) return;
    this.clips = this.clips.map((x) => (x.id === id ? { ...x, favorite } : x));
    this.scheduleSave();
    this.emit();
  }

  getImagePath(id: string): string | null {
    const c = this.clips.find((x) => x.id === id);
    if (!c || c.type !== 'image') return null;
    const p = this.safeImagePath(c.file);
    return existsSync(p) ? p : null;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.enqueueSave();
  }
}
