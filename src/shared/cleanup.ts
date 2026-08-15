export interface CleanupClip {
  id: string;
  createdAt: number;
  favorite: boolean;
}

export function selectForCleanup<T extends CleanupClip>(
  clips: T[],
  maxItems: number,
  cleanupBatch = 200,
): string[] {
  if (clips.length <= maxItems) return [];

  const sorted = [...clips].sort((a, b) => a.createdAt - b.createdAt);
  const toRemove: string[] = [];
  for (const c of sorted) {
    if (c.favorite) continue;
    toRemove.push(c.id);

    if (clips.length - toRemove.length <= maxItems) break;
    if (toRemove.length >= cleanupBatch) break;
  }
  return toRemove;
}
