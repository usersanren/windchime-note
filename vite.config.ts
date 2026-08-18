import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 需要固定端口；dev server 启动失败时不要静默回退
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'chrome105',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // 本机 genie-safe-delete shim 拦截 fs 删除 → trash 失败导致 vite 清空 dist 报错。
    // 改为构建前手动删 dist（tauri build 前 remove），这里不自动清空。
    emptyOutDir: false,
  },
});
