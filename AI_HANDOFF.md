# Shelf — 项目交接简报（AI 必读）

> 本文件供「新 AI 窗口」快速接手本项目使用，无需重读全部源码。
> 项目路径：`/Users/guho/Desktop/Developer/clipboard-manager`

---

## 1. 一句话定位

**Shelf** —— 跨平台（macOS 10.15+ / Windows 10+）桌面剪切板管理应用。
自动捕获、去重、持久化剪贴板文本与图片，全局快捷键唤起置顶面板，虚拟滚动大列表。

技术栈：**Electron 33 + React 18 + TypeScript + Vite（electron-vite 构建，electron-builder 打包）**。
进程分离：主进程 / 预加载 / 渲染进程，contextIsolation 开启、nodeIntegration 关闭、零原生依赖。

---

## 2. 目录结构与职责（按文件）

```
clipboard-manager/
├── .npmrc                    # 淘宝镜像源（关键：解决 Electron 下载卡死）
├── package.json              # 依赖与脚本
├── electron.vite.config.ts   # 三进程构建配置；renderer 多入口（index + preferences）
├── electron-builder.yml      # 打包配置（mac/win，图标已生成 + extraResources 拷贝托盘图标）
├── tsconfig.json
├── src/
│   ├── shared/               # 主/渲染共享的纯逻辑（可单测、无 Electron 依赖）
│   │   ├── i18n/             # 多语言：locales/*.json（en/zh-CN/zh-TW/ja/ko/ru/vi）+ index.ts 的 t()/LANGUAGES/getLang；**Language 类型定义在 types.ts**，Settings.language（默认 'en'）
│   │   ├── types.ts          # 全局类型 + IPC 频道常量；ClipTab 含 'all'|'text'|'image'|'favorite'；Settings 含 panelPosition（'cursor'|'center'，默认 center）；Settings 含 language（默认 'en'）
│   │   ├── hash.ts           # SHA-256 内容哈希去重（文本/图片盐值隔离）
│   │   ├── search.ts         # 模糊搜索（子序列打分 + 图片时间戳匹配）；filterClips 支持 favorite 分支仅显示收藏
│   │   └── cleanup.ts        # 超量清理策略（收藏豁免、最旧 N 条）
│   ├── main/                 # 主进程（Node/Electron 环境）
│   │   ├── index.ts          # 入口：装配 + IPC handler（含 GET_VERSION、CHECK_UPDATE）；registerUpdateWindow 把偏好窗口纳入更新广播；全局快捷键回调用 toggle()（隐显切换）；PASTE 用「hide()先行→60ms延时→写剪贴板→Cmd+V」解决失焦
│   │   ├── window.ts         # 面板窗口：置顶/失焦隐藏/可拖拽顶栏；showPanel(position) 支持 cursor（跟随光标）与 center（屏幕居中，默认）；captureSourceApp/getSourceApp
│   │   ├── clipboard.ts      # 剪切板监听 + 捕获（含抑制回环 suppressNextCapture）；750ms 轮询 + 廉价前置检测（文本比长度+前缀、图片比尺寸）后再做昂贵 toJPEG/哈希
│   │   ├── store.ts          # 内存存储 + JSON 原子持久化 + 图片压缩存盘；addText/addImage 命中重复项时仅刷时间戳+落盘、不再 emit（避免无效 IPC 放大渲染重渲染）
│   │   ├── settings.ts       # 设置读写（maxItems/cleanupBatch 等）
│   │   ├── tray.ts           # 菜单栏托盘：用 t() 构建本地化菜单（打开面板/偏好设置/退出）；setTrayLanguage() 运行时切换；图标 assets/icon.png 缩放 22px
│   │   ├── preferences.ts    # 独立偏好设置窗口（frameless 单实例，复用 SettingsForm，✕ 关闭）；导出 getPreferencesWindow() 供更新模块广播
│   │   ├── shortcut.ts       # globalShortcut 注册/注销
│   │   ├── updater.ts        # electron-updater 更新检查 + 多窗口广播（registerUpdateWindow）；checkForUpdates 失败经 IPC 推 error 状态
│   │   └── logger.ts         # 全局异常/崩溃日志 → userData/logs/
│   ├── preload/
│   │   └── index.ts          # contextBridge 暴露 window.clip API（导出类型 ClipApi）
│   └── renderer/             # React 渲染进程
│       ├── App.tsx           # 根组件：键盘导航、事件订阅（mount 一次性注册）、主题；getAll 仅在 mount 拉取一次，之后靠 IPC.UPDATED 推送；VISIBILITY handler 用 filteredRef 读最新列表；内嵌 UpdateModal 弹窗（available/downloaded/error/not-available 四态）；not-available 底部轻提示 2.5s 定时自动消失（setTimeout effect）
│       ├── i18n.tsx          # 【关键】I18nProvider + useT()/useLang() hook：从 settings.language 读当前语言，切换即整体重渲染；同步 <html lang>
│       ├── clip-api.ts       # 【关键】安全访问 window.clip 的包装层 getClip()
│       ├── main.tsx          # React 挂载入口
│       ├── index.html
│       ├── preferences.html  # 独立偏好设置窗口 HTML 入口（electron-vite 多入口）
│       ├── preferences.tsx  # 独立偏好设置窗口：挂载 SettingsForm（title="偏好设置"）；订阅 UPDATE_STATE + 内嵌 UpdateModal（与面板同步）；not-available 底部轻提示 2.5s 定时自动消失；✕ 关闭（window.close）
│       ├── store/useStore.ts # zustand 状态管理
│       ├── components/
│       │   ├── Tabs.tsx          # 全部/文本/图片/收藏 分类标签（收藏带 SVG 星标）
│       │   ├── SearchBar.tsx     # 实时模糊搜索框（放大镜/齿轮/清除均为 SVG）
│       │   ├── ClipList.tsx      # 列表容器（接入虚拟滚动）；收藏星标/删除 X 为 SVG
│       │   ├── VirtualList.tsx   # 自研虚拟滚动
│       │   ├── Preview.tsx       # 单击预览（右侧固定列，非浮层抽屉）；关闭按钮 SVG
│       │   └── Settings.tsx      # 设置页：拆出可复用 SettingsForm（接收可选 title prop、无遮罩）；Settings 为面板弹窗包装
│       └── styles/global.css  # CSS 变量深/浅色适配 + 动画 + 偏好窗口 .pref-root
└── tests/
    └── logic.test.ts         # 纯逻辑单测（去重/搜索/清理，17 用例）
```

