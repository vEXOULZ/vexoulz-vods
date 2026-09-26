<script setup lang="ts">
// The newest VOD, above the list: a big thumbnail, when it was streamed and for how long, how many parts it was
// uploaded in, and every chapter with its game, start and length (each a link to that point). Resumes where you
// stopped, if you did.
import { gamePalette, learnGameColors, VxButton, VxChapterBar, VxChip, VxLink, VxPlaceholder, VxPosters } from '@vexoulz/ui'
import { toClock, type Progress, type Vod } from '@vexoulz/vods-core'
import { computed, ref, watchEffect } from 'vue'
import { boxArt, gamesWithArt, thumbnailOf } from '@/lib/art'
import { relativeDay } from '@/lib/dates'
import { watchPath } from '@/lib/listQuery'

const props = defineProps<{ vod: Vod; progress?: Progress | null }>()

const palette = computed(() => gamePalette(props.vod.chapters.map((c) => c.name)))
const games = computed(() => gamesWithArt(props.vod.chapters).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(games.value))

const title = computed(() => props.vod.title || 'Untitled stream')
const date = computed(() =>
  props.vod.createdAt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
)
const time = computed(() => props.vod.createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
const parts = computed(() => props.vod.uploads.filter((u) => u.type === 'vod').length || props.vod.uploads.length)
const cut = computed(() => props.vod.chapters.filter((c) => c.restricted).length)
const watched = computed(() => (props.progress && props.vod.duration ? Math.min(1, props.progress.t / props.vod.duration) : 0))

const thumb = computed(() => thumbnailOf(props.vod))
const broken = ref(false)
watchEffect(() => {
  void thumb.value
  broken.value = false
})
</script>

<template>
  <article class="latest vx-panel">
    <VxLink :to="watchPath(vod, progress?.t)" class="thumb" :aria-label="title" tabindex="-1">
      <div class="vx-ring img">
        <img v-if="thumb && !broken" :src="thumb" alt="" decoding="async" @error="broken = true" />
        <VxPlaceholder v-else label="no thumbnail" ratio="16 / 9" />
      </div>
      <span class="dur vx-mono">{{ toClock(vod.duration) }}</span>
      <span v-if="progress" class="watched" :style="{ width: `${watched * 100}%` }"></span>
      <VxChapterBar v-if="vod.chapters.length" class="bar" :chapters="vod.chapters" :palette="palette" />
    </VxLink>

    <div class="info">
      <div class="vx-eyebrow">Latest broadcast · {{ relativeDay(vod.createdAt) }}</div>
      <h2 class="title"><VxLink :to="watchPath(vod, progress?.t)">{{ title }}</VxLink></h2>
      <div class="meta">
        <VxChip k="streamed">{{ date }}, {{ time }}</VxChip>
        <VxChip k="length">{{ toClock(vod.duration) }}</VxChip>
        <VxChip v-if="parts" k="parts">{{ parts }}</VxChip>
        <VxChip v-if="cut" k="cut" title="Chapters cut from the YouTube uploads">{{ cut }}</VxChip>
        <VxChip v-if="vod.drive.length" tone="ok">download</VxChip>
      </div>

      <ol v-if="vod.chapters.length" class="chapters" :aria-label="`Chapters · ${vod.chapters.length}`">
        <li v-for="(c, i) in vod.chapters" :key="i">
          <VxLink v-if="!c.restricted" :to="watchPath(vod, c.start)" class="chapter">
            <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="22" />
            <span class="name">{{ c.name }}</span>
            <span class="vx-mono vx-muted at">{{ toClock(c.start) }}</span>
            <span class="vx-mono vx-muted len">{{ toClock(c.end - c.start) }}</span>
          </VxLink>
          <span v-else class="chapter is-cut" title="Cut from the YouTube uploads">
            <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="22" />
            <span class="name">{{ c.name }}</span>
            <span class="vx-mono vx-muted at">{{ toClock(c.start) }}</span>
            <VxChip>cut</VxChip>
          </span>
        </li>
      </ol>

      <div class="actions">
        <VxLink :to="watchPath(vod, progress?.t)" class="vx-btn is-primary">
          {{ progress ? `▶ Resume at ${toClock(progress.t)}` : '▶ Watch' }}
        </VxLink>
        <VxLink v-if="progress" :to="watchPath(vod, 0)" class="vx-btn">From the start</VxLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.latest { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; padding: 14px; }
@container vx-site (max-width: 760px) {
  .latest { grid-template-columns: minmax(0, 1fr); }
}
.thumb { display: block; position: relative; color: inherit; align-self: start; }
.img { border-radius: var(--vx-radius); overflow: hidden; aspect-ratio: 16 / 9; background: var(--vx-surface); }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dur {
  position: absolute; top: 8px; right: 8px; font-size: 12px; padding: 0 6px; border-radius: var(--vx-radius-sm);
  background: rgb(0 0 0 / 0.75); color: #fff;
}
.watched { position: absolute; left: 0; bottom: 4px; height: 3px; background: var(--vx-accent); z-index: 1; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0 0 var(--vx-radius) var(--vx-radius); overflow: hidden; }
.info { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.title { margin: 0; font-size: 20px; line-height: 1.3; overflow-wrap: anywhere; }
.title a { color: var(--vx-ink); text-decoration: none; }
.title a:hover { color: var(--vx-accent); }
.meta { display: flex; flex-wrap: wrap; gap: 6px; }
.chapters { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 13.5rem; overflow-y: auto; scrollbar-width: thin; }
.chapter {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
  padding: 4px 6px; border-radius: var(--vx-radius-sm); color: var(--vx-ink); text-decoration: none; font-size: 13px;
}
a.chapter:hover { background: var(--vx-surface); }
a.chapter:hover .name { color: var(--vx-accent); }
.chapter.is-cut { opacity: 0.6; }
.name { overflow-wrap: anywhere; line-height: 1.3; }
.at, .len { white-space: nowrap; }
.at, .len { font-size: 12px; }
.len::before { content: '· '; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
</style>
