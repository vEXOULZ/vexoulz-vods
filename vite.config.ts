import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5175,
      // In production the site and the archive API share an origin (`/backend`). In dev, forward /backend to the
      // public API so the same relative URL works. Override with VITE_DEV_API_TARGET.
      proxy: {
        '/backend': { target: env.VITE_DEV_API_TARGET || 'https://vods.vexoulz.net', changeOrigin: true },
      },
    },
    test: { include: ['tests/**/*.test.ts'] },
  }
})