---

## 3. 关键架构决策

1. **共享纯逻辑下沉到 `src/shared/`**：去重、搜索、清理策略都是框架无关的纯函数，能直接被 Node 执行测试（见第 6 节），无需打包。
2. **preload 通过 `window.clip` 暴露 API**（`ClipApi` 类型从 `src/preload/index.ts` 导出）。所有 IPC 通信经此桥接，渲染进程不碰 Node。
3. **持久化**：元数据写 JSON（原子写：先写 tmp 再 rename）；图片用 `nativeImage.toJPEG(80)` 压缩存盘，路径记录到元数据。
4. **不可变更新**：`store.ts` 中的增删改都产生新数组引用，避免 React 订阅者收不到更新。
5. **清理策略**：超过 `maxItems`（默认 500）时，按 `createdAt` 升序选最旧的、最多 `cleanupBatch`（默认 200）条删除；收藏项（`favorite`）永远豁免。
6. **面板窗口**：`alwaysOnTop: 'floating'` + 失焦 120ms 延时隐藏 + 可拖拽（无边框窗口，`.topbar` 设 `-webkit-app-region: drag`，`.tabs`/`.searchbar` 设 `no-drag`）。默认尺寸 **680×520**（min 560×380），适配右侧预览双栏。**弹出位置 `showPanel(position)`**：`center`（屏幕居中，默认）或 `cursor`（跟随光标），由 `settings.panelPosition` 决定；快捷键/托盘/设置唤起时均读取该设置。
7. **预览为右侧固定列（非浮层）**：`App.tsx` 用 `.body` 横向 flex 容器，`content` 列表固定宽 `340px`（280~420），`preview` 占剩余 `flex:1`；**隐藏滚动条**（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`，保留滚动）。面板打开时（`IPC.VISIBILITY:true`）自动选中并预览第一条。
8. **粘贴「失焦」修复（关键）**：`PASTE` handler 先 `hide()` 同步隐藏面板 → macOS 自动把焦点还给源应用 → `setTimeout(60ms)` 等焦点切换完成 → `setClipboard()` + `sendPasteKeystroke()`（`osascript keystroke "v" using command down`）。源应用名仅作兜底 `activate`，不依赖它作主路径。需 macOS「辅助功能」授权。
9. **设置页 UI 重设计**：分组卡片式（`.s-section`，每组 SVG 图标 + 大写标题）；自定义 Toggle 开关替代原生 checkbox；面板位置为双卡片选择器；数字输入框带「条」单位；快捷键 kbd 样式；select 自定义箭头。弹窗 `.modal-settings` 设 `min-width:400px` 防截断。
10. **快捷键捕获用 `e.code` 而非 `e.key`**：macOS 下 `Alt/Option+字母` 的 `e.key` 返回组合字符（如 ´），必须用 `e.code`（物理按键码）识别真实按键（见 Settings.tsx 的 `codeToDisplay()`）。捕获完成后**必须调用 `save({globalShortcut})` 持久化**，否则关面板后丢失（曾漏此步）。

11. **全局快捷键「toggle」而非「show」**：`src/main/index.ts` 的 `applyShortcut` 回调**必须调用 `toggle(position)`**（`window.ts` 暴露），而不是 `showPanel(position)`。语义：面板隐藏时唤起、可见时关闭，即同一个快捷键开/关切换。若误用 `showPanel`，会出现「按关闭热键反而弹窗、按打开无反应」的反直觉现象（已踩坑）。

12. **图标用内联 SVG 而非 emoji**：搜索放大镜 / 设置齿轮 / 清除 X / 预览关闭 X / 列表收藏星标(已收藏实心)与删除 X 全部改为 `currentColor` 描边 SVG（见 SearchBar / Preview / ClipList / Tabs）。不要退回 emoji（🔍⚙★✕），emoji 在深色模式与跨平台渲染下样式不可控、偏丑。

13. **数值输入框用 `type="text"` + `inputMode="numeric"`**：设置页的「最大存储条数 / 超量时单次清理数」**不要**用 `type="number"`（原生行为无法全选清空、空值会自动回填、移动端体验差）。正确实现：`onChange` 用 `replace(/\D/g,'')` 过滤非数字、空值暂存 0，`onBlur` 时 `Math.max(10, val)` 钳到最小值 10 再 `save()`。

14. **右侧预览关闭时显示「小熊」空状态**：`App.tsx` 的 `.preview-area` 容器始终渲染（无论有无预览），有 `previewId` 时显示 `<Preview>`，无预览时显示居中的可爱小熊 SVG 空状态（`.preview-empty` + `.bear-float` 轻微上下浮动动画 + 提示文字「选择一条记录查看详情」）。小熊用 `--muted`/`--accent` 着色，深/浅色自动适配。注意：关闭预览同时应 `select(null)` 取消左侧选中态，保持一致（见第 5 节对应坑）。

15. **预览关闭需同步取消左侧选中**：Preview 右上角 ✕ 的 `onClose` 必须同时 `preview(null)` **和** `select(null)`，否则左侧列表仍高亮选中项、视觉与关闭动作不一致。面板隐藏 / Esc 键等其它关闭路径已自带 `select(null)`，无需改动；仅 Preview 的 `onClose` 历史上漏过。

16. **预览文本支持鼠标部分选中**：`body` 全局 `user-select: none`（防止拖拽列表项误选文字），但 `.preview-text` 需显式覆写 `user-select: text` 才能在该区域选中复制。改这两个之一都要注意配对：动了全局 `user-select` 或预览样式时要确认仍可选中。

---

## 4. 10 项功能实现状态（全部完成）

| # | 功能 | 主要文件 |
|---|------|---------|
| 1 | 捕获文本/图片 + 内容哈希去重 + 图片压缩 | clipboard.ts / store.ts / shared/hash.ts |
| 2 | 全局快捷键唤起 + 始终置顶 + 失焦隐藏 | window.ts / shortcut.ts |
| 3 | 分类标签页（全部/文本/图片/收藏）+ 实时模糊搜索 | Tabs / SearchBar / shared/search.ts |
| 4 | 单击预览（右侧固定列）+ 双击粘贴（hide 先行落点修正）+ 快捷键复制 | App / Preview / 主进程 sendPasteKeystroke |
| 5 | 菜单栏常驻托盘（点击弹菜单：打开面板/偏好设置/退出） | tray.ts |
| 6 | 设置：快捷键/最大条数/超量单次清理数/自启/主题/面板位置；独立偏好设置窗口 | Settings / preferences / settings.ts |
| 7 | 收藏置顶 + 删除单条 + 清空全部 | store.ts（不可变更新 + 列表排序） |
| 8 | 本地持久化 + 图片压缩存盘 | store.ts（JSON + JPEG） |
| 9 | 超量自动清理（收藏豁免，最旧 200） | shared/cleanup.ts |
| 10 | 应用内更新检查 + 崩溃日志 | updater.ts / logger.ts |

---

## 5. 已踩坑 & 已修复（下次别再犯）

| 坑 | 现象 | 修复 |
|----|------|------|
| **Electron 下载卡死** | `npm i` 一直停住 | 已加 `.npmrc` 配置 `electron_mirror=https://npmmirror.com/mirrors/electron/`，并用淘宝 registry |
| **`window.clip` undefined 白屏** | 渲染进程报 `Cannot read properties of undefined (reading 'getAll')` | ① 新增 `renderer/clip-api.ts` 的 `getClip()` 安全包装，所有组件改用它；② `window.ts` 的 preload 路径改用 `app.getAppPath()+'/out/preload/index.js'`（比 `__dirname` 相对路径可靠） |
| **electron-vite 入口约定** | 构建找不到 main/preload | 入口必须命名为 `src/main/index.ts`、`src/preload/index.ts`（不是 main.ts） |
| **preload `on` 回调类型** | strict 模式下类型报错 | 回调参数用 `any[]` 而非 `unknown[]` |
| **store 原地 mutation** | React 订阅者不刷新 | 增删改均产生新数组引用 |
| **粘贴落点错误（Cmd+V 粘到面板自身）** | 双击粘贴没落到源应用 | `PASTE` 改为 `hide()` 先行 + 60ms 延时 + `keystroke`；靠 `hide()` 自动归还焦点，源应用名仅兜底 `activate` |
| **滚动条丑** | 列表/预览滚动条突兀 | CSS 隐藏滚动条（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`），保留滚动功能 |
| **设置快捷键不持久** | 改了快捷键、关面板后恢复默认 | `Settings.tsx` 快捷键捕获回调漏了 `save()` 调用，只改本地 draft 未写回主进程。修复：捕获完成后 `save({ globalShortcut })` 经 IPC 写入 `settings.json` 并重新注册 |
| **macOS Alt+字母捕获失效** | 按 Option+E/Q/W 等捕获不到或显示乱码 | 根因：`e.key` 在 Alt 组合下返回组合字符（死键），应改用 `e.code`（物理按键码）。`Settings.tsx` 加 `codeToDisplay()` 映射（KeyE→E、Digit5→5 等） |
| **设置弹窗显示不全** | 弹窗偏窄、标签/快捷键框被截断 | `.modal-settings` 加 `min-width:400px`；`.s-label`/`shortcut-capture` 加 `flex-shrink:0`/`min-width`，避免空间不足挤压 |
| **全局快捷键开关反了** | 按「打开」热键面板不弹、按「关闭」热键面板反而弹 | 根因：`applyShortcut` 的回调误用 `showPanel()`（永远只显示），应改用 `toggle()`（`window.ts` 暴露），实现「隐藏→弹、可见→关」的切换语义 |
| **数值输入框删不干净** | 设置页「最大条数 / 清理数」无法全选清空，删到空又弹回旧值 | 根因：`type="number"` 原生行为 + `onChange` 里空值立刻 `Math.max(10, ...)` 回填。修复：改用 `type="text"`+`inputMode="numeric"`，`onChange` 空值暂存 0、`onBlur` 才钳到最小值 10 并保存 |
| **收藏没有统一入口** | 收藏的条目散落在「全部」里，找不到在哪看 | `ClipTab` 增加 `'favorite'` → `filterClips` 加 favorite 分支 → `Tabs.tsx` 加第四个「收藏」标签（SVG 星标）；注意 `types.ts`（shared）与 `search.ts` 两处 `ClipTab` 类型都要同步加 |
| **白色托盘图标致 app 启动失败** | 把托盘图标换成白色 tray.png + `setTemplateImage(true)` 后 app 起不来 | 已回滚到用 `assets/icon.png` 缩放 22px（紫色）。白色图标需排查 `setTemplateImage`/`addRepresentation` 在当前 Electron 版本的行为，不要简单替换图片。 |
| **关闭预览左侧仍选中** | 点预览 ✕ 关掉右侧后，左侧列表项还是绿色高亮 | 根因：Preview 的 `onClose` 只 `preview(null)` 没清选中。修复：`onClose={() => { preview(null); select(null) }}`。其它关闭路径（面板隐藏/Esc）本就带 `select(null)`，仅此一处漏过。 |
| **更新检查"无反应"（已修 2026-08-09）** | 设置面板点"检查"后界面无任何变化 | 根因：主进程 `autoUpdater` 正常检测到新版本并通过 IPC 通知渲染进程，`App.tsx` 也正确将 `updateInfo`/`updateStatus` 写入 zustand store——但**全项目没有任何组件读取这两个字段来渲染 UI**。store 有数据，UI 不消费 → 用户看到一片寂静。修复：在 `App.tsx` 内嵌 UpdateModal 组件（读 `updateStatus` 渲染 available/downloaded/error 三态弹窗 + not-available 底部轻提示）。 |
| **更新错误被静默吞掉（已修 2026-08-09）** | 网络不通 / GitHub API 限流时点"检查"同样无反应 | 根因：① `updater.ts` 的 `checkForUpdates()` catch 块只 `logError()` 返回 null，不通知渲染进程；② `App.tsx` 的 `UPDATE_STATE` 监听缺少 `error`/`progress` 分支。修复：catch 里通过 `getWindow().webContents.send(UPDATE_STATE, {status:'error'})` 推送；渲染端补全 error→红色提示弹窗、progress→保留当前 info。 |
| **版本号恒显示 v1.0.0（已修 2026-08-09）** | 设置面板"关于"区域永远显示 Shelf v1.0.0，与实际版本无关 | 根因：用 `process.env.npm_package_version` 显示版本，该变量仅在 `npm run xxx` 构建时由 electron-vite 注入，**打包后的 Electron 运行时为 undefined**，始终回退到 `'1.0.0'`。修复：新增 IPC 通道 `GET_VERSION`（主进程 `app.getVersion()`），Settings 组件 mount 时异步拉取真实版本号。 |
| **预览文本无法鼠标选中** | 右侧详情文本拖动鼠标选不中 | 根因：`body { user-select:none }` 全局禁选（防拖拽列表误选），未给预览区恢复。修复：`.preview-text` 加 `user-select:text` 覆盖。注意：不要用 `user-select:auto`（部分引擎下仍受限），用 `text` 才稳。 |
| **渲染进程 CPU 192% 死循环** | Activity Monitor 里 `Shelf Helper (Renderer)` 占 ~192% CPU、累计数小时不降 | 根因：`App.tsx` 初始化 `useEffect` 的依赖数组含 `filtered`（`useMemo` 派生值），而 effect 内部又调 `clip.getAll().then(setClips)` → `clips` 变 → `filtered` 变 → effect 重跑 → 无限重渲染风暴（与剪贴板是否变化无关，开机即跑）。修复：拆成两个 mount-only effect（`getAll()` 初始化一次 + IPC 订阅一次），**依赖数组移除 `filtered`**；VISIBILITY handler 改用 `filteredRef` 读最新列表。**教训：派生值（useMemo 结果）绝不能进 effect 依赖，否则极易形成自持续循环。** |
| **主进程 CPU 33% 轮询烧** | `Shelf` 主进程稳定 ~33% CPU | 根因：`clipboard.ts` 每 500ms 轮询，且**在判重之前**就无条件执行最贵操作——图片每轮 `toJPEG(80)` 全分辨率重编码 + SHA-256，文本每轮全量 `readText`+哈希；剪贴板放着截图时每 500ms 烧一次。修复：加「廉价前置检测门」——文本比 `length`+前 120 字符、图片比 `getSize()` 尺寸，**确认可能变了才做 toJPEG/哈希**；轮询间隔 500ms→750ms。空闲时（剪贴板内容不变）几乎零成本。 |
| **重复项无效广播** | 剪贴板内容不变时主进程仍每轮向渲染进程推送整表（含 base64 缩略图），放大渲染重渲染 | 根因：`store.ts` 的 `addText`/`addImage` 命中已存在项时仍 `this.emit()`。修复：重复项仅刷新 `updatedAt` + `scheduleSave()`，不再 `emit()`。 |
| **Enter 键粘贴/复制失效（已修）** | 面板内选中条目按 Enter 应粘贴/复制，但无反应（可能抛 `clip.paste is not a function`） | 根因：`App.tsx` 的 `onKey` 里 `const clip = filtered.find(...)` 把外层 `clip`（ClipApi）变量**遮蔽**成本地 `Clip` 数据对象，后续 `clip.paste(selectedId)` 调的是数据对象而非 API，类型/运行均错。修复：局部变量改名为 `hit`，`clip.paste/copy` 走外层 ClipApi（2026-08-09 补修）。双击中键 `handleDouble` 用的是外层 `clip`，一直正常。 |

| **更新弹窗 Release Notes 显示原始 HTML 标签（已修 2026-08-09）** | 更新提示弹窗里把 GitHub Release 的 `<p>/<ul>/<li>` 标签原样当成文本显示，且内容超出弹窗不可滚动 | 根因：`App.tsx` / `preferences.tsx` 的更新弹窗用 `<pre>{updateInfo.notes}</pre>` 渲染 notes，未解析 HTML 且不可滚动。修复：改用 `<div dangerouslySetInnerHTML={{__html: notes}}>` 渲染富文本，容器加 `maxHeight:180 + overflowY:auto + scrollbarWidth:'thin'` 可滚动。注意：notes 来自 GitHub Release 正文（可信源），`dangerouslySetInnerHTML` 在此可接受；不要改回 `<pre>`。 |
| **偏好设置标题错显"设置"（已修 2026-08-09）** | 独立偏好设置窗口顶部标题仍是"设置"而非"偏好设置" | 根因：`SettingsForm` 未提供标题定制能力，写死 `<h2>设置</h2>`。修复：`SettingsForm` 新增可选 `title` prop（默认 `'设置'`），面板弹窗传默认、偏好窗口传 `title="偏好设置"`。 |
| **偏好设置点"检查"无反应（已修 2026-08-09）** | 在独立偏好设置窗口点"检查更新"界面无任何变化，而主面板点却正常 | 根因：`updater.ts` 的 `setupUpdater` 只向「面板窗口」单发 `UPDATE_STATE`，偏好窗口不在广播列表 → 即使 IPC 调用成功也无 UI 反馈。修复：`updater.ts` 维护 `updateWindows[]` 数组改为**多窗口广播**，新增 `registerUpdateWindow()`；`preferences.ts` 导出 `getPreferencesWindow()`；`index.ts` bootstrap 中 `registerUpdateWindow(getPreferencesWindow)` 注册偏好窗口；`preferences.tsx` 订阅 `UPDATE_STATE` 并渲染完整 UpdateModal。 |
| **设置/偏好白屏崩溃（已修 2026-08-09）** | 打开面板设置或偏好设置窗口直接白屏，看不到任何内容 | 根因：`SettingsForm` 函数体已引用 `{title ?? '设置'}`，但**函数签名漏了解构 `title`**（`{ onClose }` 而非 `{ onClose, title }`），运行时 `ReferenceError: title is not defined` 导致 React 渲染崩溃 → 整页白屏。修复：补全签名为 `SettingsForm({ onClose, title }: { onClose: () => void; title?: string })`。**教训：给组件加 prop 时，签名解构与 JSX 引用必须同步改，否则就是运行时崩溃而非编译期报错（TS 宽松模式下不报错）。** |

| **「已是最新版本」toast 不自动消失（已修 2026-08-13）** | 更新检查返回"已是最新"时底部绿色轻提示 pill 一直停留，只能点击关闭 | 根因：not-available 状态的轻提示 div 仅绑定 `onClick={() => setUpdateDismissed(true)}`，无定时消失逻辑；用户觉得它该像 toast 一样自动退场。修复：`App.tsx` 与 `preferences.tsx` 各加一个 effect——当 `updateStatus==='not-available' && !updateDismissed` 时 `setTimeout(2500ms)` 调 `setUpdateDismissed(true)`，cleanup 清除定时器（状态提前切换时安全）；仍可点击立即关闭。**注意：error / available / downloaded 三态弹窗刻意保持「需手动关闭」不变（避免误关丢失操作），不要给它们也加自动消失。** |

---

## 6. 如何运行 / 验证

```bash
cd /Users/guho/Desktop/Developer/clipboard-manager

