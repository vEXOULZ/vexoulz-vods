<script setup lang="ts">
// One VOD in the list: placeholder thumbnail with duration, fanned game posters, chapter strip, and where you
// stopped (from watch progress) with a bar showing how much you've seen.
import { VxChapterBar, VxLink, VxPlaceholder, VxPosters } from '@vexoulz/ui'
import { gamesOf, toClock, type Progress, type Vod } from '@vexoulz/vods-core'
import { computed } from 'vue'
import { watchPath } from '@/lib/listQuery'

const props = defineProps<{ vod: Vod; progress?: Progress | null }>()

const games = computed(() => gamesOf(props.vod))
const date = computed(() =>
  props.vod.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
)
const to = computed(() => watchPath(props.vod, props.progress?.t))
const watched = computed(() => (props.progress && props.vod.duration ? Math.min(1, props.progress.t / props.vod.duration) : 0))
</script>

<template>
  <VxLink :to="to" class="card">
    <div class="thumb">
      <div class="vx-ring img"><VxPlaceholder label="thumbnail 16:9" ratio="16 / 9" /></div>
      <span class="dur vx-mono">{{ toClock(vod.duration) }}</span>
      <template v-if="progress">
        <span class="resume vx-mono" :title="`You stopped at ${toClock(progress.t)}. Opens the VOD right there.`">
          ▶ {{ toClock(progress.t) }}
        </span>
        <span class="watched" :style="{ width: `${watched * 100}%` }"></span>
      </template>
      <VxPosters v-if="games.length" class="posters" :games="games" mode="fan" :size="30" />
      <VxChapterBar v-if="vod.chapters.length" class="chapters" :chapters="vod.chapters" />
    </div>
    <div class="text">
      <div class="title">{{ vod.title || 'Untitled stream' }}</div>
      <div class="meta">
        <span class="vx-mono date">{{ date }}</span>
        <span v-if="games.length" class="games">{{ games.join(', ') }}</span>
      </div>
    </div>
  </VxLink>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: 9px; color: inherit; text-decoration: none; min-width: 0; }
.thumb { position: relative; }
.img { border-radius: var(--vx-radius); }
.img :deep(.vx-ph) { border-radius: var(--vx-radius); background-color: var(--vx-surface); }
.dur, .resume {
  position: absolute; top: 6px; font-size: 11px; padding: 0 6px; border-radius: var(--vx-radius-sm);
  background: rgb(0 0 0 / 0.75);
}
.dur { right: 6px; color: #fff; }
.resume { left: 6px; color: var(--vx-accent); }
.watched { position: absolute; left: 0; bottom: 3px; height: 3px; background: var(--vx-accent); z-index: 1; }
.posters { position: absolute; left: 8px; bottom: 10px; }
.chapters { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0 0 var(--vx-radius) var(--vx-radius); overflow: hidden; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.title { color: var(--vx-ink); font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.card:hover .title, .card:focus-visible .title { color: var(--vx-accent); }
.meta { display: flex; gap: 6px; align-items: center; min-width: 0; font-size: 12px; color: var(--vx-muted); }
.date { white-space: nowrap; }
.games { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.games::before { content: '·'; margin-right: 6px; }
</style>
