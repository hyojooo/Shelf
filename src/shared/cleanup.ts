/**
 * 超出最大存储条数时的自动清理策略（功能 8 / 功能 9）。
 * 规则：
 *   - 仅当总数 > maxItems 时触发
 *   - 按 createdAt 从旧到新排序，优先清理最旧的数据
 *   - 收藏项（favorite）永久豁免，不参与清理
 *   - 清理到「总数回到 maxItems 以内」即停止；单次最多清理 cleanupBatch 条（默认 200），
 *     若仍超出则留待下一次循环（避免一次性过删，也符合「清理最旧的 200 条」）
 * 纯函数、零依赖，便于单元测试。
 */

export interface CleanupClip {
  id: string
  createdAt: number
  favorite: boolean
}

export function selectForCleanup<T extends CleanupClip>(
  clips: T[],
  maxItems: number,
  cleanupBatch = 200
): string[] {
  if (clips.length <= maxItems) return []

  const sorted = [...clips].sort((a, b) => a.createdAt - b.createdAt) // 最旧在前
  const toRemove: string[] = []
  for (const c of sorted) {
    if (c.favorite) continue // 收藏豁免
    toRemove.push(c.id)
    // 回到 maxItems 以内即可停止；或达到单次清理上限
    if (clips.length - toRemove.length <= maxItems) break
    if (toRemove.length >= cleanupBatch) break
  }
  return toRemove
}
