import { useStore } from '../store/useStore'
import { getClip } from '../clip-api'

// 单击预览详情（功能 4）：侧边/浮层展示完整内容
export default function Preview({ id, onClose }: { id: string; onClose: () => void }) {
  const clip = useStore((s) => s.clips.find((c) => c.id === id))
  if (!clip) return null
  return (
    <aside className="preview">
      <div className="preview-head">
        <span>{clip.type === 'text' ? '文本详情' : '图片详情'}</span>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="preview-body">
        {clip.type === 'text' ? (
          <pre className="preview-text">{clip.text}</pre>
        ) : (
          <img className="preview-img" src={clip.thumb} alt="" draggable={false} />
        )}
      </div>
      <div className="preview-foot">
        <span>{new Date(clip.createdAt).toLocaleString()}</span>
        <span>{(clip.size / 1024).toFixed(1)} KB</span>
      </div>
      <div className="preview-actions">
        <button onClick={() => void getClip().copy(clip.id)}>复制</button>
        <button className="primary" onClick={() => void getClip().paste(clip.id)}>
          粘贴
        </button>
      </div>
    </aside>
  )
}
