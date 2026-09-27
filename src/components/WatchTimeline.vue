<script setup lang="ts">
// One bar for the whole VOD (all parts): chapters in their game colour, restricted chapters hatched, parts that
// can't play hatched red, part labels above. Click, drag or use the arrow keys to seek (VOD seconds).
import { clamp, clampX } from '@vexoulz/ui'
import { toClock, type PartStatus, type Span, type Timeline } from '@vexoulz/vods-core'
import { computed, onUnmounted, ref, watch } from 'vue'
import { unplayable } from '@/lib/cuts'
import SnailMarker, { type SnailMode } from './SnailMarker.vue'

const props = defineProps<{
  timeline: Timeline
  /** The stretch of VOD time the bar covers. */
  range: Span
  time: number
  status: readonly PartStatus[]
  partIndex: number
  /** Label for part i (P1, or a game name on the games page). */
  partLabel?: (i: number) => string
  /** Colours per game (gamePalette of the VOD), shared with the posters. */
  palette: Map<string, string>
  /** The snail on the playhead crawls while this is on, and sleeps otherwise. */
  playing?: boolean
  /** Playback speed, which the snail crawls at. */
  rate?: number
}>()
const emit = defineEmits<{ seek: [t: number] }>()

const len = computed(() => Math.max(1, props.range.end - props.range.start))
const pct = (t: number) => `${(clamp(t - props.range.start, 0, len.value) / len.value) * 100}%`
const width = (a: number, b: number) => `${(Math.max(0, Math.min(b, props.range.end) - Math.max(a, props.range.start)) / len.value) * 100}%`

const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > props.range.start && c.start < props.range.end))
const spans = computed(() => props.timeline.partSpans())
const label = (i: number) => props.partLabel?.(i) ?? `P${i + 1}`

const track = ref<HTMLElement | null>(null)
const hover = ref<{ x: number; t: number } | null>(null)
const dragging = ref(false)

// The snail floats while the time is being moved, and a moment after (so a click or a key shows it too).
const floating = ref(false)
let settle: ReturnType<typeof setTimeout> | undefined
function float() {
  floating.value = true
  clearTimeout(settle)
  settle = setTimeout(() => (floating.value = false), 500)
}
function seekTo(t: number) {
  float()
  emit('seek', t)
}
onUnmounted(() => clearTimeout(settle))

// A jump in the reported time that playing can't explain is a seek made somewhere else (YouTube's own progress bar,
// the part picker): the snail floats for those too.
let last = { t: props.time, at: performance.now() }
watch(
  () => props.time,
  (t) => {
    const now = performance.now()
    const played = props.playing ? ((now - last.at) / 1000) * (props.rate ?? 1) : 0
    if (Math.abs(t - last.t - played) > 2) float()
    last = { t, at: now }
  },
)

function timeAt(clientX: number): number {
  const r = track.value!.getBoundingClientRect()
  const f = clamp((clientX - r.left) / r.width, 0, 1)
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
  seekTo(props.timeline.watchable(timeAt(e.clientX)))
}
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 60 : 10
  const map: Record<string, number> = { ArrowLeft: -step, ArrowRight: step, PageDown: -300, PageUp: 300 }
  if (e.key in map) {
    e.preventDefault()
    e.stopPropagation()
    seekTo(props.timeline.watchable(clamp(props.time + map[e.key]!, props.range.start, props.range.end)))
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    seekTo(props.timeline.watchable(e.key === 'Home' ? props.range.start : props.range.end - 1))
  }
}
// The time tip is centred on the pointer; near the ends of the bar it slides sideways to stay over the timeline
// (not off screen, and not over the chat beside it).
const root = ref<HTMLElement | null>(null)
const tip = ref<HTMLElement | null>(null)
const tipShift = ref(0)
watch(
  hover,
  () => {
    const box = tip.value?.getBoundingClientRect()
    const area = root.value?.getBoundingClientRect()
    tipShift.value =
      box && area ? clampX(box.left - tipShift.value - area.left, box.right - tipShift.value - area.left, area.width, 4) : 0
  },
  { flush: 'post' },
)
const hoverChapter = computed(() => (hover.value ? props.timeline.chapterAt(hover.value.t) : null))
const hoverCut = computed(() => (hover.value ? props.timeline.cutAt(hover.value.t) : null))
const shown = computed(() => (dragging.value && hover.value ? hover.value.t : props.time))
const snailMode = computed<SnailMode>(() => (dragging.value || floating.value ? 'float' : props.playing ? 'walk' : 'sleep'))
/** The colour of the game at the playhead, for the snail's shell (none in a "stream down" gap). */
const shownColor = computed(() => {
  const c = props.timeline.chapterAt(shown.value)
  return c && c.kind !== 'gap' ? props.palette.get(c.name) : undefined
})
</script>

