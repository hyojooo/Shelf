import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getClip } from '../clip-api';
import { useT } from '../i18n';

const MAX_PREVIEW_CHARS = 20_000;

export default function Preview({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const clip = useStore((s) => s.clips.find((c) => c.id === id));
  const showToast = useStore((s) => s.showToast);
  const t = useT();
  const [lightbox, setLightbox] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Hooks 必须无条件执行：clip 可能因为删除/清空而变成 undefined，
  // 若在此之前提前 return，hook 数量会变化并导致 React 整树卸载（白屏）。
  const clipId = clip?.id ?? '';
  useEffect(() => {
    setLightbox(false);
    setLightboxSrc(null);
  }, [clipId]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        setLightbox(false);
        setLightboxSrc(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [lightbox]);

  if (!clip) return null;

  const handleCopy = () => {
    void getClip().copy(clip.id);
    showToast(t('preview.copied'));
  };
  const handlePaste = () => {
    void getClip().paste(clip.id);
    showToast(t('preview.pasted'));
  };

  const openLightbox = () => {
    setLightbox(true);
    setLightboxSrc(null);
    void getClip()
      .getImageUrl(clip.id)
      .then((url) => setLightboxSrc(url || null))
      .catch(() => setLightboxSrc(null));
  };

  const closeLightbox = () => {
    setLightbox(false);
    setLightboxSrc(null);
  };

  const text =
    clip.type === 'text' && clip.text.length > MAX_PREVIEW_CHARS
      ? `${clip.text.slice(0, MAX_PREVIEW_CHARS)}\n\n…`
      : clip.type === 'text'
        ? clip.text
        : '';

  return (
    <aside className="preview">
      <div className="preview-head">
        <span>
          {clip.type === 'text'
            ? t('preview.textTitle')
            : t('preview.imageTitle')}
        </span>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label={t('clip.close')}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="preview-body">
        {clip.type === 'text' ? (
          <pre className="preview-text">{text}</pre>
        ) : (
          <img
            className="preview-img"
            src={clip.thumb}
            alt=""
            draggable={false}
            onClick={openLightbox}
            title={t('preview.zoom')}
          />
        )}
      </div>
      <div className="preview-foot">
        <span>{new Date(clip.createdAt).toLocaleString()}</span>
        <span>{(clip.size / 1024).toFixed(1)} KB</span>
      </div>
      <div className="preview-actions">
        <button onClick={handleCopy}>{t('preview.copy')}</button>
        <button className="primary" onClick={handlePaste}>
          {t('preview.paste')}
        </button>
      </div>

      {lightbox && clip.type === 'image' && (
        <div
          className="lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
        >
          <button
            className="lightbox-close icon-btn"
            aria-label={t('clip.close')}
            onClick={closeLightbox}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            className="lightbox-img"
            src={lightboxSrc ?? clip.thumb}
            alt=""
            draggable={false}
          />
        </div>
      )}
    </aside>
  );
}
