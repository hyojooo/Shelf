<div align="center">

<img src="assets/logo.png" width="120" alt="Shelf logo" />

# Shelf

**你的剪贴板「置物架」——把复制过的内容统统收好，随时取用。**

**Shelf** 是一款跨平台桌面剪贴板历史管理工具（**macOS 10.15+ / Windows 10+**），在后台自动捕获、整理并回放你复制过的文本与图片。

[![Release](https://img.shields.io/github/v/release/hyojooo/Shelf?color=22c55e)](https://github.com/hyojooo/Shelf/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/hyojooo/Shelf/total?color=22c55e)](https://github.com/hyojooo/Shelf/releases)
[![License](https://img.shields.io/github/license/hyojooo/Shelf?color=22c55e)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-22c55e)](#-平台支持)

[English](README.md) &nbsp;·&nbsp; **简体中文**

</div>

![Shelf — 跨平台剪贴板历史管理器](assets/screenshot.png)

---

## ✨ 功能

- **自动记录** — 复制的文本与图片在后台自动保存，无需手动操作
- **智能去重** — 重复复制同一内容只刷新位置，不会产生冗余记录
- **分类标签页** — 全部 / 文本 / 图片 / 收藏 分类浏览
- **实时搜索** — 模糊匹配，随手定位任意历史片段
- **单击预览、双击粘贴** — 粘贴回你刚才操作的窗口，自动处理窗口失焦
- **收藏置顶** — 重要内容一键收藏，且永久保留
- **图片预览与放大** — 列表内展示缩略图，点击查看原图大图
- **全局快捷键** — 一键唤起或隐藏面板
- **本地持久化** — 数据仅保存在本机，超量自动清理（收藏不受影响）
- **菜单栏 / 托盘常驻** — 随时一键呼出，不占用 Dock
- **内置自动更新** — 新版本自动检测、下载并安装

## 📦 安装

### 下载安装包

前往 [Releases](https://github.com/hyojooo/Shelf/releases) 页面下载对应平台的安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS（Apple Silicon / Intel） | `.dmg` |
| Windows 10+ | `.exe` |

### 从源码构建

```bash
git clone https://github.com/hyojooo/Shelf.git
cd Shelf
npm install

npm run dev        # 开发模式运行
npm run dist:mac   # 打包 macOS
npm run dist:win   # 打包 Windows
```

需要 Node.js 18 或更高版本。

## 🚀 使用

1. 启动 Shelf，它会常驻菜单栏（macOS）或系统托盘（Windows）。
2. 按 **`Cmd + Shift + V`**（macOS）/ **`Ctrl + Shift + V`**（Windows）唤起面板，再按一次收起。
3. 单击列表项预览内容，双击即可把内容粘贴回你刚才操作的窗口。

### 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `↑` / `↓` | 上下切换选中项 |
| `⌘/Ctrl + F` | 聚焦搜索框 |
| `⌘/Ctrl + C` | 复制选中项 |
| `Enter` | 复制或粘贴选中项（取决于你的设置） |
| `Delete` / `Backspace` | 删除选中项 |
| `Esc` | 关闭预览 / 清空选中 |

## 🖥 平台支持

**macOS 10.15+**

- 粘贴功能需要授权：**系统设置 → 隐私与安全性 → 辅助功能 → 勾选 Shelf**。
- 托盘常驻时会隐藏 Dock 图标。

**Windows 10+**

- 开机自启由安装器注册。
- 粘贴通过模拟系统快捷键实现。

## 🛠 技术栈

Electron · React 18 · TypeScript · Vite（electron-vite）· Zustand · electron-builder / electron-updater

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request。如果 Shelf 对你有帮助，给个 ⭐ 能让更多人看到它。

## 📄 License

[MIT](./LICENSE) © [hyojooo](https://github.com/hyojooo)

<div align="center">
<sub><a href="README.md">English documentation</a></sub>
</div>
