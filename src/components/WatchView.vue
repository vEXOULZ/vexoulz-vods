<script setup lang="ts">
// The watch page body, shared by /vods/:id (and /live, /youtube) and /games/:id: YouTube player, the timeline across
// all parts, a controls row (chapters, part picker, copy link, download, theater, shortcuts) and the chat replay.
// On phones the same controls reflow under the video and chat goes below; nothing is dropped.
import {
  gamePalette,
  learnGameColors,
  useToast,
  VxAccountMenu,
  VxButton,
  VxChip,
  VxKbd,
  VxMenuItem,
  VxPopover,
  VxPosters,
  VxSiteShell,
} from '@vexoulz/ui'
import {
  mountYouTube,
  toClock,
  WatchPlayer,
  type DriveFile,
  type PartStatus,
  type Position,
  type Span,
  type Timeline,
  type Vod,
} from '@vexoulz/vods-core'
import { useChat, useProgress } from '@vexoulz/vods-core/vue'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch, watchEffect } from 'vue'
import ChatPanel from '@/components/ChatPanel.vue'
import WatchTimeline from '@/components/WatchTimeline.vue'
import { useChatSettings } from '@/composables/useChatSettings'
import { useFullscreen } from '@/composables/useFullscreen'
import { useShortcuts, type Shortcut } from '@/composables/useShortcuts'
import { cutNote } from '@/lib/cuts'
import { boxArt, gamesWithArt } from '@/lib/art'
import { NAV } from '@/lib/nav'

const props = withDefaults(
  defineProps<{
    vod: Vod
    timeline: Timeline
    start: Position
    /** VOD time the timeline bar covers; defaults to the whole VOD. */
    range?: Span
    /** Label for part i in the picker and on the bar. */
    partLabel?: (i: number) => string
    /** Link to this page at VOD time t (for "copy link"). */
    shareUrl: (t: number) => string
    download?: DriveFile | null
    /** Save the watch position in this browser. */
    track?: boolean
  }>(),
  { download: null, track: true },
)

const toast = useToast()
const chat = useChatSettings()

const range = computed<Span>(() => props.range ?? { start: 0, end: props.vod.duration })
const spans = computed(() => props.timeline.partSpans())
const label = (i: number) => props.partLabel?.(i) ?? `Part ${props.timeline.uploads[i]?.part ?? i + 1}`

// ---- player ----
const ytEl = ref<HTMLElement | null>(null)
const time = ref(props.timeline.toVod(props.start))
const playing = ref(false)
const partIndex = ref(props.start.index)
const status = shallowRef<PartStatus[]>([])
const playerError = ref<string | null>(null)
let wp: WatchPlayer | null = null

onMounted(() => {
  const p = (wp = new WatchPlayer(props.timeline, { skipBroken: false }))
  status.value = [...p.status]
  p.on('time', (t) => (time.value = t))
  p.on('playing', (v) => (playing.value = v))
  p.on('part', (i) => (partIndex.value = i))
  p.on('partError', () => (status.value = [...p.status]))
  p.on('ended', () => (playing.value = false))
  mountYouTube(ytEl.value!, p, { start: props.start, autoplay: true }).catch((e: Error) => {
    if (wp === p) playerError.value = e.message || 'The YouTube player could not load.'
  })
})
onUnmounted(() => {
  wp?.destroy()
  wp = null
})

function seek(t: number) {
  const to = props.timeline.watchable(Math.min(Math.max(t, range.value.start), range.value.end))
  time.value = to
  wp?.seek(to)
}
function playPart(i: number) {
  if (wp) wp.playPart(i)
  else time.value = spans.value[i]?.start ?? time.value
}
function togglePlay() {
  if (!wp) return
  if (wp.isPlaying()) wp.pause()
  else wp.play()
}

// ---- parts ----
const bad = (s: PartStatus | undefined) => s === 'missing' || s === 'blocked' || s === 'error'
const statusText: Record<PartStatus, string> = {
  ok: '',
  processing: 'processing',
  missing: 'not on YouTube',
  blocked: "can't embed",
  error: "won't play",
}
const curBad = computed(() => bad(status.value[partIndex.value]))
const playable = (i: number) => !bad(status.value[i])
const prevOk = computed(() => {
  for (let i = partIndex.value - 1; i >= 0; i--) if (playable(i)) return i
  return -1
})
const nextOk = computed(() => {
  for (let i = partIndex.value + 1; i < spans.value.length; i++) if (playable(i)) return i
  return -1
})
const partOffset = computed(() => props.timeline.locate(time.value).offset)

