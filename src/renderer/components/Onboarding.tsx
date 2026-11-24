import { useT } from '../i18n';

/** 首次启动引导：明确告诉用户应用已在运行、菜单栏图标位置与唤起快捷键 */
export default function Onboarding({
  shortcut,
  onDone,
}: {
  shortcut: string;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <div className="onb-mask">
      <div className="onb-card">
        <div className="onb-mark">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
            <line x1="8" y1="11" x2="16" y2="11" />
            <line x1="8" y1="15" x2="13" y2="15" />
          </svg>
        </div>
        <h2 className="onb-title">{t('onboarding.title')}</h2>
        <p className="onb-desc">{t('onboarding.desc')}</p>
        <div className="onb-shortcut">
          <span>{t('onboarding.shortcut')}</span>
          <kbd>{shortcut || '—'}</kbd>
        </div>
        <p className="onb-hint">{t('onboarding.tray')}</p>
        <button className="onb-btn" onClick={onDone}>
          {t('onboarding.start')}
        </button>
      </div>
    </div>
  );
}
