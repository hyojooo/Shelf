import { createHash } from 'node:crypto'

/**
 * 基于内容哈希的自动去重（功能 1）。
 * 文本与图片使用不同的盐值前缀，避免「相同字节的不同类型」被误判为重复。
 * 该函数仅在主进程运行（依赖 node:crypto），渲染进程接收已算好的 hash。
 */

const TEXT_SALT = '\u0000t'
const IMAGE_SALT = '\u0000i'

export function computeTextHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').update(TEXT_SALT).digest('hex')
}

export function computeImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).update(IMAGE_SALT).digest('hex')
}

/** 生成一个唯一的记录 id（内容哈希 + 时间戳 + 随机串，避免碰撞） */
export function makeId(hash: string, now: number): string {
  const rnd = Math.random().toString(36).slice(2, 10)
  return `${hash.slice(0, 12)}-${now.toString(36)}-${rnd}`
}
