<script setup lang="ts">
// /admin/audit: every change made through the admin API (dashboard or API key), newest first.
import { VxButton, VxCallout, VxChip, VxSkeleton, VxTable, type TableColumn } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import type { AuditEntry } from '@/admin/api'
import AdminShell from '@/admin/AdminShell.vue'
import { ago, stamp } from '@/admin/format'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'

const PAGE = 50
const { data, error, loading, refresh } = usePoll((signal) => admin.audit({ limit: PAGE }, signal), 30_000)
const older = ref<AuditEntry[]>([])
const olderDone = ref(false)
const loadingOlder = ref(false)

const entries = computed(() => {
  const first = data.value?.data ?? []
  const seen = new Set(first.map((e) => e.id))
  return [...first, ...older.value.filter((e) => !seen.has(e.id))]
})

async function loadOlder() {
  const last = entries.value[entries.value.length - 1]
  if (!last) return
  loadingOlder.value = true
  try {
    const page = await admin.audit({ before: last.id, limit: PAGE })
    older.value = [...older.value, ...page.data]
    if (page.data.length < PAGE) olderDone.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingOlder.value = false
  }
}

const columns: TableColumn[] = [
  { key: 'at', label: 'When', muted: true },
  { key: 'actor', label: 'By' },
  { key: 'action', label: 'Action', mono: true },
  { key: 'target', label: 'Target', mono: true },
  { key: 'detail', label: 'Details', mono: true },
]
// Logins have their password stripped, which leaves an empty object: show that as no details.
const detailText = (d: unknown) => (d == null || (typeof d === 'object' && !Object.keys(d).length) ? '' : JSON.stringify(d))
const rows = computed(() => entries.value.map((e) => ({ ...e, detailText: detailText(e.detail) })))

/** "vod:123" → the VOD's admin page, "job:5" → the job's. */
function targetLink(target: string | null): string | null {
  const m = /^(vod|job):(.+)$/.exec(target ?? '')
  if (!m) return null
  return m[1] === 'vod' ? `/admin/vods/${encodeURIComponent(m[2]!)}` : `/admin/jobs/${encodeURIComponent(m[2]!)}`
}

onMounted(() => (document.title = 'Audit log · Admin · vods.vexoulz.net'))
</script>

<template>
  <AdminShell title="Audit log">
    <template #actions>
      <VxButton :loading="loading" @click="refresh">Refresh</VxButton>
    </template>
    <VxCallout v-if="error" tone="error" title="Couldn't load the audit log">
      {{ error }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>
    <div v-if="!data && !error" class="sk" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="36px" /></div>
    <template v-else-if="data">
      <VxTable :columns="columns" :rows="rows" row-key="id" manual label="Audit log" empty="Nothing changed yet.">
        <template #cell-at="{ row }"><span class="when" :title="stamp(row.at)">{{ ago(row.at) }}</span></template>
        <template #cell-actor="{ row }"><VxChip :tone="row.actor === 'password' ? 'accent' : 'default'">{{ row.actor === 'password' ? 'dashboard' : 'API key' }}</VxChip></template>
        <template #cell-target="{ row }">
          <RouterLink v-if="targetLink(row.target)" :to="targetLink(row.target)!">{{ row.target }}</RouterLink>
          <span v-else class="vx-muted">{{ row.target ?? '—' }}</span>
        </template>
        <template #cell-detail="{ row }"><span class="detail" :title="row.detailText">{{ row.detailText || '—' }}</span></template>
      </VxTable>
      <div class="more">
        <VxButton v-if="!olderDone && entries.length >= PAGE" :loading="loadingOlder" @click="loadOlder">Older entries</VxButton>
        <span class="vx-muted vx-mono small">{{ entries.length }} shown</span>
      </div>
    </template>
  </AdminShell>
</template>

<style scoped>
a { color: inherit; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.when { white-space: nowrap; }
.detail { display: inline-block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; font-size: 12px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 16px; }
.small { font-size: 11px; }
</style>
