import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLang, useT } from '../i18n';

export interface UpdateDialogProps {
  status: 'available' | 'progress' | 'downloaded' | 'error';
  version: string;
  notes: string;
  percent?: number;
  errorText?: string;
  onDismiss: () => void;
  onDownload: () => void;
  onRetry: () => void;
  onInstall: () => void;
}

const CJK =
  /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\u30a1-\u30fc\uac00-\ud7af]/;
const BULLET = /^\s*[-*•]\s+/;
const HEADING = /^\s*#{1,6}\s+/;
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function filterByLang(md: string, lang: string): string {
  const wantCJK = /^(zh|ja|ko)/.test(lang);
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (BULLET.test(lines[i])) {
      const group: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) group.push(lines[i++]);
      const mixed =
        group.some((l) => CJK.test(l)) && group.some((l) => !CJK.test(l));
      out.push(
        ...(mixed ? group.filter((l) => CJK.test(l) === wantCJK) : group),
      );
      continue;
    }
    out.push(lines[i++]);
  }
  return out.join('\n');
}

function inline(text: string, key: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter((s) => s !== '')
    .map((part, i) => {
      const k = `${key}-${i}`;
      if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part))
        return <strong key={k}>{part.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(part))
        return (
          <code className="upd-code" key={k}>
            {part.slice(1, -1)}
          </code>
        );
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) return <span key={k}>{link[1]}</span>;
      return <span key={k}>{part}</span>;
    });
}

function renderNotes(md: string, lang: string): ReactNode[] {
  const lines = filterByLang(md, lang).split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    nodes.push(
      <ul className="upd-list" key={`ul-${key++}`}>
        {list.map((item, i) => (
          <li key={i}>{inline(item.replace(BULLET, '').trim(), `i-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      list.push(line);
      continue;
    }
    flushList();
    if (HEADING.test(line)) {
      nodes.push(
        <h3 className="upd-h" key={`h-${key++}`}>
          {inline(line.replace(HEADING, '').trim(), `hi-${key}`)}
        </h3>,
      );
    } else if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      nodes.push(<div className="upd-hr" key={`hr-${key++}`} />);
    } else {
      nodes.push(
        <p className="upd-p" key={`p-${key++}`}>
          {inline(line.trim(), `pi-${key}`)}
        </p>,
      );
    }
  }
  flushList();
  return nodes;
}

const Mark = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M4.5 6.2A2.2 2.2 0 0 1 6.7 4h10.6a2.2 2.2 0 0 1 2.2 2.2v1.1a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2V6.2Z"
      fill="currentColor"
      opacity="0.55"
    />
    <path
      d="M4.5 12.1a2.2 2.2 0 0 1 2.2-2.2h10.6a2.2 2.2 0 0 1 2.2 2.2v1.1a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2v-1.1Z"
      fill="currentColor"
      opacity="0.8"
    />
    <path
      d="M4.5 18a2.2 2.2 0 0 1 2.2-2.2h6.6a2.2 2.2 0 0 1 2.2 2.2 2.2 2.2 0 0 1-2.2 2.2H6.7A2.2 2.2 0 0 1 4.5 18Z"
      fill="currentColor"
    />
  </svg>
);

export default function UpdateDialog({
  status,
  version,
  notes,
  percent = 0,
  errorText,
  onDismiss,
  onDownload,
  onRetry,
  onInstall,
}: UpdateDialogProps) {
  const t = useT();
  const lang = useLang();
  const [current, setCurrent] = useState('');

  useEffect(() => {
    void window.clip?.getVersion().then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  const body = useMemo(() => renderNotes(notes, lang), [notes, lang]);
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const busy = status === 'progress';

  const title =
    status === 'error'
      ? t('update.errorTitle')
      : status === 'downloaded'
        ? t('update.downloaded')
        : t('update.found');

  return (
    <div
      className="upd-mask"
      onClick={() => !busy && onDismiss()}
      role="presentation"
    >
      <div
        className={`upd-card upd-card--${status}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="upd-head">
          <div className="upd-mark">
            <Mark />
          </div>
          <div className="upd-headtext">
            <h2 className="upd-title">{title}</h2>
            <p className="upd-sub">
              {status === 'error' ? (
                <span>{t('update.errorSub')}</span>
              ) : (
                <>
                  {current && (
                    <>
                      <span className="upd-ver upd-ver--old">v{current}</span>
                      <span className="upd-arrow">→</span>
                    </>
                  )}
                  <span className="upd-ver upd-ver--new">v{version || '—'}</span>
                </>
              )}
            </p>
          </div>
          <button
            className="upd-close"
            onClick={onDismiss}
            title={t('clip.close')}
            aria-label={t('clip.close')}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="upd-body">
          {status === 'available' && (
            <section className="upd-notes">
              <div className="upd-notes-head">
                <span className="upd-notes-title">{t('update.whatsNew')}</span>
                <span className="upd-notes-badge">v{version}</span>
              </div>
              <div className="upd-notes-scroll">
                {body.length ? (
                  body
                ) : (
                  <p className="upd-p upd-p--empty">{t('update.noNotes')}</p>
                )}
              </div>
            </section>
          )}

          {busy && (
            <div className="upd-progress">
              <div className="upd-progress-track">
                <div
                  className="upd-progress-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="upd-progress-meta">
                <span>{t('update.downloading')}</span>
                <span className="upd-progress-pct">{pct}%</span>
              </div>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="upd-done">
              <span className="upd-done-icon">
                <svg viewBox="0 0 20 20" width="16" height="16">
                  <path
                    d="M4.5 10.5l3.6 3.6 7.4-7.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="upd-done-text">
                {t('update.downloadedDesc', { version })}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="upd-error">
              <p className="upd-error-text">
                {errorText || t('update.errorDesc')}
              </p>
            </div>
          )}
        </div>

        <footer className="upd-foot">
          {status === 'available' && (
            <>
              <button className="upd-btn upd-btn--ghost" onClick={onDismiss}>
                {t('update.later')}
              </button>
              <button className="upd-btn upd-btn--primary" onClick={onDownload}>
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path
                    d="M8 2.5v7m0 0L5 6.6M8 9.5l3-2.9M3 12.5h10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t('update.downloadInstall')}
              </button>
            </>
          )}
          {busy && (
            <button
              className="upd-btn upd-btn--ghost"
              onClick={onDismiss}
              style={{ flex: 1 }}
            >
              {t('update.background')}
            </button>
          )}
          {status === 'downloaded' && (
            <>
              <button className="upd-btn upd-btn--ghost" onClick={onDismiss}>
                {t('update.nextTime')}
              </button>
              <button className="upd-btn upd-btn--primary" onClick={onInstall}>
                {t('update.restartInstall')}
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <button className="upd-btn upd-btn--ghost" onClick={onDismiss}>
                {t('update.ok')}
              </button>
              <button className="upd-btn upd-btn--primary" onClick={onRetry}>
                {t('update.retry')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
