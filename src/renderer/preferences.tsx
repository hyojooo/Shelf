import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from './store/useStore';
import { getClip } from './clip-api';
import type { ClipApi } from '../preload/index';
import { IPC, type Settings as SettingsType } from '../shared/types';
import { SettingsForm } from './components/Settings';
import UpdateDialog from './components/UpdateDialog';
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
  const updatePercent = useStore((s) => s.updatePercent);
  const setUpdatePercent = useStore((s) => s.setUpdatePercent);
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
        else if (st.status === 'error')
          setUpdate({ version: '', notes: st.message ?? '' }, 'error');
        else if (st.status === 'progress') {
          setUpdatePercent(st.percent ?? 0);
          setUpdate(
            useStore.getState().updateInfo ?? { version: '', notes: '' },
            'progress',
          );
        }
      },
    );
    return () => off();
  }, [setUpdate, setUpdatePercent]);

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
          updateStatus === 'progress' ||
          updateStatus === 'error') && (
          <UpdateDialog
            status={
              updateStatus as 'available' | 'progress' | 'downloaded' | 'error'
            }
            version={updateInfo?.version ?? ''}
            notes={updateInfo?.notes ?? ''}
            percent={updatePercent}
            errorText={updateInfo?.notes ?? ''}
            onDismiss={() => setUpdateDismissed(true)}
            onDownload={() => {
              setUpdate(updateInfo, 'progress');
              void clip.downloadUpdate();
            }}
            onRetry={() => void clip.checkUpdate()}
            onInstall={() => clip.installUpdate()}
          />
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
