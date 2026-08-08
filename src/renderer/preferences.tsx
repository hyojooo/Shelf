import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from './store/useStore';
import { getClip } from './clip-api';
import type { ClipApi } from '../preload/index';
import { IPC, type Settings as SettingsType } from '../shared/types';
import { SettingsForm } from './components/Settings';
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

  // 初始化设置 + 订阅设置更新
  useEffect(() => {
    void clip.getSettings().then(setSettings);
    const off = clip.on(IPC.SETTINGS_UPDATED, (s: SettingsType) =>
      setSettings(s),
    );
    return () => off();
  }, [setSettings]);

  // 主题：跟随系统 / 浅色 / 深色
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

  // 快捷键冲突提示
  useEffect(() => {
    const off = clip.on(IPC.SHORTCUT_ERROR, (acc: string) => {
      window.alert(
        `快捷键 "${acc}" 注册失败，可能已被系统或其它程序占用，请在偏好设置中更换。`,
      );
    });
    return () => off();
  }, []);

  return (
    <div className="pref-root">
      <SettingsForm onClose={() => window.close()} />
    </div>
  );
};

const el = document.getElementById('root');
if (el) createRoot(el).render(<PreferencesApp />);
