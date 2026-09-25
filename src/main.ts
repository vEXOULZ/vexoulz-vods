import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import './styles.css'

import { createVods } from '@vexoulz/vods-core/vue'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

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
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
})

createApp(App).use(router).use(createVods(vodsConfig)).mount('#app')
