<script setup lang="ts">
import { VxButton, VxCallout, VxField, VxInput, VxSiteShell } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '@/admin/api'
import { ensure, login, session } from '@/admin/session'

const route = useRoute()
const router = useRouter()
const password = ref('')
const field = ref<{ focus: () => void } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

const next = computed(() => {
  const n = route.query.next
  // Only paths inside the admin area: never an absolute URL from the query.
  return typeof n === 'string' && n.startsWith('/admin') && !n.startsWith('//') ? n : '/admin'
})

onMounted(async () => {
  document.title = 'Admin · vods.vexoulz.net'
  await ensure()
  if (session.authenticated) router.replace(next.value)
  else field.value?.focus()
})

async function submit() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await login(password.value)
    password.value = ''
    router.replace(next.value)
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 401) error.value = 'Wrong password.'
    else if (e instanceof AdminApiError && e.status === 429)
      error.value = `Too many attempts. Try again in ${e.retryAfter ? `${Math.ceil(e.retryAfter / 60)} min` : 'a few minutes'}.`
    else if (e instanceof AdminApiError && e.status === 404) error.value = 'Password login is turned off on the archive.'
    else error.value = `Couldn't reach the archive admin API${e instanceof Error ? ` (${e.message})` : ''}.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VxSiteShell site="vods" sky="dim">
    <form class="login vx-panel" @submit.prevent="submit">
      <div class="vx-eyebrow">vods.vexoulz.net</div>
      <h1 class="vx-display">Admin</h1>
      <VxCallout v-if="session.notice && !error" tone="warn">{{ session.notice }}</VxCallout>
      <VxCallout v-if="session.checked && !session.passwordLogin" tone="warn" title="Password login is off">
        The archive has no admin password configured.
      </VxCallout>
      <VxField label="Password" :error="error ?? undefined">
        <template #default="{ id }">
          <VxInput :id="id" v-model="password" type="password" :invalid="!!error" ref="field" />
        </template>
      </VxField>
      <VxButton type="submit" variant="primary" :loading="busy" :disabled="!password">Log in</VxButton>
    </form>
  </VxSiteShell>
</template>

<style scoped>
.login { display: flex; flex-direction: column; gap: 14px; width: min(360px, 100%); margin: 8vh auto 0; padding: 24px; box-sizing: border-box; }
.login h1 { font-size: 28px; margin: 0 0 4px; }
.login :deep(input) { width: 100%; }
</style>
