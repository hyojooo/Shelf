import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type Clip, type Settings } from '../shared/types';

const api = {
  getAll: (): Promise<Clip[]> => ipcRenderer.invoke(IPC.GET_ALL),
  favorite: (id: string, favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.FAVORITE, { id, favorite }),
  deleteClip: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.DELETE, { id }),
  clearAll: (): Promise<boolean> => ipcRenderer.invoke(IPC.CLEAR),
  copy: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.COPY, { id }),
  paste: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PASTE, { id }),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  updateSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.UPDATE_SETTINGS, partial),
  checkUpdate: (): Promise<unknown> => ipcRenderer.invoke(IPC.CHECK_UPDATE),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.GET_VERSION),
  installUpdate: (): void => ipcRenderer.send(IPC.INSTALL_UPDATE),
  quit: (): Promise<boolean> => ipcRenderer.invoke(IPC.QUIT),

  on: (channel: string, cb: (...args: any[]) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('clip', api);

export type ClipApi = typeof api;
