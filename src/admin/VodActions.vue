<script setup lang="ts">
// Jobs and fixes for one VOD, through the worker's existing routes. Each starts a job (shown in the VOD's job list);
// delete removes the VOD from the archive after typing its id.
import { VxButton, VxCheckbox, VxDialog, VxField, VxInput, VxSelect, useToast, type Option } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import type { ActionResult, AdminVod } from './api'
import { admin } from './session'

const props = defineProps<{ vod: AdminVod }>()
const emit = defineEmits<{ job: [jobId: number]; changed: []; deleted: [] }>()
const toast = useToast()

const TYPES: Option<'vod' | 'live'>[] = [
  { value: 'vod', label: 'VOD', sub: 'The Twitch VOD' },
  { value: 'live', label: 'Live', sub: 'The live recording' },
]
const hasLive = computed(() => (props.vod.youtube ?? []).some((u) => u.type === 'live') || !!props.vod.stream_id)

const busy = ref<string | null>(null)
async function run(name: string, action: () => Promise<ActionResult>, after?: () => void) {
  busy.value = name
  try {
    const res = await action()
    toast.show(res.msg, { duration: 3500 })
    if (res.jobId != null) emit('job', res.jobId)
    after?.()
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 6000 })
  } finally {
    busy.value = null
  }
}

const forceChapters = ref(false)

// Download again
const dlOpen = ref(false)
const dlType = ref<'vod' | 'live'>('vod')
const dlStart = ref('')
const dlEnd = ref('')
const partNum = (v: string) => (v.trim() ? Number(v) : undefined)
const dlBad = computed(() => [dlStart.value, dlEnd.value].some((v) => v.trim() && !(Number.isInteger(Number(v)) && Number(v) >= 1)))
function download() {
  dlOpen.value = false
  run('download', () => admin.redownload(props.vod.id, { type: dlType.value, startPart: partNum(dlStart.value), endPart: partNum(dlEnd.value) }))
}

// Re-upload one part
const ruOpen = ref(false)
const ruType = ref<'vod' | 'live'>('vod')
const ruPart = ref('1')
const ruBad = computed(() => !(Number.isInteger(Number(ruPart.value)) && Number(ruPart.value) >= 1))
function reupload() {
  ruOpen.value = false
  run('reupload', () => admin.reuploadPart(props.vod.id, Number(ruPart.value), ruType.value))
}

const descType = ref<'vod' | 'live'>('vod')

// Delete
const delOpen = ref(false)
const delConfirm = ref('')
function remove() {
  delOpen.value = false
  run('delete', () => admin.deleteVod(props.vod.id), () => emit('deleted'))
}
</script>

<template>
  <div class="actions">
    <div class="group">
      <div class="vx-eyebrow">Metadata</div>
      <div class="btns">
        <VxButton size="sm" :loading="busy === 'chapters'" @click="run('chapters', () => admin.refetchChapters(vod.id, forceChapters))">Re-fetch chapters from Twitch</VxButton>
        <VxCheckbox v-if="vod.chaptersLocked" v-model="forceChapters" class="small">replace hand edits (locked)</VxCheckbox>
        <VxButton size="sm" :loading="busy === 'chat'" @click="run('chat', () => admin.saveChat(vod.id))">Save chat again</VxButton>
        <VxButton size="sm" :loading="busy === 'duration'" @click="run('duration', () => admin.refreshDuration(vod.id), () => emit('changed'))">Refresh duration</VxButton>
      </div>
    </div>
    <div class="group">
      <div class="vx-eyebrow">YouTube</div>
      <div class="btns">
        <VxSelect v-if="hasLive" v-model="descType" :options="TYPES" size="sm" width="96px" />
        <VxButton size="sm" :loading="busy === 'describe'" @click="run('describe', () => admin.updateDescriptions(vod.id, descType))">Update descriptions</VxButton>
        <VxButton size="sm" :loading="busy === 'reupload'" @click="ruOpen = true">Re-upload a part…</VxButton>
        <VxButton size="sm" :loading="busy === 'download'" @click="dlOpen = true">Download and upload again…</VxButton>
      </div>
    </div>
    <div class="group">
      <div class="vx-eyebrow">Danger</div>
      <div class="btns">
        <VxButton size="sm" variant="danger" :loading="busy === 'delete'" @click="delConfirm = ''; delOpen = true">Delete from the archive…</VxButton>
      </div>
    </div>

    <VxDialog v-model:open="dlOpen" title="Download and upload again">
      Downloads the VOD again (while Twitch still has it), splits it and uploads the parts. Leave the range empty for every part.
      <div class="form">
        <VxField label="Source">
          <template #default="{ id }"><VxSelect :id="id" v-model="dlType" :options="TYPES" width="100%" /></template>
        </VxField>
        <div class="range">
          <VxField label="From part"><template #default="{ id }"><VxInput :id="id" v-model="dlStart" mono placeholder="1" /></template></VxField>
          <VxField label="To part"><template #default="{ id }"><VxInput :id="id" v-model="dlEnd" mono placeholder="last" /></template></VxField>
        </div>
      </div>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :disabled="dlBad" @click="download">Start</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="ruOpen" title="Re-upload a part">
      Splits that part again from the saved video (or downloads it) and uploads it as a new YouTube video.
      <div class="form range">
        <VxField label="Source">
          <template #default="{ id }"><VxSelect :id="id" v-model="ruType" :options="TYPES" width="100%" /></template>
        </VxField>
        <VxField label="Part" :error="ruBad ? 'A whole number ≥ 1.' : undefined">
          <template #default="{ id }"><VxInput :id="id" v-model="ruPart" mono :invalid="ruBad" /></template>
        </VxField>
      </div>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :disabled="ruBad" @click="reupload">Start</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="delOpen" title="Delete this VOD from the archive?">
      Removes the VOD with its chat, emotes and game uploads from the archive and the site. The YouTube videos stay.
      This can't be undone. Type the VOD id to confirm.
      <div class="form">
        <VxInput v-model="delConfirm" mono :placeholder="vod.id" />
      </div>
      <template #actions="{ close }">
        <VxButton @click="close">Keep it</VxButton>
        <VxButton variant="danger-solid" :disabled="delConfirm.trim() !== vod.id" @click="remove">Delete</VxButton>
      </template>
    </VxDialog>
  </div>
</template>

<style scoped>
.actions { display: flex; flex-direction: column; gap: 14px; }
.group { display: flex; flex-direction: column; gap: 6px; }
.btns { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.small { font-size: 12px; }
.form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; color: var(--vx-text, inherit); }
.form :deep(input) { width: 100%; box-sizing: border-box; }
.range { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
</style>
