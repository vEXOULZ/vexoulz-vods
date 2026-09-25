<script setup lang="ts">
// /admin/jobs/:id: one job's steps, controls and log. Polls the job every 3 s and appends new events.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxProgress, VxSkeleton, useToast } from '@vexoulz/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { AdminApiError, jobActions, type ActionResult, type JobEvent } from '@/admin/api'
import AdminShell from '@/admin/AdminShell.vue'
import { ago, stamp, stepStates, STATE_TONE } from '@/admin/format'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'

const props = defineProps<{ id: string }>()
const jobId = computed(() => Number(props.id))
const toast = useToast()

// Events: kept across polls, fetched incrementally with the `after` cursor.
const events = ref<JobEvent[]>([])
const eventsError = ref<string | null>(null)
let after = 0
const MAX_EVENTS = 1000

async function pollEvents(signal: AbortSignal) {
  try {
    const page = await admin.jobEvents(jobId.value, after, signal)
    if (page.data.length) {
      events.value = [...events.value, ...page.data].slice(-MAX_EVENTS)
      after = page.next
    }
    eventsError.value = null
  } catch (e) {
    if (signal.aborted) return
    // 404 before the backend has events: keep the page usable, say so once.
    eventsError.value = e instanceof AdminApiError && e.status === 404 ? 'The worker has no event log for jobs yet.' : String((e as Error).message ?? e)
  }
}

const { data: job, error, refresh } = usePoll(async (signal) => {
  const j = await admin.job(jobId.value, signal)
  await pollEvents(signal)
  return j
}, 3_000)

watch(jobId, () => {
  events.value = []
  after = 0
  refresh()
})

const actions = computed(() => (job.value ? jobActions(job.value) : null))
const steps = computed(() => (job.value ? stepStates(job.value) : []))
const progress = computed(() => [...events.value].reverse().find((e) => e.progress)?.progress ?? null)
/** Log lines to show: progress reports only as the newest one of each unbroken run (uploads report every percent). */
const logLines = computed(() =>
  events.value.filter((e, i, all) => !e.progress || !all[i + 1]?.progress || all[i + 1]!.step !== e.step),
)
const progressText = (p: { done: number; total: number; unit: string }) =>
  p.unit === 'percent' ? `${Math.round(p.done)}%` : p.unit === 'bytes' ? `${(p.done / 1e9).toFixed(2)} / ${(p.total / 1e9).toFixed(2)} GB` : `${p.done}/${p.total} ${p.unit}`
const progressStep = computed(() => [...events.value].reverse().find((e) => e.progress)?.step ?? null)

const busy = ref<string | null>(null)
async function act(name: string, run: () => Promise<ActionResult | unknown>) {
  busy.value = name
  try {
    const res = await run()
    const msg = (res as ActionResult | undefined)?.msg
    toast.show(msg || 'Done', { duration: 3000 })
    await refresh()
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.value = null
  }
}

const confirmCancel = ref(false)
function cancel() {
  confirmCancel.value = false
  act('cancel', () => admin.cancel(jobId.value))
}

function togglePause(step: string, on: boolean) {
  const cur = job.value?.pauseBefore ?? []
  const next = on ? [...cur, step] : cur.filter((s) => s !== step)
  act('pauseBefore', () => admin.updateJob(jobId.value, { pauseBefore: next }).then(() => ({ msg: on ? `Will pause before ${step}` : `Won't pause before ${step}` })))
}
function togglePauseNext(on: boolean) {
  act('pauseNext', () => admin.updateJob(jobId.value, { pauseNext: on }).then(() => ({ msg: on ? 'Will pause after this step' : "Won't pause after this step" })))
}

