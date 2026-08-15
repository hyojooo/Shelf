import type { Clip } from '../../shared/types';
import { useT } from '../i18n';
import VirtualList from './VirtualList';

interface Props {
  items: Clip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onDouble: (id: string) => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string, favorite: boolean) => void;
}

const ROW_HEIGHT = 76;

export default function ClipList(props: Props) {
  return (
    <VirtualList
      items={props.items}
      rowHeight={ROW_HEIGHT}
      renderRow={(item: Clip) => (
        <ClipItemRow
          clip={item}
          selected={item.id === props.selectedId}
          onSelect={() => props.onSelect(item.id)}
          onPreview={() => props.onPreview(item.id)}
          onDouble={() => props.onDouble(item.id)}
          onDelete={() => props.onDelete(item.id)}
          onFavorite={(f) => props.onFavorite(item.id, f)}
        />
      )}
    />
  );
}

interface RowProps {
  clip: Clip;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onDouble: () => void;
  onDelete: () => void;
  onFavorite: (f: boolean) => void;
}

function ClipItemRow({
  clip,
  selected,
  onSelect,
  onPreview,
  onDouble,
  onDelete,
  onFavorite,
}: RowProps) {
  const t = useT();
  return (
    <div
      className={'item' + (selected ? ' selected' : '')}
      onClick={() => {
        onSelect();
        onPreview();
      }}
      onDoubleClick={onDouble}
    >
      <div className="item-thumb">
        {clip.type === 'image' ? (
          <img src={clip.thumb} alt="" draggable={false} />
        ) : (
          <div className="text-badge">T</div>
        )}
      </div>
      <div className="item-body">
        <div className="item-title">
          {clip.type === 'text'
            ? clip.preview
            : t('clip.imageTitle', { w: clip.width, h: clip.height })}
        </div>
        <div className="item-meta">
          <span>{new Date(clip.createdAt).toLocaleString()}</span>
          <span>{(clip.size / 1024).toFixed(1)} KB</span>
        </div>
      </div>
      <div className="item-actions">
        <button
          title={clip.favorite ? t('clip.unfavorite') : t('clip.favorite')}
          className={'icon-btn' + (clip.favorite ? ' fav' : '')}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(!clip.favorite);
          }}
          aria-label={clip.favorite ? t('clip.unfavorite') : t('clip.favorite')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={clip.favorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button
          title={t('clip.delete')}
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={t('clip.delete')}
        >
          <svg
            width="14"
            height="14"
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
    </div>
  );
}
