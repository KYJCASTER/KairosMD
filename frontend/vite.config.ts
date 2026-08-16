import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 把重型可选依赖拆成独立 chunk，按需加载
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('katex')) return 'katex'
            if (id.includes('shiki') || id.includes('@shikijs') || id.includes('@vscode')) return 'shiki'
          }
        },
      },
    },
  },
})
