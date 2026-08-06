import { useEffect, useMemo, useCallback } from 'react'
import { useStore } from './store/useStore'
import { filterClips } from '../shared/search'
import { IPC, type Clip, type Settings as SettingsType } from '../shared/types'
import type { ClipApi } from '../preload/index'
import Tabs from './components/Tabs'
import SearchBar from './components/SearchBar'
import ClipList from './components/ClipList'
import Preview from './components/Preview'
import Settings from './components/Settings'

declare global {
  interface Window {
    clip?: ClipApi
  }
}

/** 安全访问 window.clip，缺失时返回空实现（兼容纯浏览器调试） */
const clip: ClipApi = typeof window !== 'undefined' && window.clip
  ? window.clip
  : {
      getAll: () => Promise.resolve([]),
      favorite: () => Promise.resolve(false),
      deleteClip: () => Promise.resolve(false),
      clearAll: () => Promise.resolve(false),
      copy: () => Promise.resolve(false),
      paste: () => Promise.resolve(false),
      getSettings: () => Promise.resolve({} as any),
      updateSettings: () => Promise.resolve({} as any),
      checkUpdate: () => Promise.resolve(null),
      installUpdate: () => {},
      quit: () => Promise.resolve(false),
      on: () => () => {}
    }

export default function App() {
  const clips = useStore((s) => s.clips)
  const tab = useStore((s) => s.tab)
  const query = useStore((s) => s.query)
  const selectedId = useStore((s) => s.selectedId)
  const previewId = useStore((s) => s.previewId)
  const settings = useStore((s) => s.settings)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setClips = useStore((s) => s.setClips)
  const setSettings = useStore((s) => s.setSettings)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const select = useStore((s) => s.select)
  const preview = useStore((s) => s.preview)
  const setUpdate = useStore((s) => s.setUpdate)

  // 实时过滤 + 收藏置顶 + 按更新时间降序
  const filtered = useMemo(() => {
    const list = filterClips(clips, tab, query)
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }, [clips, tab, query])

  // 主题：跟随系统 / 浅色 / 深色
  useEffect(() => {
    const apply = () => {
      const mode = settings?.theme ?? 'system'
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const dark = mode === 'dark' || (mode === 'system' && sysDark)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings])

  // 初始化数据 + 订阅主进程事件
  useEffect(() => {
    void clip.getAll().then(setClips)
    void clip.getSettings().then(setSettings)
    const offs = [
      clip.on(IPC.UPDATED, (c: Clip[]) => setClips(c)),
      clip.on(IPC.SETTINGS_UPDATED, (s) => setSettings(s as SettingsType)),
      clip.on(IPC.OPEN_SETTINGS, () => setSettingsOpen(true)),
      clip.on(IPC.VISIBILITY, (visible: boolean) => {
        if (!visible) {
          select(null)
          preview(null)
        } else {
          // 面板打开时默认选中并预览第一条
          const first = filtered[0]
          if (first) {
            select(first.id)
            preview(first.id)
          }
        }
      }),
      clip.on(IPC.SHORTCUT_ERROR, (acc: string) => {
        window.alert(`快捷键 "${acc}" 注册失败，可能已被系统或其它程序占用，请在设置中更换。`)
      }),
      clip.on(IPC.UPDATE_STATE, (st: { status: string; version?: string; notes?: string }) => {
        if (st.status === 'available') setUpdate({ version: st.version ?? '', notes: st.notes ?? '' }, 'available')
        else if (st.status === 'not-available') setUpdate(null, 'not-available')
        else if (st.status === 'downloaded') setUpdate(useStore.getState().updateInfo, 'downloaded')
      })
    ]
    return () => offs.forEach((off) => off())
  }, [setClips, setSettings, setSettingsOpen, select, preview, setUpdate, filtered])

  // 键盘导航（功能 4）：上下选择、回车粘贴/复制、Cmd/Ctrl+C 复制、Delete 删除、Esc 关闭
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else {
          select(null)
          preview(null)
        }
        return
      }
      if (settingsOpen) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.getElementById('clip-search')?.focus()
        return
      }
      if (typing) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = filtered.findIndex((c) => c.id === selectedId)
        const next = e.key === 'ArrowDown'
          ? Math.min(filtered.length - 1, idx + 1)
          : Math.max(0, idx - 1)
        if (filtered[next]) select(filtered[next].id)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedId) {
          void clip.copy(selectedId)
          e.preventDefault()
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          void clip.deleteClip(selectedId)
          select(null)
        }
        return
      }
      if (e.key === 'Enter' && selectedId) {
        const clip = filtered.find((c) => c.id === selectedId)
        if (!clip) return
        if (settings?.pasteOnDoubleClick) void clip.paste(selectedId)
        else void clip.copy(selectedId)
      }
    },
    [filtered, selectedId, settingsOpen, settings, select, preview, setSettingsOpen]
  )

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const handleDouble = useCallback(
    (id: string) => {
      if (settings?.pasteOnDoubleClick) void clip.paste(id)
      else {
        void clip.copy(id)
        preview(id)
      }
    },
    [settings, preview]
  )

  return (
    <div className="app">
      <header className="topbar">
        <Tabs />
      </header>
      <SearchBar />
      <div className="body">
        <main className="content">
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-title">暂无内容</div>
              <div className="empty-sub">复制文本或截图后，会自动出现在这里</div>
            </div>
          ) : (
            <ClipList
              items={filtered}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              onPreview={(id) => preview(id)}
              onDouble={handleDouble}
              onDelete={(id) => {
                void clip.deleteClip(id)
                if (selectedId === id) select(null)
              }}
              onFavorite={(id, f) => void clip.favorite(id, f)}
            />
          )}
        </main>

        {previewId && <Preview id={previewId} onClose={() => preview(null)} />}
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
