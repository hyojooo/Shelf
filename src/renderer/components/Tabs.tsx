import { useStore } from '../store/useStore'
import type { ClipTab } from '../../shared/types'

const TABS: { key: ClipTab; label: string; icon?: 'star' }[] = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'favorite', label: '收藏', icon: 'star' }
]

export default function Tabs() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={'tab' + (tab === t.key ? ' active' : '')}
          onClick={() => setTab(t.key)}
        >
          {t.icon === 'star' && (
            <svg className="tab-star" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
