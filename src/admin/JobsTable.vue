<script setup lang="ts">
import { VxChip, VxTable, type TableColumn } from '@vexoulz/ui'
import { computed } from 'vue'
import type { Job } from './api'
import { ago, stamp, stepPosition, STATE_TONE } from './format'

const props = withDefaults(defineProps<{ jobs: Job[]; empty?: string }>(), { empty: 'No jobs.' })

const columns: TableColumn[] = [
  { key: 'id', label: '#', mono: true, width: '64px' },
  { key: 'kind', label: 'Kind', mono: true },
  { key: 'vodId', label: 'VOD', mono: true },
  { key: 'state', label: 'State' },
  { key: 'step', label: 'Step', mono: true },
  { key: 'updatedAt', label: 'Updated', muted: true, align: 'right' },
]

const rows = computed(() => props.jobs.map((j) => ({ ...j, _pos: stepPosition(j) })))
</script>

<template>
  <VxTable :columns="columns" :rows="rows" row-key="id" manual :empty="empty" label="Jobs">
    <template #cell-id="{ row }">
      <RouterLink :to="`/admin/jobs/${row.id}`">{{ row.id }}</RouterLink>
    </template>
    <template #cell-vodId="{ row }">
      <RouterLink v-if="row.vodId" :to="`/vods/${row.vodId}`">{{ row.vodId }}</RouterLink>
      <span v-else class="vx-muted">—</span>
    </template>
    <template #cell-state="{ row }">
      <VxChip :tone="STATE_TONE[row.state]">{{ row.state }}</VxChip>
    </template>
    <template #cell-step="{ row }">
      <span v-if="row.state === 'done'" class="vx-muted">finished</span>
      <template v-else>
        {{ row.step ?? '—' }}
        <span class="vx-muted">{{ row._pos.index + 1 }}/{{ row._pos.total }}</span>
      </template>
      <div v-if="row.lastError && row.state === 'failed'" class="err" :title="row.lastError">{{ row.lastError }}</div>
    </template>
    <template #cell-updatedAt="{ row }">
      <span :title="stamp(row.updatedAt)">{{ ago(row.updatedAt) }}</span>
    </template>
  </VxTable>
</template>

<style scoped>
a { color: inherit; }
.err { color: var(--vx-bad, #e5484d); font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
