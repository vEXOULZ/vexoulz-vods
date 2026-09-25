import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import './styles.css'

import { createVods } from '@vexoulz/vods-core/vue'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import { ensure, session, setExpiredHandler } from './admin/session'
import App from './App.vue'
import { vodsConfig } from './vods.config'

const WatchPage = () => import('./pages/WatchPage.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/VodsPage.vue') },
    { path: '/vods', component: () => import('./pages/VodsPage.vue') },
    // Same URLs as the old site: /vods/:id plays the VOD uploads, /live/:id the live-recorded ones,
    // /youtube/:id whichever set exists (live first).
    { path: '/vods/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: 'vod' }) },
    { path: '/live/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: 'live' }) },
    { path: '/youtube/:id', component: WatchPage, props: (r) => ({ id: r.params.id, type: null }) },
    { path: '/games/:id', component: () => import('./pages/GamesPage.vue'), props: true },
    // Admin (not in the public nav). Every page but the login needs a session; see src/admin/session.ts.
    { path: '/admin/login', component: () => import('./pages/admin/AdminLoginPage.vue'), meta: { public: true } },
    { path: '/admin', component: () => import('./pages/admin/AdminOverviewPage.vue') },
    { path: '/admin/jobs', component: () => import('./pages/admin/AdminJobsPage.vue') },
    { path: '/admin/jobs/:id(\\d+)', component: () => import('./pages/admin/AdminJobPage.vue'), props: true },
    { path: '/admin/vods', component: () => import('./pages/admin/AdminVodsPage.vue') },
    { path: '/admin/vods/:id', component: () => import('./pages/admin/AdminVodPage.vue'), props: true },
    { path: '/admin/audit', component: () => import('./pages/admin/AdminAuditPage.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
})

router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin') || to.meta.public) return true
  await ensure()
  return session.authenticated || { path: '/admin/login', query: { next: to.fullPath } }
})
setExpiredHandler(() => {
  const here = router.currentRoute.value
  if (here.path.startsWith('/admin') && !here.meta.public) router.push({ path: '/admin/login', query: { next: here.fullPath } })
})

createApp(App).use(router).use(createVods(vodsConfig)).mount('#app')
