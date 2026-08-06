import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // 主进程只打包业务代码，Node 内置模块与 Electron 相关模块保持外部化
        external: ['electron', 'electron-updater', 'original-fs', 'fs', 'path', 'crypto', 'os', 'child_process']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {}
    },
    plugins: [react()]
  }
})
