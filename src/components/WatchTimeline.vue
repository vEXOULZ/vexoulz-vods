<script setup lang="ts">
// One bar for the whole VOD (all parts): chapters in their game colour, restricted chapters hatched, parts that
// can't play hatched red, part labels above. Click, drag or use the arrow keys to seek (VOD seconds).
import { gameColor } from '@vexoulz/ui'
import { toClock, type PartStatus, type Span, type Timeline } from '@vexoulz/vods-core'
import { computed, ref } from 'vue'

const props = defineProps<{
  timeline: Timeline
  /** The stretch of VOD time the bar covers. */
  range: Span
  time: number
  status: readonly PartStatus[]
  partIndex: number
  /** Label for part i (P1, or a game name on the games page). */
  partLabel?: (i: number) => string
}>()
const emit = defineEmits<{ seek: [t: number] }>()

const len = computed(() => Math.max(1, props.range.end - props.range.start))
const pct = (t: number) => `${(Math.min(Math.max(t - props.range.start, 0), len.value) / len.value) * 100}%`
const width = (a: number, b: number) => `${(Math.max(0, Math.min(b, props.range.end) - Math.max(a, props.range.start)) / len.value) * 100}%`

const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > props.range.start && c.start < props.range.end))
const spans = computed(() => props.timeline.partSpans())
const label = (i: number) => props.partLabel?.(i) ?? `P${i + 1}`
const bad = (s: PartStatus | undefined) => s === 'missing' || s === 'blocked' || s === 'error'

const track = ref<HTMLElement | null>(null)
const hover = ref<{ x: number; t: number } | null>(null)
const dragging = ref(false)

function timeAt(clientX: number): number {
  const r = track.value!.getBoundingClientRect()
  const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
  return props.range.start + f * len.value
}
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  onMove(e)
}
function onMove(e: PointerEvent) {
  const t = timeAt(e.clientX)
  const r = track.value!.getBoundingClientRect()
  hover.value = { x: e.clientX - r.left, t }
}
function onUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  emit('seek', props.timeline.watchable(timeAt(e.clientX)))
}
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 60 : 10
  const map: Record<string, number> = { ArrowLeft: -step, ArrowRight: step, PageDown: -300, PageUp: 300 }
  if (e.key in map) {
    e.preventDefault()
    e.stopPropagation()
    emit('seek', props.timeline.watchable(Math.min(Math.max(props.time + map[e.key]!, props.range.start), props.range.end)))
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    emit('seek', props.timeline.watchable(e.key === 'Home' ? props.range.start : props.range.end - 1))
  }
}
const hoverChapter = computed(() => (hover.value ? props.timeline.chapterAt(hover.value.t) : null))
const hoverCut = computed(() => (hover.value ? props.timeline.cutAt(hover.value.t) : null))
const shown = computed(() => (dragging.value && hover.value ? hover.value.t : props.time))
</script>

<template>
  <div class="timeline">
    <div class="labels" aria-hidden="true">
      <button
        v-for="(s, i) in spans"
        :key="i"
        type="button"
        tabindex="-1"
        class="plabel vx-mono"
        :class="{ cur: i === partIndex, bad: bad(status[i]) }"
        :style="{ left: pct(s.start) }"
        :title="`${label(i)} · ${toClock(s.start)}–${toClock(s.end)}${bad(status[i]) ? ' · unavailable' : ''}`"
        @click="emit('seek', s.start)"
      >{{ label(i) }}</button>
    </div>
    <div
      ref="track"
      class="track"
      role="slider"
      tabindex="0"
      aria-label="Seek"
      :aria-valuemin="Math.floor(range.start)"
      :aria-valuemax="Math.floor(range.end)"
      :aria-valuenow="Math.floor(time)"
      :aria-valuetext="toClock(time)"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="!dragging && (hover = null)"
      @keydown="onKey"
    >
      <span
        v-for="(c, i) in chapters"
        :key="i"
        class="seg"
        :class="{ cut: c.restricted }"
        :style="{ left: pct(c.start), width: width(c.start, c.end), '--c': gameColor(c.name) }"
      ></span>
      <template v-for="(s, i) in spans" :key="'u' + i">
        <span v-if="bad(status[i])" class="unseg" :style="{ left: pct(s.start), width: width(s.start, s.end) }"></span>
      </template>
      <span v-for="(s, i) in spans.slice(1)" :key="'t' + i" class="tick" :style="{ left: pct(s.start) }"></span>
      <span class="played" :style="{ width: pct(shown) }"></span>
      <span class="head" :style="{ left: pct(shown) }"></span>
      <span v-if="hover" class="tip vx-mono" :style="{ left: `${hover.x}px` }">
        {{ toClock(hover.t) }}<template v-if="hoverCut"> · cut from YouTube</template><template v-else-if="hoverChapter"> · {{ hoverChapter.name }}</template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.timeline { padding: 2px 12px 0; }
.labels { position: relative; height: 16px; }
.plabel {
  position: absolute; top: 1px; transform: translateX(2px); font-size: 10px; line-height: 1; padding: 1px 3px;
  background: none; border: none; color: var(--vx-muted); cursor: pointer; border-radius: 3px; white-space: nowrap;
  max-width: 12ch; overflow: hidden; text-overflow: ellipsis;
}
.plabel.cur { color: var(--vx-accent); }
.plabel.bad { text-decoration: line-through; opacity: 0.6; }
.plabel:hover { color: var(--vx-ink); }
.track { position: relative; height: 8px; cursor: pointer; margin: 2px 0 4px; touch-action: none; border-radius: 2px; outline-offset: 4px; }
.track:hover, .track:focus-visible { height: 10px; margin-top: 1px; margin-bottom: 3px; }
.seg { position: absolute; top: 0; bottom: 0; border-right: 2px solid rgb(0 0 0 / 0.85); background: color-mix(in srgb, var(--c) 45%, transparent); }
.seg.cut { background: repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.18) 0 3px, transparent 3px 6px); }
.unseg { position: absolute; top: 0; bottom: 0; pointer-events: none; background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--vx-bad) 55%, transparent) 0 2px, rgb(0 0 0 / 0.65) 2px 6px); }
.tick { position: absolute; top: -9px; bottom: -2px; width: 1px; background: var(--vx-muted); pointer-events: none; }
.played { position: absolute; left: 0; top: 0; bottom: 0; background: var(--vx-accent); opacity: 0.75; pointer-events: none; mix-blend-mode: screen; }
.head { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--vx-accent); box-shadow: 0 0 0 3px rgb(0 0 0 / 0.6); pointer-events: none; }
.tip {
  position: absolute; bottom: calc(100% + 22px); transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font-size: 11px; padding: 2px 6px; border-radius: var(--vx-radius-sm); background: var(--vx-pop); border: 1px solid var(--vx-line);
  z-index: 2;
}
</style>