// ---- chapters ----
const chapters = computed(() => props.timeline.chapters.filter((c) => c.end > range.value.start && c.start < range.value.end))
const chapter = computed(() => props.timeline.chapterAt(time.value))
const chapterIdx = computed(() => (chapter.value ? chapters.value.indexOf(chapter.value) : -1))
const palette = computed(() => gamePalette(props.timeline.chapters.map((c) => c.name)))
const posterGames = computed(() => gamesWithArt(chapters.value).map((g) => ({ ...g, color: palette.value.get(g.name) })))
watchEffect(() => learnGameColors(posterGames.value))
function stepChapter(dir: 1 | -1) {
  const open = chapters.value.filter((c) => !c.restricted)
  const t = time.value
  const target = dir > 0 ? open.find((c) => c.start > t + 1) : [...open].reverse().find((c) => c.start < t - 3)
  if (target) seek(Math.max(target.start, range.value.start))
  else if (dir < 0) seek(range.value.start)
}

// ---- actions ----
const theater = ref(false)
/** In theater mode the controls tuck away; a faint strip under the video brings them back. */
const controlsOpen = ref(true)
watch(theater, (on) => (controlsOpen.value = !on))
const showControls = computed(() => !theater.value || controlsOpen.value)
const fullscreen = useFullscreen()
async function toggleFullscreen() {
  if (!(await fullscreen.toggle())) toast.show("The browser didn't allow fullscreen", { kind: 'error' })
}
const fullscreenLabel = computed(() =>
  !fullscreen.supported ? "Fullscreen isn't available in this browser" : fullscreen.active.value ? 'Exit fullscreen' : 'Fullscreen',
)
async function copyLink() {
  const url = props.shareUrl(time.value)
  try {
    await navigator.clipboard.writeText(url)
    toast.show(`Link copied at ${toClock(time.value)}`)
  } catch {
    toast.show("Couldn't copy the link", { kind: 'error' })
  }
}
const downloadUrl = computed(() => (props.download ? `https://drive.google.com/open?id=${encodeURIComponent(props.download.id)}` : null))

// ---- chat + progress ----
const replay = useChat({ vodId: () => props.vod.id, time, playing, offset: toRef(chat, 'delay') })
const chatError = computed(() => replay.error.value?.message ?? null)
if (props.track) useProgress({ vodId: () => props.vod.id, duration: () => props.vod.duration, time, playing })

// ---- keyboard ----
const shortcuts = computed<Shortcut[]>(() => [
  { keys: [' ', 'k'], display: 'space / k', label: 'Play / pause', run: togglePlay },
  { keys: ['j', 'ArrowLeft'], display: 'j / ←', label: 'Back 10s', run: () => seek(time.value - 10) },
  { keys: ['l', 'ArrowRight'], display: 'l / →', label: 'Forward 10s', run: () => seek(time.value + 10) },
  { keys: [','], display: ',', label: 'Previous chapter', run: () => stepChapter(-1) },
  { keys: ['.'], display: '.', label: 'Next chapter', run: () => stepChapter(1) },
  { keys: ['['], display: '[', label: 'Previous part', run: () => partIndex.value > 0 && playPart(partIndex.value - 1) },
  { keys: [']'], display: ']', label: 'Next part', run: () => partIndex.value < spans.value.length - 1 && playPart(partIndex.value + 1) },
  { keys: ['c'], display: 'c', label: 'Show / hide chat', run: () => (chat.open = !chat.open) },
  { keys: ['t'], display: 't', label: 'Theater mode', run: () => (theater.value = !theater.value) },
  { keys: ['h'], display: 'h', label: 'Show / hide controls (theater)', run: () => theater.value && (controlsOpen.value = !controlsOpen.value) },
  { keys: ['f'], display: 'f', label: 'Fullscreen', run: () => fullscreen.supported && toggleFullscreen() },
  { keys: ['y'], display: 'y', label: 'Copy link at this time', run: copyLink },
])
useShortcuts(() => shortcuts.value)
</script>