const payloadText = computed(() => (job.value && Object.keys(job.value.payload ?? {}).length ? JSON.stringify(job.value.payload, null, 2) : null))
const logBox = ref<HTMLElement | null>(null)
const follow = ref(true)
watch(
  () => logLines.value.length,
  () => {
    const el = logBox.value
    if (el && follow.value) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight))
  },
)
function onLogScroll() {
  const el = logBox.value
  if (el) follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
const time = (iso: string) => new Date(iso).toLocaleTimeString()

onMounted(() => (document.title = `Job ${props.id} · Admin · vods.vexoulz.net`))
</script>

<template>
  <AdminShell :title="`Job ${id}`">
    <template v-if="job" #actions>
      <VxButton v-if="actions?.resume" size="sm" variant="primary" :loading="busy === 'resume'" @click="act('resume', () => admin.resume(jobId))">Resume</VxButton>
      <VxButton v-if="actions?.resume" size="sm" :loading="busy === 'once'" @click="act('once', () => admin.resume(jobId, true))">Run one step</VxButton>
      <VxButton v-if="actions?.pause" size="sm" :loading="busy === 'pause'" @click="act('pause', () => admin.pause(jobId))">Pause</VxButton>
      <VxButton v-if="actions?.retry" size="sm" variant="primary" :loading="busy === 'retry'" @click="act('retry', () => admin.retry(jobId))">Retry</VxButton>
      <VxButton v-if="actions?.cancel" size="sm" variant="danger" :loading="busy === 'cancel'" @click="confirmCancel = true">Cancel</VxButton>
    </template>

    <p class="back"><RouterLink to="/admin/jobs">← All jobs</RouterLink></p>

    <VxCallout v-if="error && !job" tone="error" title="Couldn't load this job">
      {{ error }}
      <template #actions><VxButton size="sm" @click="refresh">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!job" aria-busy="true" class="sk"><VxSkeleton h="120px" /><VxSkeleton h="240px" /></div>

    <template v-else>
      <VxCallout v-if="error" tone="warn">Refresh failed: {{ error }}. Showing the last known state.</VxCallout>

      <div class="summary vx-panel">
        <dl>
          <div><dt>State</dt><dd><VxChip :tone="STATE_TONE[job.state]">{{ job.state }}</VxChip></dd></div>
          <div><dt>Kind</dt><dd class="vx-mono">{{ job.kind }}</dd></div>
          <div>
            <dt>VOD</dt>
            <dd class="vx-mono">
              <RouterLink v-if="job.vodId" :to="`/admin/vods/${job.vodId}`">{{ job.vodId }}</RouterLink><span v-else>—</span>
              <RouterLink v-if="job.vodId" class="small" :to="`/admin/jobs?vodId=${job.vodId}`"> · its jobs</RouterLink>
            </dd>
          </div>
          <div><dt>Attempts</dt><dd class="vx-mono">{{ job.attempts }}</dd></div>
          <div><dt>Created</dt><dd :title="stamp(job.createdAt)">{{ ago(job.createdAt) }}</dd></div>
          <div><dt>Updated</dt><dd :title="stamp(job.updatedAt)">{{ ago(job.updatedAt) }}</dd></div>
          <div v-if="job.notBefore && job.state === 'queued'"><dt>Next try</dt><dd :title="stamp(job.notBefore)">{{ ago(job.notBefore) }}</dd></div>
        </dl>
        <VxCallout v-if="job.lastError" :tone="job.state === 'failed' ? 'error' : 'warn'" title="Last error">
          <pre class="error-text">{{ job.lastError }}</pre>
        </VxCallout>
      </div>

      <div class="cols">
        <section>
          <h2 class="vx-eyebrow">Steps</h2>
          <ol class="steps vx-panel">
            <li v-for="s in steps" :key="s.name" :class="`is-${s.status}`">
              <span class="mark" aria-hidden="true">{{ s.status === 'done' ? '✓' : s.status === 'todo' ? '·' : '▶' }}</span>
              <span class="name vx-mono">{{ s.name }}</span>
              <VxChip v-if="s.status !== 'done' && s.status !== 'todo'" :tone="STATE_TONE[s.status]">{{ s.status }}</VxChip>
              <VxCheckbox
                v-if="s.status === 'todo' && job.state !== 'cancelled'"
                class="pb"
                :model-value="s.pauseBefore"
                :disabled="!!busy"
                @update:model-value="togglePause(s.name, $event)"
              >pause before</VxCheckbox>
            </li>
          </ol>
          <VxCheckbox
            v-if="job.state === 'running'"
            class="pause-next"
            :model-value="job.pauseNext"
            :disabled="!!busy"
            @update:model-value="togglePauseNext"
          >Pause after the current step</VxCheckbox>
          <div v-if="progress && job.state === 'running'" class="progress">
            <div class="vx-mono small">{{ progressStep ?? 'progress' }} · {{ progressText(progress) }}</div>
            <VxProgress :value="progress.done" :max="progress.total" :label="`${progressStep ?? 'Progress'}: ${progressText(progress)}`" />
          </div>
          <template v-if="payloadText">
            <h2 class="vx-eyebrow">Payload</h2>
            <pre class="payload vx-panel vx-mono">{{ payloadText }}</pre>
          </template>
        </section>

        <section class="log-col">
          <h2 class="vx-eyebrow">Log</h2>
          <div ref="logBox" class="log vx-panel vx-mono" role="log" aria-live="polite" @scroll="onLogScroll">
            <p v-if="eventsError" class="vx-muted">{{ eventsError }}</p>
            <p v-else-if="!events.length" class="vx-muted">No log lines yet.</p>
            <div v-for="e in logLines" :key="e.seq" class="line" :class="`is-${e.level}`">
              <span class="t" :title="stamp(e.at)">{{ time(e.at) }}</span>
              <span v-if="e.step" class="s">{{ e.step }}</span>
              <span class="m">{{ e.message }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <VxDialog v-model:open="confirmCancel" title="Cancel this job?">
      A running step is stopped where it is. You can retry the job later from the step it was on.
      <template #actions="{ close }">
        <VxButton @click="close">Keep it</VxButton>
        <VxButton variant="danger-solid" @click="cancel">Cancel job</VxButton>
      </template>
    </VxDialog>
  </AdminShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.summary { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 2px; }
dd { margin: 0; }
.small { font-size: 12px; opacity: 0.7; }
.error-text { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
.cols { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 20px; }
@container vx-site (max-width: 760px) { .cols { grid-template-columns: minmax(0, 1fr); } }
h2 { margin: 0 0 8px; }
.steps { list-style: none; margin: 0 0 10px; padding: 6px 0; }
.steps li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 6px 12px; }
.steps .mark { width: 14px; text-align: center; }
.steps .name { flex: 1 1 auto; }
.steps .is-done { opacity: 0.55; }
.steps .is-running .mark, .steps .is-failed .mark { color: var(--vx-accent); }
.steps .is-failed .mark { color: var(--vx-bad); }
.pb { font-size: 12px; }
.pause-next { margin-bottom: 12px; }
.progress { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.payload { margin: 0; padding: 10px 12px; font-size: 12px; overflow: auto; }
.log { height: min(60vh, 520px); overflow: auto; padding: 10px 12px; font-size: 12px; line-height: 1.5; }
.log p { margin: 0; }
.line { display: flex; gap: 8px; }
.line .t { opacity: 0.5; flex: none; }
.line .s { color: var(--vx-accent); flex: none; }
.line .m { white-space: pre-wrap; word-break: break-word; }
.line.is-warning .m { color: var(--vx-warn); }
.line.is-error .m { color: var(--vx-bad); }
</style>
