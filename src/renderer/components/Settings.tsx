import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getClip } from '../clip-api'
import type { Settings as SettingsType, ThemeMode, PanelPosition } from '../../shared/types'

// ── 将 KeyboardEvent.code（物理按键码）映射为可读显示名 ──
// macOS 下 Alt+字母会触发字符组合，e.key 返回组合字符而非原始字母，
// 必须用 e.code 识别实际按下的键。
function codeToDisplay(code: string): string | null {
  // 字母键：KeyA → A
  if (code.startsWith('Key') && code.length === 4) return code[3]
  // 数字键：Digit0 → 0
  if (code.startsWith('Digit')) return code.slice(5)
  // 功能 / 特殊键映射
  const special: Record<string, string> = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab',
    Backspace: 'Backspace', Delete: 'Delete',
    Escape: 'Escape', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Backslash: '\\',
    Comma: ',', Period: '.', Slash: '/',
    Minus: '-', Equal: '=',
    Backquote: '`',
    F1:'F1',F2:'F2',F3:'F3',F4:'F4',F5:'F5',F6:'F6',
    F7:'F7',F8:'F8',F9:'F9',F10:'F10',F11:'F11',F12:'F12',
    CapsLock: 'CapsLock',
  }
  return special[code] ?? null
}

// ── 图标（纯文本 emoji/SVG，零依赖）──
const Icon = {
  keyboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M18 16h.01"/></svg>
  ),
  storage: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  ),
  rocket: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="m12 15-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
  ),
  palette: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
  ),
  cursor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
  ),
  center: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
  ),
  paste: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
  ),
}

// ── 自定义 Toggle 开关（替代原生 checkbox）──
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      type="button"
      role="switch"
      aria-checked={checked}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

// ── 设置项分组卡片 ──
function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="s-section">
      <div className="s-section-head">
        {icon && <span className="s-icon">{icon}</span>}
        <span className="s-title">{title}</span>
      </div>
      <div className="s-section-body">{children}</div>
    </div>
  )
}

