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
├── electron.vite.config.ts   # 三进程构建配置（main/preload/renderer 分离）
├── electron-builder.yml      # 打包配置（mac/win，需补 assets 图标）
├── tsconfig.json
├── src/
│   ├── shared/               # 主/渲染共享的纯逻辑（可单测、无 Electron 依赖）
│   │   ├── types.ts          # 全局类型 + IPC 频道常量；ClipTab 含 'all'|'text'|'image'|'favorite'；Settings 含 panelPosition（'cursor'|'center'，默认 center）
│   │   ├── hash.ts           # SHA-256 内容哈希去重（文本/图片盐值隔离）
│   │   ├── search.ts         # 模糊搜索（子序列打分 + 图片时间戳匹配）；filterClips 支持 favorite 分支仅显示收藏
│   │   └── cleanup.ts        # 超量清理策略（收藏豁免、最旧 N 条）
│   ├── main/                 # 主进程（Node/Electron 环境）
│   │   ├── index.ts          # 入口：装配 + IPC handler；全局快捷键回调用 toggle()（隐显切换）；PASTE 用「hide()先行→60ms延时→写剪贴板→Cmd+V」解决失焦
│   │   ├── window.ts         # 面板窗口：置顶/失焦隐藏/可拖拽顶栏；showPanel(position) 支持 cursor（跟随光标）与 center（屏幕居中，默认）；captureSourceApp/getSourceApp
│   │   ├── clipboard.ts      # 剪切板监听 + 捕获（含抑制回环 suppressNextCapture）
│   │   ├── store.ts          # 内存存储 + JSON 原子持久化 + 图片压缩存盘
│   │   ├── settings.ts       # 设置读写（maxItems/cleanupBatch 等）
│   │   ├── tray.ts           # 托盘常驻图标（macOS 隐藏 Dock）
│   │   ├── shortcut.ts       # globalShortcut 注册/注销
│   │   ├── updater.ts        # electron-updater 更新检查
│   │   └── logger.ts         # 全局异常/崩溃日志 → userData/logs/
│   ├── preload/
│   │   └── index.ts          # contextBridge 暴露 window.clip API（导出类型 ClipApi）
│   └── renderer/             # React 渲染进程
│       ├── App.tsx           # 根组件：键盘导航、事件订阅、主题
│       ├── clip-api.ts       # 【关键】安全访问 window.clip 的包装层 getClip()
│       ├── main.tsx          # React 挂载入口
│       ├── index.html
│       ├── store/useStore.ts # zustand 状态管理
│       ├── components/
│       │   ├── Tabs.tsx          # 全部/文本/图片/收藏 分类标签（收藏带 SVG 星标）
│       │   ├── SearchBar.tsx     # 实时模糊搜索框（放大镜/齿轮/清除均为 SVG）
│       │   ├── ClipList.tsx      # 列表容器（接入虚拟滚动）；收藏星标/删除 X 为 SVG
│       │   ├── VirtualList.tsx   # 自研虚拟滚动
│       │   ├── Preview.tsx       # 单击预览（右侧固定列，非浮层抽屉）；关闭按钮 SVG
│       │   └── Settings.tsx      # 设置页：分组卡片式 UI、Toggle 开关、面板位置选择器、快捷键捕获、数值输入框
│       └── styles/global.css  # CSS 变量深/浅色适配 + 动画
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

---

## 4. 10 项功能实现状态（全部完成）

| # | 功能 | 主要文件 |
|---|------|---------|
| 1 | 捕获文本/图片 + 内容哈希去重 + 图片压缩 | clipboard.ts / store.ts / shared/hash.ts |
| 2 | 全局快捷键唤起 + 始终置顶 + 失焦隐藏 | window.ts / shortcut.ts |
| 3 | 分类标签页（全部/文本/图片/收藏）+ 实时模糊搜索 | Tabs / SearchBar / shared/search.ts |
| 4 | 单击预览（右侧固定列）+ 双击粘贴（hide 先行落点修正）+ 快捷键复制 | App / Preview / 主进程 sendPasteKeystroke |
| 5 | 菜单栏常驻托盘 | tray.ts |
| 6 | 设置：快捷键/最大条数/超量单次清理数/自启/主题/面板位置 | Settings / settings.ts |
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

## 7. 当前待办 / 注意事项

- [ ] **图标缺失**：`assets/` 目录需要 `icon.png` + 托盘图标，打包前必须补，否则托盘/打包报错。
- [ ] **粘贴功能依赖系统权限**：macOS 需「系统设置 → 隐私与安全 → 辅助功能」授权给应用；当前用 `osascript` 模拟 Cmd+V。
- [ ] **未实机验证 GUI**：此项目在沙箱中仅验证了纯逻辑单测 + 构建通过；Electron GUI、全局快捷键、托盘、粘贴、打包需在有显示器/网络的真机运行确认。
- [ ] **electron-updater 需配置**：`updater.ts` 已实现检查逻辑，但需在 `electron-builder.yml` 配 `publish`（如 GitHub Releases）才能真下载更新。
- [ ] 复制/粘贴快捷键默认 `Cmd/Ctrl+C` 复制选中项；面板唤起快捷键默认（详见 settings.ts 默认值），可在设置页改。
- [ ] **UI 当前状态**：采用原生蓝色主调（accent `#2f6df6` / 深色 `#4c8dff`）的简洁风格，**曾尝试过紫色美化版（#7c3aed）但用户要求回滚**。若后续要做视觉升级，请先与用户确认是否要紫色方案，不要自行切换主色。
- [ ] **新增「收藏」入口已上线**：列表项 hover 出 ★ 可收藏，标签页新增「收藏」统一查看；收藏项在「全部」标签中置顶。

---

## 8. macOS 真机验证指南

启动：`cd <项目根> && npm run dev`。应用**启动即隐藏**（macOS 隐藏 Dock 图标、窗口不自动弹出）。

**打开面板的 3 种方式**：
1. 默认全局快捷键 **`Cmd+Shift+V`**（settings 中 `globalShortcut` 默认值 `CommandOrControl+Shift+V`，可在设置页修改并持久化）。该快捷键为**切换（toggle）语义**：面板隐藏时唤起，面板可见时再按则关闭。
2. 点击菜单栏托盘图标（当前为 1×1 透明 PNG 占位，可能看不见但仍可点）
3. 右键托盘 →「打开面板」

**面板弹出位置**：默认 **屏幕居中**（`settings.panelPosition='center'`）。可在设置页「面板位置」分组切到「跟随光标」。该设置即时持久化，下次唤起生效。

**逐项验证**：见第 4 节功能表，逐项对照即可。核心提示：
- 剪切板每 **500ms 轮询**一次（`clipboard.ts`），复制后约半秒面板更新，无需切窗口。
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
