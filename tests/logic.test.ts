// 纯逻辑单元测试：去重哈希 / 模糊搜索 / 清理策略
// 运行：node --experimental-strip-types tests/logic.test.ts
import { computeTextHash, computeImageHash } from '../src/shared/hash.ts'
import { filterClips, fuzzyScore, formatTimestamp } from '../src/shared/search.ts'
import { selectForCleanup } from '../src/shared/cleanup.ts'
import { ok, equal, strictEqual, deepStrictEqual } from 'node:assert'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    console.error(`  \u2717 ${name}`)
    console.error(e)
    process.exit(1)
  }
}

console.log('功能1：内容哈希去重')
test('相同文本产生相同哈希', () => {
  strictEqual(computeTextHash('hello'), computeTextHash('hello'))
})
test('不同文本产生不同哈希', () => {
  notEqual(computeTextHash('hello'), computeTextHash('world'))
})
test('文本与图片哈希空间隔离（同字节不误判）', () => {
  const buf = Buffer.from('hello')
  notEqual(computeTextHash('hello'), computeImageHash(buf))
})
test('图片字节一致则哈希一致（去重基础）', () => {
  const a = Buffer.from([1, 2, 3, 4])
  const b = Buffer.from([1, 2, 3, 4])
  strictEqual(computeImageHash(a), computeImageHash(b))
})
test('图片字节不同则哈希不同', () => {
  notEqual(computeImageHash(Buffer.from([1, 2, 3])), computeImageHash(Buffer.from([1, 2, 4])))
})

console.log('功能3：模糊搜索与分类过滤')
test('空查询返回全部', () => {
  const clips = [
    { id: '1', type: 'text', text: 'abc', createdAt: 1, favorite: false },
    { id: '2', type: 'image', createdAt: 2, favorite: false }
  ]
  equal(filterClips(clips, 'all', '').length, 2)
})
test('按文本标签页过滤', () => {
  const clips = [
    { id: '1', type: 'text', text: 'abc', createdAt: 1, favorite: false },
    { id: '2', type: 'image', createdAt: 2, favorite: false }
  ]
  const r = filterClips(clips, 'text', '')
  equal(r.length, 1)
  strictEqual(r[0].id, '1')
})
test('按图片标签页过滤', () => {
  const clips = [
    { id: '1', type: 'text', text: 'abc', createdAt: 1, favorite: false },
    { id: '2', type: 'image', createdAt: 2, favorite: false }
  ]
  const r = filterClips(clips, 'image', '')
  equal(r.length, 1)
  strictEqual(r[0].id, '2')
})
test('文本子串匹配', () => {
  const clips = [
    { id: '1', type: 'text', text: 'Hello World', createdAt: 1, favorite: false },
    { id: '2', type: 'text', text: 'Goodbye', createdAt: 2, favorite: false }
  ]
  const r = filterClips(clips, 'all', 'world')
  equal(r.length, 1)
  strictEqual(r[0].id, '1')
})
test('模糊（子序列）匹配：hlo 命中 Hello', () => {
  equal(fuzzyScore('hlo', 'Hello'), fuzzyScore('hlo', 'Hello')) // 返回 >=0
  strictEqual(fuzzyScore('hlo', 'Hello') >= 0, true)
  strictEqual(fuzzyScore('hlo', 'World') < 0, true)
})
test('图片按时间戳匹配', () => {
  const ts = new Date('2026-08-06T22:11:05').getTime()
  const clips = [{ id: 'x', type: 'image', createdAt: ts, favorite: false }]
  const r = filterClips(clips, 'all', '2026-08-06 22:11')
  equal(r.length, 1)
  strictEqual(r[0].id, 'x')
})
test('匹配度排序：连续命中优先', () => {
  const clips = [
    { id: 'a', type: 'text', text: 'clipboard vault', createdAt: 1, favorite: false },
    { id: 'b', type: 'text', text: 'cv', createdAt: 2, favorite: false }
  ]
  const r = filterClips(clips, 'all', 'cv')
  // 'cv' 在 b 中连续命中，应排前
  strictEqual(r[0].id, 'b')
})
test('时间戳格式化正确', () => {
  const ts = new Date(2026, 7, 6, 22, 11, 5).getTime() // 月份 0-based -> 8月
  strictEqual(formatTimestamp(ts), '2026-08-06 22:11:05')
})

console.log('功能9：超量自动清理（收藏豁免）')
test('未超量不清理', () => {
  const clips = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, createdAt: i, favorite: false }))
  deepStrictEqual(selectForCleanup(clips, 500), [])
})
test('超量时清理最旧的若干条', () => {
  const clips = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, createdAt: i, favorite: false }))
  const removed = selectForCleanup(clips, 500, 200)
  equal(removed.length, 100) // 600-500=100 需要清理
  // 清理的是 createdAt 最小的 100 条
  const minKept = Math.min(...clips.filter((c) => !removed.includes(c.id)).map((c) => c.createdAt))
  strictEqual(minKept, 100)
})
test('收藏项豁免清理', () => {
  const clips = [
    { id: 'old-fav', createdAt: 0, favorite: true },
    ...Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, createdAt: i + 1, favorite: false }))
  ]
  const removed = selectForCleanup(clips, 500, 200)
  strictEqual(removed.includes('old-fav'), false) // 收藏豁免
  // 总数 601，需清理 101 条非收藏最旧数据回到 500
  equal(removed.length, 101)
  // 清理从最旧的非收藏项 c0 开始，c101（首条应保留的非收藏）不在其中
  strictEqual(removed.includes('c0'), true)
  strictEqual(removed.includes('c101'), false)
})
test('单次清理不超过 cleanupBatch', () => {
  const clips = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, createdAt: i, favorite: false }))
  const removed = selectForCleanup(clips, 500, 200)
  equal(removed.length, 200)
})

function notEqual(a: unknown, b: unknown) {
  if (a === b) throw new Error(`期望不相等，但得到: ${a}`)
}

console.log(`\n全部通过：${passed} 个用例 \u2705`)
