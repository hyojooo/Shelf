// 独立校验 shared/types.ts 可被正常解析与执行（无 Node 依赖）
import { IPC, DEFAULT_SETTINGS } from '../src/shared/types.ts'
if (IPC.GET_ALL !== 'clip:getAll') throw new Error('IPC 常量异常')
if (DEFAULT_SETTINGS.maxItems !== 500) throw new Error('默认最大条数异常')
console.log('shared/types.ts 解析 OK ✅')