npm run dev       # 开发模式（Electron 窗口 + Vite HMR）
npm test          # 纯逻辑单测（17 用例，无需打包，秒级）
npm run build     # 构建到 out/
npm run dist:mac  # 打包 macOS dmg
npm run dist:win  # 打包 Windows nsis
```

- **运行单测（直接 Node，无需 Electron）**：
  `node --experimental-strip-types tests/logic.test.ts`

- **注意**：当前 `node_modules` 已装好（含 Electron 二进制）。若换机器重装，务必保留 `.npmrc` 否则 `npm i` 卡死。

---

## 7. 当前状态 / 注意事项

- ✅ **图标已生成**：`assets/icon.png`（1024² 「白纸浮于绿」剪贴板，薄荷绿 `#34d399`→翠绿 `#059669` 对角渐变，由 `scripts/gen_icon.py` 生成）、`icon.icns`（iconutil 转换多尺寸）、`assets/logo.png`（透明底品牌标识）；托盘图标复用 `icon.png` 缩放 22px。无需再补。
- [ ] **粘贴功能依赖系统权限**：macOS 需「系统设置 → 隐私与安全 → 辅助功能」授权给应用；当前用 `osascript` 模拟 Cmd+V。未授权时粘贴静默失败，复制正常。
- ✅ **已在真机验证 GUI**：用户已安装 dmg 实测——菜单栏托盘图标可见、点击弹菜单（打开面板/偏好设置/退出）、独立偏好设置窗口样式与值同步、面板设置均已验证。剩余如 Windows 版打包、粘贴辅助功能授权仍建议真机确认。
- ✅ **electron-updater 已配置并发版**：`electron-builder.yml` 已加 `publish: github`（owner hyojooo / repo Shelf），已发布 v1.0.0 Release（`latest-mac.yml` + 两个 dmg）。后续发版跑 `npm run publish` 即触发自动更新检测。**注意 `publish` 脚本已加 `--mac --win`**（原先漏写平台参数，导致只打 macOS 包；Windows 包需要 wine，Homebrew 的 `wine-stable` 已标 deprecated，预计 2026-09-01 下架）。
- ✅ **CPU 占用已修复（2026-08-09）**：渲染进程 192% 无限重渲染循环（`App.tsx` effect 依赖含 `filtered`）+ 主进程 33% 轮询烧（`clipboard.ts` 判重前做贵操作）已修复。修复后空闲时各进程 CPU 应趋近 0%。详见第 5 节「渲染进程 CPU 192% 死循环」「主进程 CPU 33% 轮询烧」「重复项无效广播」三条。
- ✅ **更新弹窗 + 偏好设置同步（2026-08-09 后续）**：更新提示弹窗补全四态 UI（available 发现新版本 / downloaded 已下载 / error 检查失败 / not-available 已是最新），Release Notes 现以富文本渲染且可滚动；偏好设置窗口标题改「偏好设置」并接入 `updater.ts` 多窗口广播，点"检查"与主面板行为一致；修复 `SettingsForm` 缺 `title` 解构导致的白屏崩溃。详见第 5 节「更新弹窗 Release Notes 显示原始 HTML 标签」「偏好设置标题错显"设置"」「偏好设置点"检查"无反应」「设置/偏好白屏崩溃」四条。
- [ ] 复制/粘贴快捷键默认 `Cmd/Ctrl+C` 复制选中项；面板唤起快捷键默认 `CommandOrControl+Shift+V`，可在设置页改。
- [ ] **UI 当前状态**：界面采用清新绿主调 —— accent 浅色 `#059669` / 深色 `#34d399`（CSS 变量 `--accent` / `--accent-soft`，定义在 `src/renderer/styles/global.css` 顶部 `:root` 与 `:root[data-theme='dark']`）。该配色与 app 图标（薄荷绿 `#34d399` → 翠绿 `#059669` 渐变）统一，由用户 2026-08-09 明确要求从蓝(`#2f6df6`)切换而来。注意：菜单栏托盘图标沿用 `assets/icon.png` 缩放，同为绿色，与界面主色一致。近期 UI 增量：关闭右侧预览时左侧选中态同步取消（视觉一致）、右侧空白区显示浮动小熊 SVG 空状态、预览文本支持鼠标部分选中复制（`.preview-text` 覆写 `user-select:text`）。
- [ ] **新增「收藏」入口已上线**：列表项 hover 出 ★ 可收藏，标签页新增「收藏」统一查看；收藏项在「全部」标签中置顶。
- [ ] **代码未提交 git**：截至 2026-08-13 所有改动（菜单栏托盘、独立偏好设置窗口、CPU 修复、Enter 修复、更新弹窗四态 UI、偏好同步、白屏修复、**多语言 i18n（7 语言/默认 English）**、**「已是最新版本」toast 自动消失**）仍在 working tree，未 `git commit`。发布/交接前建议先 commit 一次以保留源码与包一致。
- ✅ **多语言已上线（2026-08-13）**：界面支持 English / 简体中文 / 繁體中文 / 日本語 / 한국어 / Русский / Tiếng Việt，**默认 English**。零依赖自研 i18n——`src/shared/i18n/locales/*.json` 字典 + `t(lang,key,params)` 函数；渲染进程经 `I18nProvider`+`useT()`（语言存 `settings.language`，切换即重渲染），主进程托盘菜单直接调 `t()` 并经 `setTrayLanguage()` 运行时切换。设置页「外观」分组新增「语言」下拉（母语名）。新增文案：在 7 个 locale JSON 同步加 key，组件用 `t('key')` 引用，**不要**再写死字符串。字体栈已补 Hiragino Sans / Apple SD Gothic Neo 兜底中日韩。
- ✅ **「已是最新版本」toast 自动消失（2026-08-13）**：更新检查返回"已是最新"时底部绿色轻提示现展示约 2.5s 后自动退场（仍可点击立即关闭）。`App.tsx`/`preferences.tsx` 各加一个定时 effect（依赖 `updateStatus`/`updateDismissed`，cleanup 清除定时器）。error / available / downloaded 三态弹窗仍刻意保持「需手动关闭」，不要给它们也加自动消失（避免误关丢失操作）。

