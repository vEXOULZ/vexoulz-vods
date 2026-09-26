import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { adminMock } from './dev/adminMock'

/** The commit this build comes from, shown in the footer (empty outside a git checkout). */
function commit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_SHA ?? ''
  }
}

export default defineConfig(({ mode }) => {
  // Env files next to this config, not in process.cwd(): `vite <dir>` can be started from another folder.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  // /backend-admin (the admin pages' API): a real worker when VITE_DEV_ADMIN_TARGET is set (put it in .env.local,
  // which git ignores), otherwise the in-memory mock in dev/adminMock.ts.
  const adminTarget = env.VITE_DEV_ADMIN_TARGET
  return {
    define: { __COMMIT__: JSON.stringify(commit()) },
    plugins: [vue(), ...(adminTarget ? [] : [adminMock('/backend-admin', `${env.VITE_DEV_API_TARGET || 'https://vods.vexoulz.net'}/backend`)])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5175,
      // In production the site and the archive API share an origin (`/backend`). In dev, forward /backend to the
      // public API so the same relative URL works. Override with VITE_DEV_API_TARGET.
      // Vite matches these by prefix in order, so /backend-admin has to come before /backend.
      proxy: {
        ...(adminTarget ? { '/backend-admin': { target: adminTarget, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/backend-admin/, '') } } : {}),
        '/backend': { target: env.VITE_DEV_API_TARGET || 'https://vods.vexoulz.net', changeOrigin: true },
      },
    },
    test: { include: ['tests/**/*.test.ts'] },
  }
})
