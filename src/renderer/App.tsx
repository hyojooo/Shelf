import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import { filterClips } from '../shared/search';
import { IPC, type Clip, type Settings as SettingsType } from '../shared/types';
import type { ClipApi } from '../preload/index';
import Tabs from './components/Tabs';
import SearchBar from './components/SearchBar';
import ClipList from './components/ClipList';
import Preview from './components/Preview';
import Settings from './components/Settings';
import { useT } from './i18n';

declare global {
  interface Window {
    clip?: ClipApi;
  }
}

const clip: ClipApi =
  typeof window !== 'undefined' && window.clip
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
        on: () => () => {},
      };

export default function App() {
  const clips = useStore((s) => s.clips);
  const tab = useStore((s) => s.tab);
  const query = useStore((s) => s.query);
  const selectedId = useStore((s) => s.selectedId);
  const previewId = useStore((s) => s.previewId);
  const settings = useStore((s) => s.settings);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setClips = useStore((s) => s.setClips);
  const setSettings = useStore((s) => s.setSettings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const select = useStore((s) => s.select);
  const preview = useStore((s) => s.preview);
  const setUpdate = useStore((s) => s.setUpdate);
  const updateInfo = useStore((s) => s.updateInfo);
  const updateStatus = useStore((s) => s.updateStatus);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const t = useT();

  const filtered = useMemo(() => {
    const list = filterClips(clips, tab, query);
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [clips, tab, query]);

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  useEffect(() => {
    const apply = () => {
      const mode = settings?.theme ?? 'system';
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = mode === 'dark' || (mode === 'system' && sysDark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings]);

  useEffect(() => {
    select(null);
    preview(null);
  }, [tab, select, preview]);

  useEffect(() => {
    void clip.getAll().then(setClips);
    void clip.getSettings().then(setSettings);
  }, [setClips, setSettings]);

  useEffect(() => {
    const offs = [
      clip.on(IPC.UPDATED, (c: Clip[]) => setClips(c)),
      clip.on(IPC.SETTINGS_UPDATED, (s) => setSettings(s as SettingsType)),
      clip.on(IPC.OPEN_SETTINGS, () => setSettingsOpen(true)),
      clip.on(IPC.VISIBILITY, (visible: boolean) => {
        if (!visible) {
          select(null);
          preview(null);
        } else {
          const first = filteredRef.current[0];
          if (first) {
            select(first.id);
            preview(first.id);
          }
        }
      }),
      clip.on(IPC.SHORTCUT_ERROR, (acc: string) => {
        window.alert(t('alert.shortcutError', { acc }));
      }),
      clip.on(
        IPC.UPDATE_STATE,
        (st: {
          status: string;
          version?: string;
          notes?: string;
          message?: string;
          percent?: number;
        }) => {
          setUpdateDismissed(false);
          if (st.status === 'available')
            setUpdate(
              { version: st.version ?? '', notes: st.notes ?? '' },
              'available',
            );
          else if (st.status === 'not-available')
            setUpdate(null, 'not-available');
          else if (st.status === 'downloaded')
            setUpdate(useStore.getState().updateInfo, 'downloaded');
          else if (st.status === 'error') {
            setUpdate({ version: '', notes: st.message ?? '' }, 'error');
          } else if (st.status === 'progress') {
            setUpdate(
              useStore.getState().updateInfo ?? { version: '', notes: '' },
              'progress',
            );
          }
        },
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [setClips, setSettings, setSettingsOpen, select, preview, setUpdate]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        else {
          select(null);
          preview(null);
        }
        return;
      }
      if (settingsOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('clip-search')?.focus();
        return;
      }
      if (typing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === selectedId);
        const next =
          e.key === 'ArrowDown'
            ? Math.min(filtered.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        if (filtered[next]) select(filtered[next].id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedId) {
          void clip.copy(selectedId);
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          void clip.deleteClip(selectedId);
          select(null);
        }
        return;
      }
      if (e.key === 'Enter' && selectedId) {
        const hit = filtered.find((c) => c.id === selectedId);
        if (!hit) return;

        if (settings?.pasteOnDoubleClick) void clip.paste(selectedId);
        else void clip.copy(selectedId);
      }
    },
    [
      filtered,
      selectedId,
      settingsOpen,
      settings,
      select,
      preview,
      setSettingsOpen,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  useEffect(() => {
    if (updateStatus === 'not-available' && !updateDismissed) {
      const id = window.setTimeout(() => setUpdateDismissed(true), 2500);
      return () => window.clearTimeout(id);
    }
  }, [updateStatus, updateDismissed]);

  const handleDouble = useCallback(
    (id: string) => {
      if (settings?.pasteOnDoubleClick) void clip.paste(id);
      else {
        void clip.copy(id);
        preview(id);
      }
    },
    [settings, preview],
  );

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
              <div className="empty-title">{t('empty.title')}</div>
              <div className="empty-sub">{t('empty.sub')}</div>
            </div>
          ) : (
            <ClipList
              items={filtered}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              onPreview={(id) => preview(id)}
              onDouble={handleDouble}
              onDelete={(id) => {
                void clip.deleteClip(id);
                if (selectedId === id) select(null);
              }}
              onFavorite={(id, f) => void clip.favorite(id, f)}
            />
          )}
        </main>

        <div className="preview-area">
          {previewId ? (
            <Preview
              id={previewId}
              onClose={() => {
                preview(null);
                select(null);
              }}
            />
          ) : (
            <div className="preview-empty">
              <svg
                className="bear"
                width="96"
                height="96"
                viewBox="0 0 96 96"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {}
                <circle
                  cx="22"
                  cy="26"
                  r="12"
                  fill="var(--muted)"
                  opacity=".2"
                />
                <circle
                  cx="22"
                  cy="26"
                  r="7"
                  fill="var(--muted)"
                  opacity=".15"
                />
                <circle
                  cx="74"
                  cy="26"
                  r="12"
                  fill="var(--muted)"
                  opacity=".2"
                />
                <circle
                  cx="74"
                  cy="26"
                  r="7"
                  fill="var(--muted)"
                  opacity=".15"
                />
                {}
                <ellipse
                  cx="48"
                  cy="56"
                  rx="34"
                  ry="30"
                  fill="var(--muted)"
                  opacity=".1"
                />
                {}
                <ellipse
                  cx="48"
                  cy="62"
                  rx="16"
                  ry="12"
                  fill="var(--muted)"
                  opacity=".12"
                />
                {}
                <ellipse
                  cx="48"
                  cy="58"
                  rx="5"
                  ry="3.5"
                  fill="var(--muted)"
                  opacity=".25"
                />
                {}
                <circle
                  cx="36"
                  cy="50"
                  r="4"
                  fill="var(--muted)"
                  opacity=".35"
                />
                <circle
                  cx="60"
                  cy="50"
                  r="4"
                  fill="var(--muted)"
                  opacity=".35"
                />
                {}
                <circle cx="37.5" cy="48.5" r="1.3" fill="#fff" opacity=".6" />
                <circle cx="61.5" cy="48.5" r="1.3" fill="#fff" opacity=".6" />
                {}
                <path
                  d="M42 66 Q48 72 54 66"
                  stroke="var(--muted)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                  opacity=".3"
                />
                {}
                <ellipse
                  cx="28"
                  cy="58"
                  rx="6"
                  ry="4"
                  fill="var(--accent)"
                  opacity=".12"
                />
                <ellipse
                  cx="68"
                  cy="58"
                  rx="6"
                  ry="4"
                  fill="var(--accent)"
                  opacity=".12"
                />
              </svg>
              <p className="preview-empty__text">{t('preview.empty')}</p>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}

      {}
      {!updateDismissed &&
        (updateStatus === 'available' ||
          updateStatus === 'downloaded' ||
          updateStatus === 'error') && (
          <div
            className="modal-mask"
            onClick={() => updateStatus === 'error' && setUpdateDismissed(true)}
          >
            <div
              className="modal update-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 380 }}
            >
              <div className="modal-head">
                <h2>
                  {updateStatus === 'downloaded'
                    ? t('update.downloaded')
                    : updateStatus === 'error'
                      ? t('update.errorTitle')
                      : t('update.found')}
                </h2>
                <button
                  className="icon-btn"
                  onClick={() => setUpdateDismissed(true)}
                  title={t('clip.close')}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ padding: '16px 20px' }}>
                {updateStatus === 'available' && updateInfo && (
                  <>
                    <p
                      style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                    >
                      Shelf{' '}
                      <span style={{ color: 'var(--accent)' }}>
                        v{updateInfo.version}
                      </span>
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
                          scrollbarWidth: 'thin',
                        }}
                        dangerouslySetInnerHTML={{ __html: updateInfo.notes }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="s-btn"
                        style={{
                          flex: 1,
                          padding: '9px 0',
                          textAlign: 'center',
                        }}
                        onClick={() => setUpdateDismissed(true)}
                      >
                        {t('update.later')}
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
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          void clip.checkUpdate();
                        }}
                      >
                        {t('update.downloadInstall')}
                      </button>
                    </div>
                  </>
                )}
                {updateStatus === 'downloaded' && updateInfo && (
                  <>
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        marginBottom: 12,
                      }}
                    >
                      {t('update.downloadedDesc', {
                        version: updateInfo.version,
                      })}
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="s-btn"
                        style={{
                          flex: 1,
                          padding: '9px 0',
                          textAlign: 'center',
                        }}
                        onClick={() => setUpdateDismissed(true)}
                      >
                        {t('update.nextTime')}
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
                          fontWeight: 600,
                        }}
                        onClick={() => clip.installUpdate()}
                      >
                        {t('update.restartInstall')}
                      </button>
                    </div>
                  </>
                )}
                {updateStatus === 'error' && (
                  <>
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--danger)',
                        marginBottom: 12,
                      }}
                    >
                      {updateInfo?.notes || t('update.errorDesc')}
                    </p>
                    <button
                      className="s-btn"
                      style={{
                        width: '100%',
                        padding: '9px 0',
                        textAlign: 'center',
                      }}
                      onClick={() => setUpdateDismissed(true)}
                    >
                      {t('update.ok')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {}
      {!updateDismissed && updateStatus === 'not-available' && (
        <div
          style={{
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
            pointerEvents: 'auto',
          }}
          onClick={() => setUpdateDismissed(true)}
        >
          ✅ {t('update.upToDate')}
        </div>
      )}
    </div>
  );
}