---

## 8. macOS 真机验证指南

启动：`cd <项目根> && npm run dev`。应用**启动即隐藏**（macOS 隐藏 Dock 图标、窗口不自动弹出）。

**打开面板 / 使用菜单栏托盘**：
1. 默认全局快捷键 **`Cmd+Shift+V`**（settings 中 `globalShortcut` 默认值 `CommandOrControl+Shift+V`，可在设置页修改并持久化）。该快捷键为**切换（toggle）语义**：面板隐藏时唤起，面板可见时再按则关闭。
2. 点击**菜单栏托盘图标**（绿色剪贴板，已可见）→ 弹出菜单：
   - **打开面板** —— 唤起主面板（居中或跟随光标）
   - **偏好设置** —— 打开一个独立的偏好设置窗口（与主面板内「设置」内容完全一致，右上角 ✕ 可单独关闭，不影响主面板）
   - **退出** —— 直接退出 app
   - 左键 / 右键点击均弹出此菜单。

**面板弹出位置**：默认 **屏幕居中**（`settings.panelPosition='center'`）。可在设置页「面板位置」分组切到「跟随光标」。该设置即时持久化，下次唤起生效。

**逐项验证**：见第 4 节功能表，逐项对照即可。核心提示：
- 剪切板每 **750ms 轮询**一次（`clipboard.ts`），复制后约 0.75 秒面板更新，无需切窗口。空闲时（剪贴板内容不变）因「廉价前置检测」几乎零 CPU 开销。
- **面板打开即默认预览第一条**（单击列表项可切换预览；单击=预览，双击=粘贴）。
- **粘贴会自动隐藏面板**（双击/回车/预览「粘贴」按钮触发 `hide()` 先行，焦点归还源应用后再发 Cmd+V）。macOS 需「系统设置 → 隐私与安全性 → 辅助功能」授权给应用；未授权时粘贴静默失败，但复制（写回剪切板）正常。
- **面板可拖拽**：从顶栏（标签页四周留白区域）按住拖动即可移动窗口。
- 数据/日志根目录：`~/Library/Application Support/Shelf/`（settings.json / clips.json / 图片 / logs/）。
- 渲染进程 DevTools：`Cmd+Option+I`（开发版默认开启）。

---

## 9. 给新 AI 的建议

1. **改渲染进程逻辑**：直接看 `src/renderer/` 对应组件 + `clip-api.ts` 的 API 列表。
2. **改主进程 / 系统交互**：看 `src/main/` 对应模块 + `src/shared/types.ts` 的 IPC 频道。
3. **动纯算法（去重/搜索/清理）**：改 `src/shared/` 对应文件，然后跑 `npm test` 验证。
4. **新增 IPC 通信**：在 `types.ts` 的 `IPC` 枚举加频道 → `preload/index.ts` 暴露方法 → `main/index.ts` 注册 handler → 渲染进程用 `getClip()` 调用。保持「纯逻辑在 shared、系统能力在主进程」的分层。
5. **不要删除 `.npmrc` 和 `.workbuddy` 目录**。