<template>
  <VxSiteShell site="vods" :nav="NAV" fill sky="dim">
    <template v-if="theater" #header><span class="no-header" hidden></span></template>
    <template #account><VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." /></template>

    <div class="watch" :class="{ nochat: !chat.open }" :style="{ '--chat-w': `${chat.width}%` }">
      <section class="stage">
        <div class="video">
          <div class="video-box">
            <div class="yt"><div ref="ytEl"></div></div>
            <div v-if="playerError" class="unavail">
              <div class="vx-panel un-card">
                <b>The YouTube player didn't load</b>
                <p class="vx-muted">{{ playerError }} Check that youtube.com isn't blocked, then reload the page.</p>
              </div>
            </div>
            <div v-else-if="curBad" class="unavail">
              <div class="vx-panel un-card" role="status">
                <div class="vx-eyebrow">{{ label(partIndex) }} of {{ spans.length }}</div>
                <b>This part isn't playable on YouTube <span class="vx-muted">({{ statusText[status[partIndex]!] }})</span></b>
                <p class="vx-muted">
                  {{ toClock(spans[partIndex]!.start) }} – {{ toClock(spans[partIndex]!.end) }} of the VOD. The timeline keeps its place.
                </p>
                <div class="un-actions">
                  <VxButton v-if="prevOk >= 0" @click="seek(spans[prevOk]!.end - 30)">← {{ label(prevOk) }}</VxButton>
                  <VxButton v-if="nextOk >= 0" variant="primary" @click="playPart(nextOk)">Skip to {{ label(nextOk) }} →</VxButton>
                </div>
              </div>
            </div>
          </div>
          <VxButton v-if="!chat.open" class="chat-reopen" icon label="Show chat" @click="chat.open = true">⇤</VxButton>
        </div>

        <button
          v-if="theater"
          type="button"
          class="peek"
          :class="{ open: controlsOpen }"
          :aria-label="controlsOpen ? 'Hide controls' : 'Show controls'"
          :title="controlsOpen ? 'Hide controls (h)' : 'Show controls (h)'"
          :aria-expanded="controlsOpen"
          @click="controlsOpen = !controlsOpen"
        >
          <span aria-hidden="true">{{ controlsOpen ? '▾' : '▴' }}</span>
        </button>
        <div v-show="showControls" class="controls">
          <WatchTimeline
            :timeline="timeline"
            :range="range"
            :time="time"
            :status="status"
            :part-index="partIndex"
            :part-label="partLabel"
            :palette="palette"
            @seek="seek"
          />
          <div class="row">
            <span class="time vx-mono">{{ toClock(time) }} <span class="vx-muted">/ {{ toClock(range.end) }}</span></span>

            <div class="now">
              <VxPopover prefer="up" width="min(340px, calc(100vw - 24px))" :cap="380">
                <template #trigger="{ toggle, open }">
                  <button type="button" class="poster-btn" :class="{ open }" title="Chapters" aria-label="Chapters" @click="toggle">
                    <VxPosters :games="posterGames" :size="26" />
                  </button>
                </template>
                <template #default="{ close }">
                  <div class="vx-eyebrow menu-head">Chapters · {{ chapters.length }}</div>
                  <VxMenuItem
                    v-for="(c, i) in chapters"
                    :key="i"
                    :current="i === chapterIdx"
                    :disabled="c.restricted"
                    :sub="toClock(c.start)"
                    @click="seek(Math.max(c.start, range.start)); close()"
                  >
                    <template #lead>
                      <VxPosters :games="[{ name: c.name, image: boxArt(c.image) ?? undefined, color: palette.get(c.name) }]" mode="row" :size="24" />
                    </template>
                    {{ c.name }}
                    <template v-if="cutNote(c)" #trail><VxChip :title="cutNote(c)!.title">{{ cutNote(c)!.label }}</VxChip></template>
                  </VxMenuItem>
                </template>
              </VxPopover>
              <div class="now-text">
                <div class="title" :title="vod.title">{{ vod.title }}</div>
                <div class="sub vx-mono vx-muted">
                  <template v-if="chapter">ch {{ chapterIdx + 1 }}/{{ chapters.length }} · {{ chapter.name }} · </template>{{ toClock(partOffset) }} into {{ label(partIndex).toLowerCase() }}
                </div>
              </div>
            </div>

            <slot name="parts" :part-index="partIndex">
              <VxPopover prefer="up" align="right" width="min(320px, calc(100vw - 24px))" :cap="360">
                <template #trigger="{ toggle, open }">
                  <VxButton class="vx-mono partbtn" :pressed="open" label="YouTube part" @click="toggle">
                    <span class="hide-sm">Part&nbsp;</span>{{ partIndex + 1 }}<span class="vx-muted">/{{ spans.length }}</span> ▾
                  </VxButton>
                </template>
                <template #default="{ close }">
                  <div class="vx-eyebrow menu-head">YouTube parts · {{ spans.length }}</div>
                  <VxMenuItem
                    v-for="(s, i) in spans"
                    :key="i"
                    :current="i === partIndex"
                    :sub="`${toClock(s.start)}–${toClock(s.end)}`"
                    @click="playPart(i); close()"
                  >
                    <span class="vx-mono">{{ label(i) }}</span>
                    <template #trail>
                      <VxChip v-if="bad(status[i])" tone="bad">{{ statusText[status[i]!] }}</VxChip>
                      <VxChip v-else-if="status[i] === 'processing'" tone="warn">processing</VxChip>
                    </template>
                  </VxMenuItem>
                </template>
              </VxPopover>
            </slot>

            <VxButton icon label="Copy link at this time" @click="copyLink">⧉</VxButton>
            <VxButton v-if="downloadUrl" icon label="Download VOD" :href="downloadUrl" external>⤓</VxButton>
            <VxButton icon :label="theater ? 'Leave theater mode' : 'Theater mode'" :pressed="theater" @click="theater = !theater">
              {{ theater ? '⤡' : '⤢' }}
            </VxButton>
            <VxButton
              icon
              :label="fullscreenLabel"
              :pressed="fullscreen.active.value"
              :disabled="!fullscreen.supported"
              @click="toggleFullscreen"
            >
              ⛶
            </VxButton>
            <VxPopover prefer="up" align="right" width="min(260px, calc(100vw - 24px))" role="dialog">
              <template #trigger="{ toggle, open }">
                <VxButton icon label="Keyboard shortcuts" :pressed="open" @click="toggle">?</VxButton>
              </template>
              <div class="vx-eyebrow menu-head">Shortcuts</div>
              <div v-for="s in shortcuts" :key="s.label" class="kv">
                <VxKbd>{{ s.display }}</VxKbd><span class="vx-muted">{{ s.label }}</span>
              </div>
            </VxPopover>
          </div>
        </div>
      </section>

      <ChatPanel v-if="chat.open" :messages="replay.messages.value" :settings="chat" :error="chatError" :playing="playing" @hide="chat.open = false" />
    </div>
  </VxSiteShell>
