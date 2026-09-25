<script setup lang="ts">
// A VOD's Google Drive files (the watch page's download button). Paste a Drive link or the file id.
import { VxButton, VxCallout, VxSelect, useToast, type Option } from '@vexoulz/ui'
import { computed, ref, watch } from 'vue'
import type { AdminVod } from './api'
import { driveDrafts, driveEdits, driveErrors, driveId, newDrive, type DriveDraft } from './edits'
import { admin } from './session'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD' },
  { value: 'live', label: 'Live' },
]

const rows = ref<DriveDraft[]>([])
const snapshot = ref('')
const error = ref<string | null>(null)
function reset() {
  rows.value = driveDrafts(props.vod.drive)
  snapshot.value = JSON.stringify(driveEdits(rows.value))
  error.value = null
}
watch(() => props.vod.id + JSON.stringify(props.vod.drive), reset, { immediate: true })

const dirty = computed(() => JSON.stringify(driveEdits(rows.value)) !== snapshot.value)
const errors = computed(() => driveErrors(rows.value))

const saving = ref(false)
async function save() {
  if (errors.value.size) return
  saving.value = true
  error.value = null
  try {
    emit('saved', await admin.saveDrive(props.vod.id, driveEdits(rows.value)))
    toast.show('Drive files saved', { duration: 3000 })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="drive">
    <p v-if="!rows.length" class="vx-muted empty">No Drive files.</p>
    <ol class="rows">
      <li v-for="(r, i) in rows" :key="r.key" class="row" :class="{ 'has-error': errors.has(r.key) }">
        <input
          class="vx-input vx-mono id"
          :value="r.id"
          :aria-label="`File ${i + 1} id`"
          placeholder="Drive file id or link"
          @change="r.id = driveId(($event.target as HTMLInputElement).value)"
        />
        <VxSelect v-model="r.type" :options="TYPES" size="sm" width="88px" />
        <VxButton v-if="r.id" size="sm" variant="ghost" :href="`https://drive.google.com/file/d/${encodeURIComponent(r.id)}/view`" external>Open ↗</VxButton>
        <VxButton size="sm" variant="ghost" icon :label="`Remove file ${i + 1}`" @click="rows = rows.filter((x) => x !== r)">×</VxButton>
        <p v-if="errors.has(r.key)" class="err">{{ errors.get(r.key) }}</p>
      </li>
    </ol>
    <VxCallout v-if="error" tone="error" title="Couldn't save the Drive files">{{ error }}</VxCallout>
    <div class="foot">
      <VxButton size="sm" @click="rows.push(newDrive())">+ Add file</VxButton>
      <span class="spacer" />
      <VxButton size="sm" :disabled="!dirty || saving" @click="reset">Undo changes</VxButton>
      <VxButton size="sm" variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="save">Save files</VxButton>
    </div>
  </div>
</template>

<style scoped>
.drive { display: flex; flex-direction: column; gap: 10px; }
.empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px;
  border-radius: var(--vx-radius); background: var(--vx-panel, rgba(255, 255, 255, 0.03));
}
.row.has-error { box-shadow: inset 0 0 0 1px var(--vx-bad); }
.id { flex: 1 1 200px; min-width: 0; box-sizing: border-box; }
.err { flex-basis: 100%; margin: 0; color: var(--vx-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
</style>
