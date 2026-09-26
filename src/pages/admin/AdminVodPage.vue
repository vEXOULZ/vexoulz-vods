<script setup lang="ts">
// /admin/vods/:id: fix one VOD by hand (title, chapters, YouTube and Drive lists, emotes) and run its jobs.
import { VxButton, VxCallout, VxChip, VxInput, VxSkeleton, useToast } from '@vexoulz/ui'
import { toClock, toSeconds } from '@vexoulz/vods-core'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isSpliced, type AdminVod } from '@/admin/api'
import AdminShell from '@/admin/AdminShell.vue'
import ChaptersEditor from '@/admin/ChaptersEditor.vue'
import DriveEditor from '@/admin/DriveEditor.vue'
import EmotesPanel from '@/admin/EmotesPanel.vue'
import JobsTable from '@/admin/JobsTable.vue'
import SplicePanel from '@/admin/SplicePanel.vue'
import { stamp } from '@/admin/format'
import { admin } from '@/admin/session'
import { usePoll } from '@/admin/usePoll'
import VodActions from '@/admin/VodActions.vue'
import YoutubeEditor from '@/admin/YoutubeEditor.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const toast = useToast()

const vod = ref<AdminVod | null>(null)
const loadError = ref<string | null>(null)
const notFound = ref(false)

async function load() {
  loadError.value = null
  notFound.value = false
  try {
    vod.value = await admin.vod(props.id)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) notFound.value = true
    else loadError.value = e instanceof Error ? e.message : String(e)
  }
}
watch(() => props.id, load, { immediate: true })

// The VOD's jobs refresh on their own; the VOD itself only reloads after an edit, so open forms keep their drafts.
const { data: jobPage, refresh: refreshJobs } = usePoll((signal) => admin.jobs({ vodId: props.id, limit: 20 }, signal), 5_000)
const jobs = computed(() => jobPage.value?.data ?? vod.value?.jobs ?? [])
const activeJobs = computed(() => jobs.value.filter((j) => j.state === 'running' || j.state === 'queued' || j.state === 'paused').length)

const duration = computed(() => {
  const v = vod.value
  if (!v) return 0
  return v.duration_seconds ?? (Number.isFinite(toSeconds(v.duration)) ? toSeconds(v.duration) : 0)
})

const titleDraft = ref('')
watch(() => vod.value?.title, (t) => (titleDraft.value = t ?? ''), { immediate: true })
const titleSaving = ref(false)
async function saveTitle() {
  const t = titleDraft.value.trim()
  if (!vod.value || !t || t === vod.value.title) return
  titleSaving.value = true
  try {
    vod.value = await admin.updateVod(vod.value.id, { title: t })
    toast.show('Title saved', { duration: 3000 })
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 5000 })
  } finally {
    titleSaving.value = false
  }
}

function saved(v: AdminVod) {
  vod.value = v
}
function jobStarted() {
  refreshJobs()
}
function deleted() {
  router.replace('/admin/vods')
}

watch(vod, (v) => (document.title = `${v?.title ?? props.id} · Admin · vods.vexoulz.net`))
onMounted(() => (document.title = `VOD ${props.id} · Admin · vods.vexoulz.net`))
</script>

<template>
  <AdminShell :title="`VOD ${id}`">
    <template #actions>
      <VxButton :to="`/vods/${id}`">Watch page</VxButton>
      <VxButton :to="`/admin/jobs?vodId=${id}`">All its jobs</VxButton>
    </template>
    <p class="back"><RouterLink to="/admin/vods">← VODs</RouterLink></p>

    <VxCallout v-if="notFound" tone="warn" title="No such VOD">The archive has no VOD {{ id }}.</VxCallout>
    <VxCallout v-else-if="loadError" tone="error" title="Couldn't load this VOD">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="load">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!vod" class="sk" aria-busy="true"><VxSkeleton h="90px" /><VxSkeleton h="200px" /></div>

    <template v-else>
      <section class="panel vx-panel">
        <form class="title-row" @submit.prevent="saveTitle">
          <label class="vx-eyebrow" for="vod-title">Title</label>
          <VxInput id="vod-title" v-model="titleDraft" class="title-input" />
          <VxButton type="submit" variant="primary" :loading="titleSaving" :disabled="!titleDraft.trim() || titleDraft.trim() === vod.title">Save</VxButton>
        </form>
        <dl class="facts">
          <div><dt>Id</dt><dd class="vx-mono">{{ vod.id }}</dd></div>
          <div><dt>Streamed</dt><dd :title="stamp(vod.createdAt)">{{ new Date(vod.createdAt).toLocaleString() }}</dd></div>
          <div><dt>Duration</dt><dd class="vx-mono">{{ toClock(duration) }}</dd></div>
          <div v-if="vod.merged_into"><dt>Merged into</dt><dd class="vx-mono"><RouterLink :to="`/admin/vods/${vod.merged_into.id}`">{{ vod.merged_into.id }}</RouterLink> at {{ toClock(vod.merged_into.offset) }}</dd></div>
          <div v-if="vod.stream_id"><dt>Stream</dt><dd class="vx-mono">{{ vod.stream_id }}</dd></div>
          <div><dt>Parts</dt><dd>{{ vod.youtube?.length ?? 0 }} YouTube · {{ vod.drive?.length ?? 0 }} Drive</dd></div>
          <div><dt>Chapters</dt><dd>{{ vod.chapters?.length ?? 0 }} <VxChip v-if="vod.chaptersLocked" tone="warn">locked</VxChip></dd></div>
        </dl>
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow">Actions</h2>
        <VodActions :vod="vod" @job="jobStarted" @changed="load" @deleted="deleted" />
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow">Merge and split</h2>
        <SplicePanel :vod="vod" @changed="load" @job="jobStarted" />
      </section>

      <section class="panel vx-panel">
        <h2 class="vx-eyebrow">Jobs <span v-if="activeJobs" class="vx-muted">· {{ activeJobs }} active</span></h2>
        <JobsTable :jobs="jobs" empty="No jobs for this VOD." />
      </section>

      <!-- A VOD merged into another has no chapters, uploads or emotes of its own left to edit. -->
      <template v-if="!vod.merged_into">
        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Chapters</h2>
          <ChaptersEditor :vod="vod" :duration="duration" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">YouTube parts</h2>
          <YoutubeEditor :vod="vod" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Drive files</h2>
          <DriveEditor :vod="vod" @saved="saved" />
        </section>

        <section class="panel vx-panel">
          <h2 class="vx-eyebrow">Emotes</h2>
          <EmotesPanel :vod-id="vod.id" :spliced="isSpliced(vod)" @job="jobStarted" />
        </section>
      </template>
    </template>
  </AdminShell>
</template>

<style scoped>
a { color: inherit; }
.back { margin: -8px 0 16px; font-size: 13px; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.panel { padding: 14px 16px; margin-bottom: 16px; }
h2 { margin: 0 0 12px; }
.title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.title-row label { flex-basis: 100%; }
.title-input { flex: 1 1 260px; }
.title-input :deep(input) { width: 100%; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 2px; }
dd { margin: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
</style>
