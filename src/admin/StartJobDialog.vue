<script setup lang="ts">
// Start any job kind the worker knows (from /admin/kinds): pick the kind, the VOD, where to start and where to pause.
import { VxButton, VxCallout, VxCheckbox, VxDialog, VxField, VxInput, VxSelect, type Option } from '@vexoulz/ui'
import { computed, ref, watch } from 'vue'
import type { JobKind } from './api'
import { admin } from './session'

const props = defineProps<{ kinds: Record<string, JobKind>; vodId?: string }>()
const emit = defineEmits<{ started: [jobId: number] }>()
const open = defineModel<boolean>('open', { default: false })

const kind = ref('archive')
const vodId = ref('')
const fromStep = ref('')
const pauseBefore = ref<string[]>([])
const paused = ref(false)
const payload = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const kindOptions = computed<Option<string>[]>(() =>
  Object.entries(props.kinds).map(([k, v]) => ({ value: k, label: k, sub: `${v.steps.length} steps` })),
)
const steps = computed(() => props.kinds[kind.value]?.steps ?? [])
const stepOptions = computed<Option<string>[]>(() => [{ value: '', label: 'First step' }, ...steps.value.map((s) => ({ value: s, label: s }))])

watch(open, (v) => {
  if (!v) return
  error.value = null
  vodId.value = props.vodId ?? ''
  if (!props.kinds[kind.value]) kind.value = Object.keys(props.kinds)[0] ?? ''
})
watch(
  [kind, () => props.kinds],
  () => {
    fromStep.value = ''
    pauseBefore.value = [...(props.kinds[kind.value]?.manualSteps ?? [])]
  },
  { immediate: true },
)

function togglePause(step: string, on: boolean) {
  pauseBefore.value = on ? [...pauseBefore.value, step] : pauseBefore.value.filter((s) => s !== step)
}

const payloadError = computed(() => {
  if (!payload.value.trim()) return null
  try {
    const v: unknown = JSON.parse(payload.value)
    return v && typeof v === 'object' && !Array.isArray(v) ? null : 'Must be a JSON object.'
  } catch {
    return 'Not valid JSON.'
  }
})

async function submit() {
  if (!kind.value || payloadError.value) return
  busy.value = true
  error.value = null
  try {
    const res = await admin.launch({
      kind: kind.value,
      vodId: vodId.value.trim() || undefined,
      payload: payload.value.trim() ? JSON.parse(payload.value) : undefined,
      fromStep: fromStep.value || undefined,
      pauseBefore: pauseBefore.value,
      paused: paused.value,
    })
    if (res.jobId != null) emit('started', res.jobId)
    else open.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VxDialog v-model:open="open" title="Start a job" width="480px">
    <form id="start-job" class="form" @submit.prevent="submit">
      <VxCallout v-if="!kindOptions.length" tone="warn">Couldn't load the job kinds from the worker.</VxCallout>
      <div class="row">
        <VxField label="Kind">
          <template #default="{ id }"><VxSelect :id="id" v-model="kind" :options="kindOptions" width="100%" /></template>
        </VxField>
        <VxField label="VOD id" help="Empty for jobs that aren't about one VOD.">
          <template #default="{ id }"><VxInput :id="id" v-model="vodId" mono placeholder="2345678901" /></template>
        </VxField>
      </div>
      <VxField label="Start at">
        <template #default="{ id }"><VxSelect :id="id" v-model="fromStep" :options="stepOptions" width="100%" /></template>
      </VxField>
      <fieldset v-if="steps.length" class="steps">
        <legend class="vx-eyebrow">Pause before</legend>
        <VxCheckbox v-for="s in steps" :key="s" :model-value="pauseBefore.includes(s)" @update:model-value="togglePause(s, $event)">
          <span class="vx-mono">{{ s }}</span>
        </VxCheckbox>
      </fieldset>
      <VxCheckbox v-model="paused">Create it paused (resume it by hand)</VxCheckbox>
      <VxField label="Payload (JSON, optional)" :error="payloadError ?? undefined">
        <template #default="{ id }">
          <textarea :id="id" v-model="payload" class="vx-input vx-mono payload" rows="3" placeholder='{"force": true}' />
        </template>
      </VxField>
      <VxCallout v-if="error" tone="error">{{ error }}</VxCallout>
    </form>
    <template #actions="{ close }">
      <VxButton @click="close">Cancel</VxButton>
      <VxButton type="submit" form="start-job" variant="primary" :loading="busy" :disabled="!kind || !!payloadError">Start</VxButton>
    </template>
  </VxDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; color: var(--vx-text, inherit); }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.row :deep(input) { width: 100%; }
.steps { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; }
.steps legend { margin-bottom: 6px; padding: 0; }
.payload { width: 100%; box-sizing: border-box; height: auto; resize: vertical; padding: 6px 8px; }
</style>
