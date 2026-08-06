/**
 * 实时模糊搜索与分类过滤（功能 3）。
 * 纯函数、零依赖，既可在主进程做预过滤，也可在渲染进程做实时过滤。
 * 匹配目标：
 *   - 文本项：匹配文本内容
 *   - 图片项：匹配格式化为可读字符串的时间戳（如 "2026-08-06 22:11:05"）
 */

export type ClipTab = 'all' | 'text' | 'image' | 'favorite'

export interface SearchClip {
  id: string
  type: 'text' | 'image'
  text?: string
  createdAt: number
  favorite: boolean
}

const TEXT = 'text'
const IMAGE = 'image'

/** 将时间戳格式化为 "YYYY-MM-DD HH:mm:ss"，用于图片项的可搜索文本 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 子序列模糊匹配打分。
 * 返回 -1 表示不匹配；>=0 表示匹配度（越大越优）。
 * 连续命中给更高权重，目标越短越优。
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 4 : 1 // 连续命中加权
      lastMatch = ti
      qi++
    }
  }
  if (qi < q.length) return -1
  return score - t.length * 0.01
}

/** 按分类标签页 + 关键字过滤；有查询时按匹配度降序排序 */
export function filterClips<T extends SearchClip>(clips: T[], tab: ClipTab, query: string): T[] {
  const q = (query || '').trim()
  let result = clips
  if (tab === TEXT) result = result.filter((c) => c.type === TEXT)
  else if (tab === IMAGE) result = result.filter((c) => c.type === IMAGE)
  else if (tab === 'favorite') result = result.filter((c) => c.favorite)

  if (!q) return result

  const scored: Array<{ c: T; s: number }> = []
  for (const c of result) {
    let s = -1
    if (c.type === TEXT && c.text) s = fuzzyScore(q, c.text)
    else if (c.type === IMAGE) s = fuzzyScore(q, formatTimestamp(c.createdAt))
    if (s >= 0) scored.push({ c, s })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.map((x) => x.c)
}
