<script setup lang="ts">
// A VOD's YouTube parts: video id (paste a URL or the id), vod/live set, part number, duration. Existing videos keep
// their thumbnail; leave duration empty to keep the archive's (or while YouTube is processing).
import { VxButton, VxCallout, VxSelect, useToast, type Option } from '@vexoulz/ui'
import { computed, ref, watch } from 'vue'
import type { AdminVod } from './api'
import { newYoutube, youtubeDrafts, youtubeEdits, youtubeErrors, youtubeId, type YoutubeDraft } from './edits'
import { admin } from './session'
import TimeInput from './TimeInput.vue'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ saved: [vod: AdminVod] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD', sub: 'From the Twitch VOD' },
  { value: 'live', label: 'Live', sub: 'From the live recording' },
]

const rows = ref<YoutubeDraft[]>([])
const snapshot = ref('')
const error = ref<string | null>(null)
function reset() {
  rows.value = youtubeDrafts(props.vod.youtube)
  snapshot.value = JSON.stringify(youtubeEdits(rows.value))
  error.value = null
}
watch(() => props.vod.id + JSON.stringify(props.vod.youtube), reset, { immediate: true })

const dirty = computed(() => JSON.stringify(youtubeEdits(rows.value)) !== snapshot.value)
const errors = computed(() => youtubeErrors(rows.value))

function add() {
  rows.value.push(newYoutube(rows.value, rows.value.some((r) => r.type === 'live') && !rows.value.some((r) => r.type === 'vod') ? 'live' : 'vod'))
}
function remove(r: YoutubeDraft) {
  rows.value = rows.value.filter((x) => x !== r)
}
function setId(r: YoutubeDraft, value: string) {
  r.id = youtubeId(value)
}

const saving = ref(false)
async function save() {
  if (errors.value.size) return
  saving.value = true
  error.value = null
  try {
    emit('saved', await admin.saveYoutube(props.vod.id, youtubeEdits(rows.value)))
    toast.show('YouTube parts saved', { duration: 3000 })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="uploads">
    <p v-if="!rows.length" class="vx-muted empty">No YouTube parts.</p>
    <ol class="rows">
      <li v-for="(r, i) in rows" :key="r.key" class="row" :class="{ 'has-error': errors.has(r.key) }">
        <a v-if="r.id && r.thumbnail" :href="`https://youtu.be/${r.id}`" target="_blank" rel="noopener" class="thumb">
          <img :src="r.thumbnail" alt="" loading="lazy" />
        </a>
        <span v-else class="thumb ph" aria-hidden="true" />
        <input
          class="vx-input vx-mono id"
          :value="r.id"
          :aria-label="`Part ${i + 1} video id`"
          placeholder="Video id or YouTube URL"
          @change="setId(r, ($event.target as HTMLInputElement).value)"
        />
        <VxSelect v-model="r.type" :options="TYPES" width="96px" />
        <label class="part">
          <span class="vx-muted">Part</span>
          <input v-model.number="r.part" class="vx-input vx-mono num" type="number" min="1" step="1" :aria-label="`Row ${i + 1} part number`" />
        </label>
        <TimeInput v-model="r.duration" optional placeholder="duration" :label="`Part ${i + 1} duration`" />
        <VxButton variant="ghost" icon :label="`Remove row ${i + 1}`" @click="remove(r)">×</VxButton>
        <p v-if="errors.has(r.key)" class="err">{{ errors.get(r.key) }}</p>
      </li>
    </ol>
    <VxCallout v-if="error" tone="error" title="Couldn't save the YouTube parts">{{ error }}</VxCallout>
    <div class="foot">
      <VxButton @click="add">+ Add part</VxButton>
      <span class="spacer" />
      <VxButton :disabled="!dirty || saving" @click="reset">Undo changes</VxButton>
      <VxButton variant="primary" :loading="saving" :disabled="!dirty || errors.size > 0" @click="save">Save parts</VxButton>
    </div>
  </div>
</template>

<style scoped>
.uploads { display: flex; flex-direction: column; gap: 10px; }
.empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px;
  border-radius: var(--vx-radius); background: var(--vx-panel, rgba(255, 255, 255, 0.03));
}
.row.has-error { box-shadow: inset 0 0 0 1px var(--vx-bad); }
.thumb { width: 64px; aspect-ratio: 16 / 9; border-radius: 3px; overflow: hidden; flex: none; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph { background: var(--vx-line); }
.id { flex: 1 1 180px; min-width: 0; box-sizing: border-box; }
.part { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.num { width: 60px; box-sizing: border-box; }
.err { flex-basis: 100%; margin: 0; color: var(--vx-bad); font-size: 12px; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
</style>
