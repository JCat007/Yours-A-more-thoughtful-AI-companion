import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
  server: {
    port: 5173,
    host: true, // 监听所有网卡，避免 localhost 拒绝连接
    // 移除 COEP/COOP，否则可能导致空白页（Vite 预构建资源被拦截）
    // 如需 @xenova/transformers 的 SharedArrayBuffer，可加回并配置 hmr.headers
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
