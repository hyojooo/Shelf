import { useStore } from '../store/useStore';
import { useT } from '../i18n';
import type { ClipTab } from '../../shared/types';

const TABS: { key: ClipTab; labelKey: string; icon?: 'star' }[] = [
  { key: 'all', labelKey: 'tabs.all' },
  { key: 'text', labelKey: 'tabs.text' },
  { key: 'image', labelKey: 'tabs.image' },
  { key: 'favorite', labelKey: 'tabs.favorite', icon: 'star' },
];

export default function Tabs() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const t = useT();
  return (
    <div className="tabs">
      {TABS.map((def) => (
        <button
          key={def.key}
          className={'tab' + (tab === def.key ? ' active' : '')}
          onClick={() => setTab(def.key)}
        >
          {def.icon === 'star' && (
            <svg
              className="tab-star"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
          <span>{t(def.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
