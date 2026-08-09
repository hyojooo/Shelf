import { useEffect, useMemo, useCallback, useRef, useState } from 'react'
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
      getVersion: () => Promise.resolve('1.0.0'),
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
  const updateInfo = useStore((s) => s.updateInfo)
  const updateStatus = useStore((s) => s.updateStatus)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  // 实时过滤 + 收藏置顶 + 按更新时间降序
  const filtered = useMemo(() => {
    const list = filterClips(clips, tab, query)
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }, [clips, tab, query])

  // 始终持有最新 filtered，供一次性订阅的 VISIBILITY handler 安全读取（避免把 filtered 放进 effect 依赖形成无限循环）
  const filteredRef = useRef(filtered)
  filteredRef.current = filtered

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

  // 初始化数据：仅 mount 时拉取一次，之后靠主进程 IPC.UPDATED 事件推送更新
  useEffect(() => {
    void clip.getAll().then(setClips)
    void clip.getSettings().then(setSettings)
  }, [setClips, setSettings])

  // 订阅主进程事件：mount 时注册一次，依赖全部为稳定的 store action，故空依赖不重订阅
  useEffect(() => {
    const offs = [
      clip.on(IPC.UPDATED, (c: Clip[]) => setClips(c)),
      clip.on(IPC.SETTINGS_UPDATED, (s) => setSettings(s as SettingsType)),
      clip.on(IPC.OPEN_SETTINGS, () => setSettingsOpen(true)),
      clip.on(IPC.VISIBILITY, (visible: boolean) => {
        if (!visible) {
          select(null)
          preview(null)
        } else {
          // 面板打开时默认选中并预览第一条（读 ref 中的最新列表，避免依赖 filtered）
          const first = filteredRef.current[0]
          if (first) {
            select(first.id)
            preview(first.id)
          }
        }
      }),
      clip.on(IPC.SHORTCUT_ERROR, (acc: string) => {
        window.alert(`快捷键 "${acc}" 注册失败，可能已被系统或其它程序占用，请在设置中更换。`)
      }),
      clip.on(IPC.UPDATE_STATE, (st: { status: string; version?: string; notes?: string; message?: string; percent?: number }) => {
        setUpdateDismissed(false) // 任何新状态都重新显示
        if (st.status === 'available') setUpdate({ version: st.version ?? '', notes: st.notes ?? '' }, 'available')
        else if (st.status === 'not-available') setUpdate(null, 'not-available')
        else if (st.status === 'downloaded') setUpdate(useStore.getState().updateInfo, 'downloaded')
        else if (st.status === 'error') {
          // 错误状态也写入 store（message 可用于调试），用 alert 确保用户可见
          setUpdate({ version: '', notes: st.message ?? '检查更新失败' }, 'error')
        }
        else if (st.status === 'progress') {
          // 进度更新：保留当前 info，追加 percent
          setUpdate(useStore.getState().updateInfo ?? { version: '', notes: '' }, 'progress')
        }
      })
    ]
    return () => offs.forEach((off) => off())
  }, [setClips, setSettings, setSettingsOpen, select, preview, setUpdate])

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
        const hit = filtered.find((c) => c.id === selectedId)
        if (!hit) return
        // 注意：此处必须用外层 clip(ClipApi)，不得遮蔽为本地 Clip 数据对象（否则 paste/copy 失效）
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

        <div className="preview-area">
          {previewId ? (
            <Preview id={previewId} onClose={() => { preview(null); select(null) }} />
          ) : (
            <div className="preview-empty">
              <svg className="bear" width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* 耳朵 */}
                <circle cx="22" cy="26" r="12" fill="var(--muted)" opacity=".2"/>
                <circle cx="22" cy="26" r="7" fill="var(--muted)" opacity=".15"/>
                <circle cx="74" cy="26" r="12" fill="var(--muted)" opacity=".2"/>
                <circle cx="74" cy="26" r="7" fill="var(--muted)" opacity=".15"/>
                {/* 脸 */}
                <ellipse cx="48" cy="56" rx="34" ry="30" fill="var(--muted)" opacity=".1"/>
                {/* 口鼻 */}
                <ellipse cx="48" cy="62" rx="16" ry="12" fill="var(--muted)" opacity=".12"/>
                {/* 鼻子 */}
                <ellipse cx="48" cy="58" rx="5" ry="3.5" fill="var(--muted)" opacity=".25"/>
                {/* 眼睛 */}
                <circle cx="36" cy="50" r="4" fill="var(--muted)" opacity=".35"/>
                <circle cx="60" cy="50" r="4" fill="var(--muted)" opacity=".35"/>
                {/* 眼睛高光 */}
                <circle cx="37.5" cy="48.5" r="1.3" fill="#fff" opacity=".6"/>
                <circle cx="61.5" cy="48.5" r="1.3" fill="#fff" opacity=".6"/>
                {/* 嘴巴 — 微笑弧线 */}
                <path d="M42 66 Q48 72 54 66" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".3"/>
                {/* 腮红 */}
                <ellipse cx="28" cy="58" rx="6" ry="4" fill="var(--accent)" opacity=".12"/>
                <ellipse cx="68" cy="58" rx="6" ry="4" fill="var(--accent)" opacity=".12"/>
              </svg>
              <p className="preview-empty__text">选择一条记录查看详情</p>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}

      {/* 更新提示弹窗 */}
      {!updateDismissed && (updateStatus === 'available' || updateStatus === 'downloaded' || updateStatus === 'error') && (
        <div className="modal-mask" onClick={() => updateStatus === 'error' && setUpdateDismissed(true)}>
          <div className="modal update-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h2>{updateStatus === 'downloaded' ? '更新已下载' : updateStatus === 'error' ? '更新检查失败' : '发现新版本'}</h2>
              <button className="icon-btn" onClick={() => setUpdateDismissed(true)} title="关闭">✕</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              {updateStatus === 'available' && updateInfo && (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Shelf <span style={{ color: 'var(--accent)' }}>v{updateInfo.version}</span>
                  </p>
                  {updateInfo.notes && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--muted)',
                        lineHeight: 1.7,
                        marginBottom: 16,
                        background: 'var(--panel)',
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        maxHeight: 180,
                        overflowY: 'auto',
                        scrollbarWidth: 'thin'
                      }}
                      dangerouslySetInnerHTML={{ __html: updateInfo.notes }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="s-btn"
                      style={{ flex: 1, padding: '9px 0', textAlign: 'center' }}
                      onClick={() => setUpdateDismissed(true)}
                    >
                      稍后再说
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600
                      }}
                      onClick={() => { void clip.checkUpdate() }}
                    >
                      下载并安装
                    </button>
                  </div>
                </>
              )}
              {updateStatus === 'downloaded' && updateInfo && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>
                    Shelf <strong>v{updateInfo.version}</strong> 已下载完成，重启应用即可安装。
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="s-btn"
                      style={{ flex: 1, padding: '9px 0', textAlign: 'center' }}
                      onClick={() => setUpdateDismissed(true)}
                    >
                      下次再说
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600
                      }}
                      onClick={() => clip.installUpdate()}
                    >
                      重启并安装
                    </button>
                  </div>
                </>
              )}
              {updateStatus === 'error' && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                    {updateInfo?.notes || '无法连接到更新服务器，请稍后重试。'}
                  </p>
                  <button
                    className="s-btn"
                    style={{ width: '100%', padding: '9px 0', textAlign: 'center' }}
                    onClick={() => setUpdateDismissed(true)}
                  >
                    知道了
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "已是最新版本" 轻提示 */}
      {!updateDismissed && updateStatus === 'not-available' && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 18px',
          fontSize: 12,
          color: 'var(--muted)',
          boxShadow: 'var(--shadow)',
          zIndex: 20,
          animation: 'fade-in 0.2s ease-out',
          pointerEvents: 'auto'
        }}
        onClick={() => setUpdateDismissed(true)}>
          ✅ 已是最新版本
        </div>
      )}
    </div>
  )
}
