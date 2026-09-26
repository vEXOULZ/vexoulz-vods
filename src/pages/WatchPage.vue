<script setup lang="ts">
// /vods/:id, /live/:id and /youtube/:id. `?t=` is VOD time (wins), `?part=` starts a part from its beginning;
// with neither, playback resumes where this browser left off. A VOD merged into another one sends you to the same
// moment in that one.
import { useToast, VxAccountMenu, VxButton, VxCallout, VxEmptyState, VxSiteShell, VxSkeleton } from '@vexoulz/ui'
import { isResumable, parseTimestamp, toClock, toHMS, type Position, type UploadType } from '@vexoulz/vods-core'
import { useVodsContext, useWatch } from '@vexoulz/vods-core/vue'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WatchView from '@/components/WatchView.vue'
import { NAV } from '@/lib/nav'
import { site } from '@/vods.config'

const props = defineProps<{ id: string; type: UploadType | null }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { progress } = useVodsContext()
const { vod, timeline, uploadType, download, loading, notFound, error, reload } = useWatch(
  () => props.id,
  () => props.type,
)

// Old links to the later half of a merged broadcast: same route type (both halves had the same kind of uploads),
// same moment, and this browser's progress on the old id carries over.
const merged = computed(() => vod.value?.mergedInto ?? null)
watch(
  merged,
  async (m) => {
    if (!m) return
    const from = props.id
    let t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    if (!t) {
      const saved = await progress.get(from).catch(() => null)
      if (saved && isResumable(saved)) t = saved.t
    }
    if (props.id !== from) return
    const base = route.path.split('/')[1] || 'vods'
    const at = m.offset + (t ?? 0)
    router.replace({ path: `/${base}/${encodeURIComponent(m.id)}`, query: at > 0 ? { t: `${Math.floor(at)}s` } : {}, hash: route.hash })
  },
  { immediate: true },
)

const start = shallowRef<Position | null>(null)
watch(
  timeline,
  async (tl) => {
    start.value = null
    if (!tl || tl.isEmpty || merged.value) return
    const t = parseTimestamp(typeof route.query.t === 'string' ? route.query.t : null)
    const part = Number(route.query.part) || null
    if (!t && !part) {
      const saved = await progress.get(props.id).catch(() => null)
      if (tl !== timeline.value) return
      if (saved && isResumable(saved)) {
        start.value = tl.locate(saved.t)
        toast.show(`Resumed at ${toClock(saved.t)}`, { kind: 'info' })
        return
      }
    }
    start.value = tl.resolveStart({ t, part })
  },
  { immediate: true },
)

/** The other upload set, when this one is empty but that one isn't. */
const other = computed(() => {
  const v = vod.value
  if (!v || !timeline.value?.isEmpty) return null
  const alt: UploadType = uploadType.value === 'live' ? 'vod' : 'live'
  return v.uploads.some((u) => u.type === alt) ? `/${alt === 'vod' ? 'vods' : 'live'}/${v.id}` : null
})

const shareUrl = (t: number) => `${location.origin}${route.path}?t=${toHMS(t)}`

watchEffect(() => {
  document.title = vod.value ? `${vod.value.title} · vods.vexoulz.net` : 'vods.vexoulz.net'
})
</script>

<template>
  <WatchView
    v-if="vod && timeline && start && !merged"
    :key="`${vod.id}:${uploadType}`"
    :vod="vod"
    :timeline="timeline"
    :start="start"
    :download="download"
    :share-url="shareUrl"
  />
  <VxSiteShell v-else site="vods" :nav="NAV">
    <template #account><VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." /></template>
    <VxCallout v-if="error" tone="error" title="Couldn't load this VOD">
      {{ error.message }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <VxEmptyState v-else-if="notFound" code="404" title="No VOD with that id" text="It may never have been archived, or the link is mistyped.">
      <template #actions><VxButton to="/vods" variant="primary">Browse VODs</VxButton></template>
    </VxEmptyState>
    <VxEmptyState
      v-else-if="vod && timeline?.isEmpty && !merged"
      title="Not on YouTube yet"
      :text="`“${vod.title}” has no ${uploadType === 'live' ? 'live' : 'VOD'} uploads yet. Chat replay needs a video to follow.`"
    >
      <template #actions>
        <VxButton v-if="other" :to="other" variant="primary">Watch the other upload</VxButton>
        <VxButton :href="site.twitchUrl" external>Twitch channel</VxButton>
        <VxButton to="/vods">All VODs</VxButton>
      </template>
    </VxEmptyState>
    <div v-else-if="loading || !start" class="loading" aria-busy="true">
      <VxSkeleton ratio="16 / 9" h="auto" />
      <VxSkeleton w="60%" />
      <VxSkeleton w="30%" h="0.8em" />
    </div>
  </VxSiteShell>
</template>

<style scoped>
.loading { display: flex; flex-direction: column; gap: 10px; }
</style>
