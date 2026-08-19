import { create } from 'zustand'
import type { Clip, ClipTab, Settings } from '../../shared/types'

export interface UpdateInfo {
  version: string
  notes: string
}

interface UIState {
  clips: Clip[]
  tab: ClipTab
  query: string
  selectedId: string | null
  previewId: string | null
  settings: Settings | null
  settingsOpen: boolean
  updateInfo: UpdateInfo | null
  updateStatus: string
  toast: string | null
  setClips: (c: Clip[]) => void
  setTab: (t: ClipTab) => void
  setQuery: (q: string) => void
  select: (id: string | null) => void
  preview: (id: string | null) => void
  setSettings: (s: Settings) => void
  setSettingsOpen: (b: boolean) => void
  setUpdate: (info: UpdateInfo | null, status: string) => void
  showToast: (msg: string) => void
  hideToast: () => void
}

export const useStore = create<UIState>((set) => ({
  clips: [],
  tab: 'all',
  query: '',
  selectedId: null,
  previewId: null,
  settings: null,
  settingsOpen: false,
  updateInfo: null,
  updateStatus: 'idle',
  toast: null,
  setClips: (clips) => set({ clips }),
  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
  select: (selectedId) => set({ selectedId }),
  preview: (previewId) => set({ previewId }),
  setSettings: (settings) => set({ settings }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setUpdate: (updateInfo, updateStatus) => set({ updateInfo, updateStatus }),
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: null }),
}))
