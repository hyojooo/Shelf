import { useEffect, useState } from 'react';
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
  const updateInfo = useStore((s) => s.updateInfo);
  const updateStatus = useStore((s) => s.updateStatus);
  const setUpdate = useStore((s) => s.setUpdate);
  const [updateDismissed, setUpdateDismissed] = useState(false);

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

  // 订阅更新状态（与面板 App.tsx 保持一致）
  useEffect(() => {
    const off = clip.on(IPC.UPDATE_STATE, (st: { status: string; version?: string; notes?: string; message?: string }) => {
      setUpdateDismissed(false);
      if (st.status === 'available') setUpdate({ version: st.version ?? '', notes: st.notes ?? '' }, 'available');
      else if (st.status === 'not-available') setUpdate(null, 'not-available');
      else if (st.status === 'downloaded') setUpdate(useStore.getState().updateInfo, 'downloaded');
      else if (st.status === 'error') setUpdate({ version: '', notes: st.message ?? '检查更新失败' }, 'error');
      else if (st.status === 'progress') setUpdate(useStore.getState().updateInfo ?? { version: '', notes: '' }, 'progress');
    });
    return () => off();
  }, [setUpdate]);

  return (
    <div className="pref-root">
      <SettingsForm onClose={() => window.close()} title="偏好设置" />

      {/* 更新提示弹窗（与面板同步） */}
      {!updateDismissed && (updateStatus === 'available' || updateStatus === 'downloaded' || updateStatus === 'error') && (
        <div className="modal-mask" onClick={() => updateStatus === 'error' && setUpdateDismissed(true)}>
          <div className="modal update-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <h2>{updateStatus === 'downloaded' ? '更新已下载' : updateStatus === 'error' ? '更新检查失败' : '发现新版本'}</h2>
              <button className="icon-btn" onClick={() => setUpdateDismissed(true)} title="关闭">✕</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              {updateStatus === 'available' && updateInfo && (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Shelf <span style={{ color: 'var(--accent)' }}>v{updateInfo.version}</span>
                  </p>
                  {updateInfo.notes && (
                    <div
                      style={{
                        fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16,
                        background: 'var(--panel)', padding: 12, borderRadius: 8,
                        border: '1px solid var(--border)', maxHeight: 180, overflowY: 'auto', scrollbarWidth: 'thin'
                      }}
                      dangerouslySetInnerHTML={{ __html: updateInfo.notes }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="s-btn" style={{ flex: 1, padding: '9px 0', textAlign: 'center' }} onClick={() => setUpdateDismissed(true)}>稍后再说</button>
                    <button style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={() => { void clip.checkUpdate() }}>下载并安装</button>
                  </div>
                </>
              )}
              {updateStatus === 'downloaded' && updateInfo && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>Shelf <strong>v{updateInfo.version}</strong> 已下载完成，重启应用即可安装。</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="s-btn" style={{ flex: 1, padding: '9px 0', textAlign: 'center' }} onClick={() => setUpdateDismissed(true)}>下次再说</button>
                    <button style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={() => clip.installUpdate()}>重启并安装</button>
                  </div>
                </>
              )}
              {updateStatus === 'error' && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{updateInfo?.notes || '无法连接到更新服务器，请稍后重试。'}</p>
                  <button className="s-btn" style={{ width: '100%', padding: '9px 0', textAlign: 'center' }} onClick={() => setUpdateDismissed(true)}>知道了</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "已是最新版本" 轻提示 */}
      {!updateDismissed && updateStatus === 'not-available' && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 18px', fontSize: 12, color: 'var(--muted)',
          boxShadow: 'var(--shadow)', zIndex: 20, animation: 'fade-in 0.2s ease-out'
        }} onClick={() => setUpdateDismissed(true)}>
          ✅ 已是最新版本
        </div>
      )}
    </div>
  );
};

const el = document.getElementById('root');
if (el) createRoot(el).render(<PreferencesApp />);
