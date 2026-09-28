<script setup lang="ts">
// One emote in chat: the emote, the zero-width emotes stacked over it, and the BTTV / FFZ modifiers applied to each.
// Anything from a provider the viewer turned off shows as the text that was typed instead. Clicking the stack (or
// Enter / Space on it) asks for the menu linking each emote in it to its provider's page.
import type { EmoteLayer, EmoteProvider, EmoteToken, Modifier } from '@vexoulz/vods-core'
import { computed } from 'vue'

const props = defineProps<{ token: EmoteToken; enabled: Record<'7tv' | 'bttv' | 'ffz', boolean>; open?: boolean }>()
const emit = defineEmits<{ menu: [anchor: HTMLElement] }>()

const on = (p: EmoteProvider) => p === 'twitch' || props.enabled[p]
const codes = (mods: Modifier[]) => mods.map((m) => m.code)
/** A layer as typed (only its modifiers that are shown, for `shown`): BTTV modifiers go before the emote, FFZ ones after. */
const typed = (l: EmoteLayer, shown = false) => {
  const mods = shown ? l.modifiers.filter((m) => on(m.provider)) : l.modifiers
  return [...codes(mods.filter((m) => m.provider === 'bttv')), l.emote.code, ...codes(mods.filter((m) => m.provider === 'ffz'))]
}

const TRANSFORMS: Partial<Record<Modifier['effect'], string>> = {
  flipX: 'scaleX(-1)',
  flipY: 'scaleY(-1)',
  rotateLeft: 'rotate(-90deg)',
  rotateRight: 'rotate(90deg)',
}

interface Layer {
  layer: EmoteLayer
  effects: Set<Modifier['effect']>
  transform: string | undefined
}
const draw = (layer: EmoteLayer): Layer => {
  const active = layer.modifiers.filter((m) => on(m.provider))
  const transform = active.map((m) => TRANSFORMS[m.effect]).filter(Boolean).join(' ')
  return { layer, effects: new Set(active.map((m) => m.effect)), transform: transform || undefined }
}

const view = computed(() => {
  const t = props.token
  const off = (mods: Modifier[], provider: 'bttv' | 'ffz') => codes(mods.filter((m) => m.provider === provider && !on(m.provider)))
  const baseOn = on(t.emote.provider)
  // With the emote's provider off, the emote is text and the overlays still shown stack on their own.
  const layers = [...(baseOn ? [t] : []), ...t.overlays.filter((o) => on(o.emote.provider))]
  const before = baseOn ? off(t.modifiers, 'bttv') : typed(t)
  const after = [
    ...(baseOn ? off(t.modifiers, 'ffz') : []),
    // An overlay whose provider is off is just a word after the emote; so are the modifiers on shown overlays that are off.
    ...t.overlays.flatMap((o) => (on(o.emote.provider) ? [...off(o.modifiers, 'bttv'), ...off(o.modifiers, 'ffz')] : typed(o))),
  ]
  const tip = (l: EmoteLayer, i: number) =>
    `${l.emote.code} · ${l.emote.provider}${i ? ' (zero-width)' : ''}` +
    l.modifiers.filter((m) => on(m.provider)).map((m) => `\n  ${m.code} · ${m.effect}`).join('')
  const gap = (words: string[], side: 'before' | 'after') =>
    !words.length ? '' : side === 'before' ? `${words.join(' ')}${layers.length || after.length ? ' ' : ''}` : ` ${words.join(' ')}`
  return {
    alt: layers.flatMap((l) => typed(l, true)).join(' '),
    layers: layers.map(draw),
    before: gap(before, 'before'),
    after: layers.length ? gap(after, 'after') : after.join(' '),
    title: layers.map(tip).join('\n'),
  }
})
</script>

<template>
  <template v-if="view.before">{{ view.before }}</template>
  <template v-if="view.layers.length">
    <span
      class="stack"
      role="button"
      tabindex="0"
      aria-haspopup="menu"
      :aria-expanded="open"
      :title="open ? undefined : view.title"
      @click="emit('menu', $event.currentTarget as HTMLElement)"
      @keydown.enter.space.prevent="emit('menu', $event.currentTarget as HTMLElement)"
    >
      <span
        v-for="(l, i) in view.layers"
        :key="i"
        class="layer"
        :class="{ over: i > 0, party: l.effects.has('party'), shake: l.effects.has('shake') }"
      >
        <!-- Wide: two invisible copies set the width, the image is stretched over them. -->
        <template v-if="l.effects.has('wide')">
          <img class="ghost" :src="l.layer.image.src" :srcset="l.layer.image.srcset" alt="" aria-hidden="true" />
          <img class="ghost" :src="l.layer.image.src" :srcset="l.layer.image.srcset" alt="" aria-hidden="true" />
        </template>
        <img
          class="img"
          :class="{ fill: l.effects.has('wide'), cursed: l.effects.has('cursed') }"
          :style="{ transform: l.transform }"
          :src="l.layer.image.src"
          :srcset="l.layer.image.srcset"
          :alt="i === 0 ? view.alt : ''"
          loading="lazy"
        />
      </span>
    </span>
  </template>
  <template v-if="view.after">{{ view.after }}</template>
</template>

<style scoped>
/* Every layer sits in the same grid cell, centred: the stack is as big as its biggest layer. */
.stack { display: inline-grid; vertical-align: middle; margin: -6px 0; cursor: pointer; border-radius: 3px; }
.stack[aria-expanded='true'] { outline: 1px solid var(--vx-accent); outline-offset: 1px; }
.layer { grid-area: 1 / 1; place-self: center; position: relative; display: inline-flex; }
.over { pointer-events: none; }
.img { height: 28px; width: auto; display: block; }
.ghost { height: 28px; width: auto; visibility: hidden; }
.img.fill { position: absolute; inset: 0; width: 100%; height: 100%; }
.cursed { filter: grayscale(1) brightness(0.7) contrast(2.5); }
.party { animation: party 1.2s linear infinite; }
.shake { animation: shake 0.25s steps(2) infinite; }
@keyframes party { to { filter: hue-rotate(360deg); } }
@keyframes shake {
  0% { translate: 1px -1px; }
  50% { translate: -1px 1px; }
}
@media (prefers-reduced-motion: reduce) {
  .party, .shake { animation: none; }
}
</style>