</template>

<style scoped>
/* Chat width is the viewer's share of the page (chat settings), but never under 240px or so wide the video
   gets narrower than 320px. */
.watch { display: grid; grid-template-columns: minmax(0, 1fr) clamp(240px, var(--chat-w, 26%), max(240px, calc(100% - 320px))); flex: 1; min-height: 0; }
.watch.nochat { grid-template-columns: minmax(0, 1fr); }

.stage { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.video { position: relative; flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; background: #000; }
.video-box { position: relative; width: min(100cqw, 100cqh * 16 / 9); aspect-ratio: 16 / 9; }
.yt, .yt :deep(iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.chat-reopen { position: absolute; right: 8px; top: 8px; }

.unavail { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; background: rgb(0 0 0 / 0.75); }
.un-card { max-width: 400px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.un-card p { font-size: 13px; line-height: 1.5; margin: 0; }
.un-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }

.controls { border-top: 1px solid var(--vx-line); background: rgb(0 0 0 / 0.7); }
.peek {
  display: grid; place-items: center; width: 100%; height: 14px; padding: 0; border: none; flex: none;
  background: #000; color: var(--vx-muted); font-size: 10px; line-height: 1; cursor: pointer; opacity: 0.35;
  transition: opacity 0.15s, color 0.15s;
}
.peek:hover, .peek:focus-visible { opacity: 1; color: var(--vx-ink); }
.peek:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: -2px; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px; min-width: 0; }
.time { font-size: 12px; white-space: nowrap; }
.now { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; margin-left: 4px; }
.poster-btn { background: none; border: none; padding: 0 4px; cursor: pointer; display: flex; height: 32px; align-items: center; color: inherit; border-radius: var(--vx-radius-sm); }
.poster-btn:focus-visible { outline: 2px solid var(--vx-accent); }
.now-text { min-width: 0; line-height: 1.3; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.partbtn { min-width: 92px; }
.menu-head { padding: 6px 8px; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 8px; font-size: 12px; }

.watch > :deep(.chat) { border-left: 1px solid var(--vx-line); }

@container vx-site (max-width: 700px) {
  .watch, .watch.nochat { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(320px, 1fr); overflow-y: auto; overflow-x: hidden; }
  .stage { display: contents; }
  .video { flex: none; container-type: inline-size; }
  .video-box { width: 100%; }
  .video:has(.unavail) .video-box { aspect-ratio: auto; min-height: 56.25cqw; }
  .unavail { position: relative; }
  .video:has(.unavail) .yt { visibility: hidden; }
  /* Same controls as desktop, reflowed: title on its own line, everything else wraps below it */
  .row { flex-wrap: wrap; gap: 6px; }
  .time { margin-right: auto; }
  .now { order: -1; flex-basis: 100%; margin-left: 0; }
  .partbtn { min-width: 0; }
  .hide-sm { display: none; }
  .watch > :deep(.chat) { border-left: none; border-top: 1px solid var(--vx-line); }
}
</style>
