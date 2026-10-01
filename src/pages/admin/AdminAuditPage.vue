<script setup lang="ts">
// /manage/audit: the worker's audit log (GET /api/v2/audit), newest first: every change made through the admin API
// (dashboard or API key), what the worker's own jobs did, and refused or failed requests.
import { timeAgo, VxButton, VxCallout, VxChip, VxSkeleton, VxTable, type TableColumn } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import type { AuditEntry } from '@/admin/api'
import ManageShell from '@/admin/ManageShell.vue'
import { stamp } from '@/admin/format'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'
import { errorMessage } from '@/lib/errors'

const PAGE = 50
const { data, error, loading, refresh } = usePoll((signal) => admin.audit({ limit: PAGE }, signal), 30_000)
const older = ref<AuditEntry[]>([])
/** Where the older pages go on: undefined until one is loaded (the first page's cursor then), null at the end. */
const olderCursor = ref<string | null | undefined>(undefined)
const loadingOlder = ref(false)

const entries = computed(() => {
  const first = data.value?.items ?? []
  const seen = new Set(first.map((e) => e.id))
  return [...first, ...older.value.filter((e) => !seen.has(e.id))]
})
const nextCursor = computed(() => (olderCursor.value === undefined ? data.value?.next_cursor ?? null : olderCursor.value))

async function loadOlder() {
  const cursor = nextCursor.value
  if (!cursor) return
  loadingOlder.value = true
  try {
    const page = await admin.audit({ cursor, limit: PAGE })
    older.value = [...older.value, ...page.items]
    olderCursor.value = page.next_cursor
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loadingOlder.value = false
  }
}

const columns: TableColumn[] = [
  { key: 'at', label: 'When', muted: true },
  { key: 'actor', label: 'By' },
  { key: 'action', label: 'Action', mono: true },
  { key: 'outcome', label: 'Outcome' },
  { key: 'target', label: 'Target', mono: true },
  { key: 'detail', label: 'Details', mono: true },
]
// Logins have their password stripped, which leaves an empty object: show that as no details.
const empty = (d: unknown) => d == null || (typeof d === 'object' && !Object.keys(d).length)
/** What it recorded: an edit's before and after (with any detail), or the detail alone. */
function detailText(e: AuditEntry): string {
  if (empty(e.before) && empty(e.after)) return empty(e.detail) ? '' : JSON.stringify(e.detail)
  return JSON.stringify({ before: e.before, after: e.after, ...(empty(e.detail) ? {} : { detail: e.detail }) })
}
const rows = computed(() => entries.value.map((e) => ({ ...e, detailText: detailText(e) })))

/** Who made the change: the Twitch login when the worker knows it, else how they signed in, or the worker itself. */
function actorLabel(e: AuditEntry): string {
  if (e.actor_login) return `@${e.actor_login}`
  if (e.actor_kind === 'api_key') return 'API key'
  if (e.actor_kind === 'user') return e.actor_id === 'password' ? 'password' : 'Twitch'
  return e.actor_kind === 'system' ? 'worker' : e.actor_kind
}
const actorTitle = (e: AuditEntry) => `${e.actor_kind}${e.actor_id ? `:${e.actor_id}` : ''} via ${e.via}`
const outcomeTone = (o: string) => (o === 'ok' ? 'ok' : o === 'denied' ? 'warn' : 'bad')

/** "vod:123" → the VOD's admin page, "job:5" → the job's. */
function targetLink(target: string | null): string | null {
  const m = /^(vod|job):(.+)$/.exec(target ?? '')
  if (!m) return null
  return m[1] === 'vod' ? `/manage/vods/${encodeURIComponent(m[2]!)}` : `/manage/jobs/${encodeURIComponent(m[2]!)}`
}

onMounted(() => (document.title = 'Audit log · Manage · vods.vexoulz.net'))
</script>

<template>
  <ManageShell title="Audit log">
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
        <template #cell-at="{ row }"><span class="when" :title="stamp(row.at)">{{ timeAgo(row.at) }}</span></template>
        <template #cell-actor="{ row }"><VxChip :tone="row.actor_kind === 'user' ? 'accent' : 'default'" :title="actorTitle(row)">{{ actorLabel(row) }}</VxChip></template>
        <template #cell-outcome="{ row }"><VxChip :tone="outcomeTone(row.outcome)">{{ row.outcome }}</VxChip></template>
        <template #cell-target="{ row }">
          <RouterLink v-if="targetLink(row.target)" :to="targetLink(row.target)!">{{ row.target }}</RouterLink>
          <span v-else class="vx-muted">{{ row.target ?? '—' }}</span>
        </template>
        <template #cell-detail="{ row }"><span class="detail" :title="row.detailText">{{ row.detailText || '—' }}</span></template>
      </VxTable>
      <div class="more">
        <VxButton v-if="nextCursor" :loading="loadingOlder" @click="loadOlder">Older entries</VxButton>
        <span class="vx-muted vx-mono small">{{ entries.length }} shown</span>
      </div>
    </template>
  </ManageShell>
</template>

<style scoped>
a { color: inherit; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.when { white-space: nowrap; }
.detail { display: inline-block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; font-size: 12px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 16px; }
.small { font-size: 11px; }
</style>