<template>
  <div ref="root" class="timeline">
    <div class="labels" aria-hidden="true">
      <button
        v-for="(s, i) in spans"
        :key="i"
        type="button"
        tabindex="-1"
        class="plabel vx-mono"
        :class="{ cur: i === partIndex, bad: unplayable(status[i]) }"
        :style="{ left: pct(s.start) }"
        :title="`${label(i)} · ${toClock(s.start)}–${toClock(s.end)}${unplayable(status[i]) ? ' · unavailable' : ''}`"
        @click="seekTo(s.start)"
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
        :class="{ cut: c.restricted, gap: c.kind === 'gap' }"
        :style="{ left: pct(c.start), width: width(c.start, c.end), '--c': palette.get(c.name) }"
      ></span>
      <template v-for="(s, i) in spans" :key="'u' + i">
        <span v-if="unplayable(status[i])" class="unseg" :style="{ left: pct(s.start), width: width(s.start, s.end) }"></span>
      </template>
      <span v-for="(s, i) in spans.slice(1)" :key="'t' + i" class="tick" :style="{ left: pct(s.start) }"></span>
      <span class="rest" :style="{ left: pct(shown) }"></span>
      <span class="played" :style="{ width: pct(shown) }"></span>
      <SnailMarker class="head" :mode="snailMode" :rate="rate" :shell="shownColor" :style="{ left: pct(shown) }" />
      <span
        v-if="hover"
        ref="tip"
        class="tip vx-mono"
        :style="{ left: `${hover.x}px`, translate: tipShift ? `${tipShift}px 0` : undefined }"
      >
        {{ toClock(hover.t) }}<template v-if="hoverChapter?.kind === 'gap'"> · stream down</template><template v-else-if="hoverCut"> · cut from YouTube</template><template v-else-if="hoverChapter"> · {{ hoverChapter.name }}</template>
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
.seg { position: absolute; top: 0; bottom: 0; border-right: 2px solid rgb(0 0 0 / 0.85); background: var(--c); }
.seg.cut { background: repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.18) 0 3px, transparent 3px 6px); }
/* A merge's gap: the stream was down, so nothing to hatch; a dotted line through the middle marks the join. */
.seg.gap { background: radial-gradient(circle, rgb(255 255 255 / 0.35) 1px, transparent 1.5px) 0 50% / 5px 100% repeat-x; }
.unseg { position: absolute; top: 0; bottom: 0; pointer-events: none; background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--vx-bad) 55%, transparent) 0 2px, rgb(0 0 0 / 0.65) 2px 6px); }
.tick { position: absolute; top: -9px; bottom: -2px; width: 1px; background: var(--vx-muted); pointer-events: none; }
/* Progress never paints over the chapter colours: what's still ahead is dimmed, and a thin accent line runs under
   what's been played. */
.rest { position: absolute; right: 0; top: 0; bottom: 0; background: rgb(0 0 0 / 0.55); pointer-events: none; }
.played { position: absolute; left: 0; bottom: -4px; height: 2px; background: var(--vx-accent); border-radius: 1px; pointer-events: none; }
/* The snail's head sits on the time, its foot on the bar. */
.head { position: absolute; bottom: -2px; width: 24px; height: 24px; margin-left: -22px; pointer-events: none; filter: drop-shadow(0 0 2px rgb(0 0 0 / 0.7)); }
.tip {
  position: absolute; bottom: calc(100% + 22px); transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font-size: 11px; padding: 2px 6px; border-radius: var(--vx-radius-sm); background: var(--vx-pop); border: 1px solid var(--vx-line);
  z-index: 2;
}
</style>
