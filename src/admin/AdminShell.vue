<script setup lang="ts">
// Frame for every signed-in admin page: the site shell with the admin nav, and a log-out button.
import { VxButton, VxSiteShell, type NavItem } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout } from './session'

defineProps<{ title: string }>()
const route = useRoute()
const router = useRouter()

const nav = computed<NavItem[]>(() => [
  { label: 'Overview', to: '/admin', current: route.path === '/admin' },
  { label: 'Jobs', to: '/admin/jobs', current: route.path.startsWith('/admin/jobs') },
  { label: 'Site', to: '/vods' },
])

const leaving = ref(false)
async function signOut() {
  leaving.value = true
  try {
    await logout()
  } catch {
    // the session is dropped locally either way
  } finally {
    leaving.value = false
    router.push('/admin/login')
  }
}
</script>

<template>
  <VxSiteShell site="vods" :nav="nav" sky="dim">
    <template #account>
      <VxButton size="sm" variant="ghost" :loading="leaving" @click="signOut">Log out</VxButton>
    </template>
    <div class="head">
      <div class="vx-eyebrow">Admin</div>
      <h1 class="vx-display">{{ title }}</h1>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </div>
    <slot />
  </VxSiteShell>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 16px; margin-bottom: 20px; }
.head .vx-eyebrow { flex-basis: 100%; }
.head h1 { font-size: 28px; margin: 0; flex: 1 1 auto; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
