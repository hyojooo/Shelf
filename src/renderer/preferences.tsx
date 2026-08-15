import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from './store/useStore';
import { getClip } from './clip-api';
import type { ClipApi } from '../preload/index';
import { IPC, type Settings as SettingsType } from '../shared/types';
import { SettingsForm } from './components/Settings';
import { I18nProvider, useT } from './i18n';
import './styles/global.css';

declare global {
  interface Window {
    clip?: ClipApi;
  }
}

const clip = window.clip!;

const PreferencesApp = () => {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const updateInfo = useStore((s) => s.updateInfo);
  const updateStatus = useStore((s) => s.updateStatus);
  const setUpdate = useStore((s) => s.setUpdate);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const t = useT();

  useEffect(() => {
    void clip.getSettings().then(setSettings);
    const off = clip.on(IPC.SETTINGS_UPDATED, (s: SettingsType) =>
      setSettings(s),
    );
    return () => off();
  }, [setSettings]);

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
    const off = clip.on(IPC.SHORTCUT_ERROR, (acc: string) => {
      window.alert(t('alert.shortcutError', { acc }));
    });
    return () => off();
  }, []);

  useEffect(() => {
    const off = clip.on(
      IPC.UPDATE_STATE,
      (st: {
        status: string;
        version?: string;
        notes?: string;
        message?: string;
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
        else if (st.status === 'error')
          setUpdate({ version: '', notes: st.message ?? '' }, 'error');
        else if (st.status === 'progress')
          setUpdate(
            useStore.getState().updateInfo ?? { version: '', notes: '' },
            'progress',
          );
      },
    );
    return () => off();
  }, [setUpdate]);

  useEffect(() => {
    if (updateStatus === 'not-available' && !updateDismissed) {
      const id = window.setTimeout(() => setUpdateDismissed(true), 2500);
      return () => window.clearTimeout(id);
    }
  }, [updateStatus, updateDismissed]);

  return (
    <div className="pref-root">
      <SettingsForm
        onClose={() => window.close()}
        title={t('settings.preferencesTitle')}
      />

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
          }}
          onClick={() => setUpdateDismissed(true)}
        >
          ✅ {t('update.upToDate')}
        </div>
      )}
    </div>
  );
};

const el = document.getElementById('root');
if (el)
  createRoot(el).render(
    <I18nProvider>
      <PreferencesApp />
    </I18nProvider>,
  );
