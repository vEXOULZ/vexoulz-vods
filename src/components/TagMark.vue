<script setup lang="ts">
// One drawn tag (ThumbTags; the preview on /manage/tags): its SVG in its own colors, with the currentColor (or black)
// parts in the tag's color (lib/tagShape), or until it has one, a placeholder of the same size in that color (README,
// "Assets still needed"). Its text, if it has any, sits on top; the label stays for screen readers.
import { VxPlaceholder } from '@vexoulz/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { shapeText, svgDataUrl, tintSvg } from '@/lib/tagShape'
import type { TagStyle } from '@/vods.config'

const props = defineProps<{ tag: TagStyle }>()
const w = computed(() => props.tag.width ?? 62)
const h = computed(() => props.tag.height ?? 22)

const root = ref<HTMLElement>()
const svg = ref<string | null>(null)
/** The tag's color as the page resolves it (var() and the theme don't reach inside an <img>). */
const resolved = ref('')
const resolve = () => {
  if (root.value) resolved.value = getComputedStyle(root.value).color
}

watch(
  () => props.tag.shape,
  async (url) => {
    svg.value = null
    if (!url) return
    const text = await shapeText(url)
    if (props.tag.shape === url) svg.value = text
  },
  { immediate: true },
)
watch(() => props.tag.color, () => requestAnimationFrame(resolve))

// The theme can change the tag's color (a var(--vx-…)), by the OS setting or the site's own switch.
let dark: MediaQueryList | undefined
let themeAttr: MutationObserver | undefined
onMounted(() => {
  resolve()
  dark = matchMedia('(prefers-color-scheme: dark)')
  dark.addEventListener('change', resolve)
  themeAttr = new MutationObserver(resolve)
  themeAttr.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
})
onBeforeUnmount(() => {
  dark?.removeEventListener('change', resolve)
  themeAttr?.disconnect()
})

const src = computed(() => {
  const tinted = svg.value && resolved.value ? tintSvg(svg.value, resolved.value) : null
  return tinted ? svgDataUrl(tinted) : null
})
const textStyle = computed(() => ({
  fontSize: `${props.tag.textSize ?? Math.round(h.value / 2)}px`,
  color: props.tag.textColor,
  transform: `translate(${props.tag.textX ?? 0}px, ${props.tag.textY ?? 0}px)`,
}))
</script>

<template>
  <span ref="root" class="tag-mark" :class="{ 'has-text': tag.text }" :style="{ '--tag-color': tag.color }">
    <img v-if="tag.shape && src" class="shape" :src="src" alt="" :width="w" :height="h" />
    <span v-else-if="tag.shape && svg !== null" class="shape" aria-hidden="true" :style="{ width: `${w}px`, height: `${h}px` }"></span>
    <span v-else class="ph" aria-hidden="true"><VxPlaceholder :label="tag.label" :w="w" :h="h" /></span>
    <span v-if="tag.text" class="text" aria-hidden="true" :style="textStyle">{{ tag.text }}</span>
    <span class="sr">{{ tag.label }}</span>
  </span>
</template>

<style scoped>
.tag-mark {
  position: relative; display: inline-flex; color: var(--tag-color, var(--vx-surface-2));
  transform: rotate(-4deg); transform-origin: 0 50%; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5));
}
.shape { display: block; object-fit: contain; }
/* The placeholder takes the tag's color, so the config shows before the image exists. */
.ph { display: flex; border-radius: var(--vx-radius-sm); background: var(--tag-color, var(--vx-surface-2)); }
.ph :deep(.vx-ph) { font-size: 10px; color: var(--vx-bg); border-color: color-mix(in srgb, var(--vx-bg) 45%, transparent); }
/* Its text takes the placeholder's place. */
.has-text .ph :deep(.vx-ph) { color: transparent; }
.text {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--vx-bg); font-weight: 700; line-height: 1; white-space: nowrap; pointer-events: none;
}
.sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}
</style>