// ── 设置表单主体（面板弹窗 / 独立偏好窗口共用）──
export function SettingsForm({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [draft, setDraft] = useState<SettingsType>(
    settings ? { ...settings } : ({} as SettingsType)
  )
  const [capturing, setCapturing] = useState(false)

  // 当外部 settings 异步加载到达时，同步 draft（偏好窗口首次打开时 settings 可能还没就绪）
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      setDraft({ ...settings })
    }
  }, [settings])

  if (!settings) return null

  const save = (patch: Partial<SettingsType>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    void getClip().updateSettings(patch).then(setSettings)
  }

  // 快捷键捕获
  // 注意：macOS 下 Alt/Option + 字母会触发字符组合（e.key 返回 ´ 等），
  // 所以必须用 e.code（物理按键码）来识别实际按了哪个键。
  const captureShortcut = () => {
    setCapturing(true)
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handler, true)
        setCapturing(false)
        return
      }
      const parts: string[] = []
      if (e.metaKey) parts.push('Command')
      if (e.ctrlKey) parts.push('Control')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      // 用 e.code 获取物理按键，避免 macOS 组合字符干扰
      const displayKey = codeToDisplay(e.code)
      if (displayKey && !['Control', 'Shift', 'Alt', 'Meta'].includes(displayKey)) {
        const shortcut = [...parts, displayKey].join('+')
        setDraft({ ...draft, globalShortcut: shortcut })
        save({ globalShortcut: shortcut })
        window.removeEventListener('keydown', handler, true)
        setCapturing(false)
      }
    }
    window.addEventListener('keydown', handler, true)
  }

  // 面板位置选项
  const positionOptions: { value: PanelPosition; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'center', label: '屏幕居中', desc: '面板在当前屏幕正中央弹出', icon: Icon.center },
    { value: 'cursor', label: '跟随光标', desc: '面板在鼠标附近弹出', icon: Icon.cursor },
  ]

  return (
    <div className="modal modal-settings" onClick={(e) => e.stopPropagation()}>
      {/* 头部 */}
        <div className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="modal-body modal-scroll">
          {/* ── 快捷键 ── */}
          <Section icon={Icon.keyboard} title="快捷键">
            <label className="s-field">
              <span className="s-label">全局唤起</span>
              <div className={`shortcut-capture ${capturing ? 'capturing' : ''}`} onClick={captureShortcut}>
                <kbd>{draft.globalShortcut}</kbd>
                <span className="shortcut-hint">{capturing ? '请按下组合键…' : '点击修改'}</span>
              </div>
            </label>
          </Section>

          {/* ── 面板位置 ── */}
          <Section icon={Icon.cursor} title="面板位置">
            <div className="position-grid">
              {positionOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`pos-card ${draft.panelPosition === opt.value ? 'active' : ''}`}
                  onClick={() => save({ panelPosition: opt.value })}
                >
                  <span className="pos-icon">{opt.icon}</span>
                  <span className="pos-label">{opt.label}</span>
                  <span className="pos-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* ── 存储与清理 ── */}
          <Section icon={Icon.storage} title="存储与清理">
            <label className="s-field">
              <div className="s-info">
                <span className="s-label">最大存储条数</span>
                <span className="s-desc">超出后将自动清理最旧的记录</span>
              </div>
              <div className="num-input">
                <input
                  type="text"
                  inputMode="numeric"
                  min={10}
                  value={draft.maxItems}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '')
                    setDraft({ ...draft, maxItems: raw ? Number(raw) : 0 })
                  }}
                  onBlur={() => {
                    const val = draft.maxItems >= 10 ? draft.maxItems : 10
                    setDraft({ ...draft, maxItems: val })
                    save({ maxItems: val })
                  }}
                />
                <span className="num-unit">条</span>
              </div>
            </label>
            <label className="s-field">
              <div className="s-info">
                <span className="s-label">超量时单次清理数</span>
                <span className="s-desc">每次触发清理时最多删除的条目数量</span>
              </div>
              <div className="num-input">
                <input
                  type="text"
                  inputMode="numeric"
                  min={10}
                  value={draft.cleanupBatch}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '')
                    setDraft({ ...draft, cleanupBatch: raw ? Number(raw) : 0 })
                  }}
                  onBlur={() => {
                    const val = draft.cleanupBatch >= 10 ? draft.cleanupBatch : 10
                    setDraft({ ...draft, cleanupBatch: val })
                    save({ cleanupBatch: val })
                  }}
                />
                <span className="num-unit">条</span>
              </div>
            </label>
          </Section>

          {/* ── 行为偏好 ── */}
          <Section icon={Icon.paste} title="行为偏好">
            <div className="s-field-row">
              <div className="s-info">
                <span className="s-label">双击直接粘贴到焦点窗口</span>
                <span className="s-desc">需要「辅助功能」权限，未授权时仅复制到剪贴板</span>
              </div>
              <Toggle checked={draft.pasteOnDoubleClick} onChange={(v) => save({ pasteOnDoubleClick: v })} />
            </div>

            <div className="s-field-row">
              <div className="s-info">
                <span className="s-label">开机自启动</span>
                <span className="s-desc">登录系统后自动后台运行</span>
              </div>
              <Toggle checked={draft.launchAtLogin} onChange={(v) => save({ launchAtLogin: v })} />
            </div>
          </Section>

          {/* ── 外观 ── */}
          <Section icon={Icon.palette} title="外观">
            <label className="s-field">
              <span className="s-label">主题模式</span>
              <select
                value={draft.theme}
                onChange={(e) => save({ theme: e.target.value as ThemeMode })}
                className="s-select"
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
          </Section>

          {/* ── 关于 / 更新 ── */}
          <Section icon={Icon.refresh} title="关于">
            <div className="s-field-row">
              <div className="s-info">
                <span className="s-label">检查更新</span>
                <span className="s-desc">Shelf v{process.env.npm_package_version ?? '1.0.0'}</span>
              </div>
              <button className="s-btn" onClick={() => void getClip().checkUpdate()}>
                检查
              </button>
            </div>
          </Section>
        </div>
      </div>
  )
}

// ── 面板内弹窗包装（带遮罩，点击遮罩关闭）──
export default function Settings({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <SettingsForm onClose={onClose} />
    </div>
  )
}
