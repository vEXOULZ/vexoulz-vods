<script setup lang="ts">
// Chat replay beside (or under) the player. Follows the newest line unless you scroll up; then a button takes you
// back down. Settings (delay, timestamps, badges, name colours, emote sources, size) are the viewer's own.
import { twitchColor, VxButton, VxChip, VxPopover, VxSegmented, VxSlider, VxStepper, VxSwitch } from '@vexoulz/ui'
import { toClock, type ChatMessage, type Token } from '@vexoulz/vods-core'
import { nextTick, ref, watch } from 'vue'
import { DELAY_LIMIT, WIDTH_MAX, WIDTH_MIN, type ChatSettings } from '@/composables/useChatSettings'

const props = defineProps<{ messages: ChatMessage[]; settings: ChatSettings; error?: string | null; playing: boolean }>()
const emit = defineEmits<{ hide: [] }>()

const lines = ref<HTMLElement | null>(null)
const following = ref(true)

function atBottom(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight - el.scrollTop < 48
}
function onScroll() {
  if (lines.value) following.value = atBottom(lines.value)
}
function toBottom() {
  following.value = true
  if (lines.value) lines.value.scrollTop = lines.value.scrollHeight
}
watch(
  () => props.messages,
  async () => {
    if (!following.value) return
    await nextTick()
    if (lines.value) lines.value.scrollTop = lines.value.scrollHeight
  },
)

const showEmote = (t: Token) => t.kind === 'emote' && (t.emote.provider === 'twitch' || props.settings.emotes[t.emote.provider])
const fmtDelay = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}s`
const colorOpts = [
  { value: 'readable' as const, label: 'readable' },
  { value: 'raw' as const, label: 'exact' },
]
const sizeOpts = [
  { value: 's' as const, label: 'S' },
  { value: 'm' as const, label: 'M' },
  { value: 'l' as const, label: 'L' },
]
</script>

<template>
  <aside class="chat" :class="`size-${settings.size}`" aria-label="Chat replay">
    <div class="head">
      <VxButton size="sm" variant="ghost" icon label="Hide chat" @click="emit('hide')">⇥</VxButton>
      <span class="vx-eyebrow">Chat replay</span>
      <span class="spacer"></span>
      <VxChip v-if="settings.delay" clickable tone="accent" class="vx-mono" title="Chat delay: click to reset" @click="settings.delay = 0">
        {{ fmtDelay(settings.delay) }}
      </VxChip>
      <VxPopover align="right" width="min(300px, calc(100vw - 24px))" role="dialog">
        <template #trigger="{ toggle, open }">
          <VxButton size="sm" variant="ghost" icon label="Chat settings" :pressed="open" @click="toggle">⚙</VxButton>
        </template>
        <div class="settings">
          <div class="vx-eyebrow">Chat settings</div>
          <div class="set col">
            <span>Chat delay <span class="vx-muted small">shift-click for ±1s</span></span>
            <span class="row">
              <VxStepper v-model="settings.delay" :step="0.1" :min="-DELAY_LIMIT" :max="DELAY_LIMIT" size="sm" unit="s" label="Chat delay in seconds" />
              <VxButton size="sm" variant="ghost" :disabled="!settings.delay" @click="settings.delay = 0">reset</VxButton>
            </span>
          </div>
          <div class="set"><label for="chat-ts">Timestamps</label><VxSwitch id="chat-ts" v-model="settings.timestamps" /></div>
          <div class="set"><label for="chat-badges">Badges</label><VxSwitch id="chat-badges" v-model="settings.badges" /></div>
          <div class="set col">
            <span>Name colours <span class="vx-muted small">as chosen by each chatter</span></span>
            <VxSegmented v-model="settings.colors" :options="colorOpts" label="Name colours" />
          </div>
          <div class="set">
            <span>Emotes</span>
            <span class="row">
              <VxChip v-for="(on, k) in settings.emotes" :key="k" clickable :active="on" @click="settings.emotes[k] = !on">{{ k }}</VxChip>
            </span>
          </div>
          <div class="set"><span>Text size</span><VxSegmented v-model="settings.size" :options="sizeOpts" label="Text size" /></div>
          <div class="set col">
            <span>Chat width <span class="vx-muted small">share of the page beside the video; on phones chat sits below</span></span>
            <span class="row wide">
              <VxSlider v-model="settings.width" :min="WIDTH_MIN" :max="WIDTH_MAX" label="Chat width in percent of the page" class="grow" />
              <span class="vx-mono small pct">{{ settings.width }}%</span>
              <VxButton size="sm" variant="ghost" :disabled="settings.width === 26" @click="settings.width = 26">reset</VxButton>
            </span>
          </div>
        </div>
      </VxPopover>
    </div>

    <div ref="lines" class="lines" aria-live="off" @scroll.passive="onScroll">
      <p v-if="error" class="note vx-muted">Chat couldn't load: {{ error }}</p>
      <p v-else-if="!messages.length" class="note vx-muted">{{ playing ? 'No chat here yet.' : 'Chat plays along with the video.' }}</p>
      <div v-for="m in messages" :key="m.id" class="line">
        <span v-if="settings.timestamps" class="ts vx-mono">{{ toClock(m.at) }}</span>
        <span v-if="settings.badges && m.badges.length" class="badges">
          <img v-for="b in m.badges" :key="b.setId" :src="b.src" :srcset="b.srcset" :alt="b.title" :title="b.title" width="18" height="18" loading="lazy" />
        </span>
        <span class="who" :style="{ color: twitchColor(m.user, m.color, settings.colors) }">{{ m.user }}</span>
        <template v-for="(t, j) in m.tokens" :key="j">
          <img
            v-if="t.kind === 'emote' && showEmote(t)"
            class="emote"
            :src="t.image.src"
            :srcset="t.image.srcset"
            :alt="t.emote.code"
            :title="`${t.emote.code} · ${t.emote.provider}`"
            loading="lazy"
          />
          <span v-else-if="t.kind === 'emote'">{{ t.emote.code }}</span>
          <span v-else>{{ t.text }}</span>
        </template>
      </div>
    </div>
    <VxButton v-if="!following" class="jump" size="sm" variant="primary" @click="toBottom">↓ Latest messages</VxButton>
  </aside>
</template>

<style scoped>
.chat { position: relative; display: flex; flex-direction: column; min-height: 0; background: #0b0b0d; }
.head { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 6px; border-bottom: 1px solid var(--vx-line); flex: none; }
.spacer { flex: 1; }
.settings { display: flex; flex-direction: column; padding: 8px; gap: 2px; }
.set { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.set.col { flex-direction: column; align-items: flex-start; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.row.wide { width: 100%; flex-wrap: nowrap; }
.grow { flex: 1; min-width: 0; }
.pct { width: 3.5ch; text-align: right; }
.small { font-size: 11px; }
.lines {
  flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 3px;
  font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; scrollbar-width: thin; scrollbar-color: var(--vx-line) transparent;
}
.size-s .lines { font-size: 12px; }
.size-l .lines { font-size: 15px; }
.note { margin: auto; text-align: center; font-size: 13px; }
.ts { color: var(--vx-muted); font-size: 10px; margin-right: 6px; opacity: 0.7; }
.badges { display: inline-flex; gap: 2px; vertical-align: -3px; margin-right: 4px; }
.badges img { width: 18px; height: 18px; }
.who { font-weight: 700; }
.who::after { content: ':'; color: var(--vx-muted); margin-right: 5px; }
.emote { height: 28px; width: auto; vertical-align: middle; margin: -6px 0; }
.jump { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); }
</style>
