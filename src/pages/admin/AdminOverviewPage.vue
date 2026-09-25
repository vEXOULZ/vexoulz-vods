<script setup lang="ts">
import { VxButton, VxCallout, VxChip, VxSkeleton, VxStatusDot, useToast } from '@vexoulz/ui'
import { computed, onMounted } from 'vue'
import { JOB_STATES } from '@/admin/api'
import AdminShell from '@/admin/AdminShell.vue'
import JobsTable from '@/admin/JobsTable.vue'
import { ago, STATE_TONE } from '@/admin/format'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'

const { data: health, error, loading, refresh } = usePoll((signal) => admin.health(signal), 15_000)
const toast = useToast()

onMounted(() => (document.title = 'Overview · Admin · vods.vexoulz.net'))

type Dot = 'live' | 'ok' | 'warn' | 'off'
const tiles = computed(() => {
  const h = health.value
  if (!h) return []
  const yt = h.youtube
  return [
    {
      name: 'Worker',
      status: (h.worker.ok ? 'ok' : 'warn') as Dot,
      text: h.worker.ok ? `${h.worker.runningJobs} running` : 'Not healthy',
      sub: h.worker.startedAt ? `up since ${ago(h.worker.startedAt)}` : '',
    },
    { name: 'Archive API', status: (h.api?.ok ? 'ok' : 'warn') as Dot, text: h.api?.ok ? 'Reachable' : 'Unreachable', sub: '' },
    {
      name: 'YouTube',
      status: (!yt ? 'off' : yt.authorized && yt.valid ? 'ok' : 'warn') as Dot,
      text: !yt ? 'Unknown' : !yt.authorized ? 'Not connected' : yt.valid ? 'Connected' : 'Token invalid',
      sub: yt?.error ?? (yt?.checkedAt ? `checked ${ago(yt.checkedAt)}` : ''),
      action: yt && !(yt.authorized && yt.valid) ? 'connect' : undefined,
    },
    {
      name: 'Stream',
      status: (h.live?.live ? 'live' : 'off') as Dot,
      text: h.live?.live ? 'Live' : 'Offline',
      sub: h.live?.live && h.live.startedAt ? `started ${ago(h.live.startedAt)}` : '',
    },
  ]
})

async function connectYoutube() {
  try {
    const { url } = await admin.youtubeAuthUrl()
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.show(`Couldn't start the YouTube connection: ${e instanceof Error ? e.message : e}`, { kind: 'error', duration: 5000 })
  }
}
</script>

<template>
  <AdminShell title="Overview">
    <template #actions>
      <VxButton size="sm" :loading="loading" @click="refresh">Refresh</VxButton>
      <VxButton size="sm" variant="primary" to="/admin/jobs?new=1">Start a job</VxButton>
    </template>

    <VxCallout v-if="error" tone="error" title="Couldn't load the archive's status">
      {{ error }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>

    <div v-if="!health && !error" class="tiles" aria-busy="true">
      <VxSkeleton v-for="i in 4" :key="i" h="84px" />
    </div>

    <template v-if="health">
      <div class="tiles">
        <div v-for="t in tiles" :key="t.name" class="tile vx-panel">
          <div class="vx-eyebrow">{{ t.name }}</div>
          <div class="tile-main"><VxStatusDot :status="t.status" />{{ t.text }}</div>
          <div v-if="t.sub" class="vx-muted small">{{ t.sub }}</div>
          <VxButton v-if="t.action === 'connect'" size="sm" @click="connectYoutube">Connect YouTube</VxButton>
        </div>
      </div>

      <section>
        <h2 class="vx-eyebrow">Jobs</h2>
        <div class="counts">
          <RouterLink v-for="s in JOB_STATES" :key="s" :to="`/admin/jobs?state=${s}`" class="count">
            <VxChip :tone="health.jobs.counts[s] ? STATE_TONE[s] : 'default'" :k="s">{{ health.jobs.counts[s] ?? 0 }}</VxChip>
          </RouterLink>
        </div>
      </section>

      <section>
        <h2 class="vx-eyebrow">Recent failures</h2>
        <JobsTable :jobs="health.jobs.recentFailures" empty="No failed jobs. 🎉" />
      </section>
    </template>
  </AdminShell>
</template>

<style scoped>
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 28px; }
.tile { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; align-items: flex-start; }
.tile-main { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.small { font-size: 12px; }
section { margin-bottom: 28px; }
h2 { margin: 0 0 10px; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; }
.count { text-decoration: none; }
</style>
