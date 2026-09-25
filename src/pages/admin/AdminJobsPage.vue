<script setup lang="ts">
// /admin/jobs?state=&kind=&vodId=: the job queue, refreshed every few seconds. Filters live in the URL.
import { VxButton, VxCallout, VxInput, VxSelect, VxSkeleton, VxTabs, type Option } from '@vexoulz/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Job, JobKind } from '@/admin/api'
import AdminShell from '@/admin/AdminShell.vue'
import JobsTable from '@/admin/JobsTable.vue'
import StartJobDialog from '@/admin/StartJobDialog.vue'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'

const PAGE = 50
const route = useRoute()
const router = useRouter()

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const state = computed(() => q('state') || 'all')
const kind = computed(() => q('kind'))
const vodId = computed(() => q('vodId'))

function setQuery(patch: Record<string, string>) {
  const next: Record<string, string> = { ...(route.query as Record<string, string>), ...patch }
  for (const k of Object.keys(next)) if (!next[k] || (k === 'state' && next[k] === 'all')) delete next[k]
  router.replace({ query: next })
}

const tabs: Option<string>[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', sub: 'queued, running, paused' },
  { value: 'stopped', label: 'Needs attention', sub: 'paused, failed, cancelled' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
  { value: 'done', label: 'Done' },
]
const tab = computed({ get: () => state.value, set: (v: string) => setQuery({ state: v }) })

const kinds = ref<Record<string, JobKind>>({})
const kindOptions = computed<Option<string>[]>(() => [
  { value: '', label: 'All kinds' },
  ...Object.keys(kinds.value).map((k) => ({ value: k, label: k })),
])
const kindModel = computed({ get: () => kind.value, set: (v: string) => setQuery({ kind: v }) })

const vodDraft = ref(vodId.value)
let vodTimer: ReturnType<typeof setTimeout> | undefined
watch(vodDraft, (v) => {
  clearTimeout(vodTimer)
  vodTimer = setTimeout(() => setQuery({ vodId: v.trim() }), 300)
})

// Older pages, fetched on demand with the `before` cursor. The polled first page stays live on top.
const older = ref<Job[]>([])
const olderDone = ref(false)
const loadingOlder = ref(false)
const filters = () => ({ state: state.value === 'all' ? undefined : state.value, kind: kind.value, vodId: vodId.value })

const { data, error, loading, refresh } = usePoll((signal) => admin.jobs({ ...filters(), limit: PAGE }, signal), 5_000)
watch([state, kind, vodId], () => {
  older.value = []
  olderDone.value = false
  refresh()
})

const jobs = computed(() => {
  const first = data.value?.data ?? []
  const seen = new Set(first.map((j) => j.id))
  return [...first, ...older.value.filter((j) => !seen.has(j.id))]
})
const hasMore = computed(() => !olderDone.value && (data.value?.data.length ?? 0) >= PAGE)

async function loadOlder() {
  const last = jobs.value[jobs.value.length - 1]
  if (!last) return
  loadingOlder.value = true
  try {
    const page = await admin.jobs({ ...filters(), limit: PAGE, before: last.id })
    older.value = [...older.value, ...page.data]
    if (page.data.length < PAGE) olderDone.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingOlder.value = false
  }
}

const starting = computed({
  get: () => route.query.new === '1',
  set: (v: boolean) => setQuery({ new: v ? '1' : '' }),
})
function started(id: number) {
  starting.value = false
  router.push(`/admin/jobs/${id}`)
}

onMounted(async () => {
  document.title = 'Jobs · Admin · vods.vexoulz.net'
  try {
    kinds.value = await admin.kinds()
  } catch {
    // the kind filter just stays empty; the table shows the error from its own request
  }
})
</script>

<template>
  <AdminShell title="Jobs">
    <template #actions>
      <VxButton size="sm" :loading="loading" @click="refresh">Refresh</VxButton>
      <VxButton size="sm" variant="primary" @click="starting = true">Start a job</VxButton>
    </template>

    <div class="filters">
      <VxTabs v-model="tab" :options="tabs" label="Job state" class="tabs" />
      <div class="row">
        <VxSelect v-model="kindModel" :options="kindOptions" placeholder="All kinds" size="sm" width="160px" />
        <VxInput v-model="vodDraft" class="vod" placeholder="VOD id" mono clearable />
      </div>
    </div>

    <VxCallout v-if="error" tone="error" title="Couldn't load the jobs">
      {{ error }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>

    <div v-if="!data && !error" aria-busy="true" class="sk">
      <VxSkeleton v-for="i in 6" :key="i" h="36px" />
    </div>
    <template v-else-if="data">
      <JobsTable :jobs="jobs" empty="No jobs match these filters." />
      <div class="more">
        <VxButton v-if="hasMore" :loading="loadingOlder" @click="loadOlder">Older jobs</VxButton>
        <span class="vx-muted vx-mono small">{{ jobs.length }} shown · refreshes every 5 s</span>
      </div>
    </template>

    <StartJobDialog v-model:open="starting" :kinds="kinds" :vod-id="vodId" @started="started" />
  </AdminShell>
</template>

<style scoped>
.filters { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.tabs { max-width: 100%; overflow-x: auto; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.vod { flex: 0 1 200px; }
.vod :deep(input) { width: 100%; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 16px; }
.small { font-size: 11px; }
</style>
