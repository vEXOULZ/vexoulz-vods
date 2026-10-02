<script setup lang="ts">
// The drawn tags hanging off a VOD's thumbnail (lib/vodTags; which ones, their color and shape are in `site.tags`).
// A shape is a vector image painted in the tag's color; until it exists, a placeholder of the same size (README,
// "Assets still needed"). The parent places it; clicks go through to the thumbnail's link underneath.
import { VxPlaceholder } from '@vexoulz/ui'
import type { Vod } from '@vexoulz/vods-core'
import { computed } from 'vue'
import { splitTags, tagStyle } from '@/lib/vodTags'

const props = defineProps<{ vod: Vod }>()
const tags = computed(() =>
  splitTags(props.vod).drawn.map((name) => {
    const s = tagStyle(name)
    return { name, ...s, w: s.width ?? 62, h: s.height ?? 22 }
  }),
)
</script>

<template>
  <ul v-if="tags.length" class="thumb-tags">
    <li v-for="t in tags" :key="t.name" :style="{ '--tag-color': t.color }">
      <span
        v-if="t.shape"
        class="shape"
        aria-hidden="true"
        :style="{ width: `${t.w}px`, height: `${t.h}px`, '--tag-shape': `url(${JSON.stringify(t.shape)})` }"
      ></span>
      <span v-else class="ph" aria-hidden="true"><VxPlaceholder :label="t.label" :w="t.w" :h="t.h" /></span>
      <span class="sr">{{ t.label }}</span>
    </li>
  </ul>
</template>

<style scoped>
.thumb-tags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
li { display: flex; transform: rotate(-4deg); transform-origin: 0 50%; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5)); }
.shape {
  display: block; background: var(--tag-color, var(--vx-surface-2));
  mask-image: var(--tag-shape); -webkit-mask-image: var(--tag-shape);
  mask-size: contain; mask-repeat: no-repeat; mask-position: center;
  -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center;
}
/* The placeholder takes the tag's color, so the config shows before the image exists. */
.ph { display: flex; border-radius: var(--vx-radius-sm); background: var(--tag-color, var(--vx-surface-2)); }
.ph :deep(.vx-ph) { font-size: 10px; color: var(--vx-bg); border-color: color-mix(in srgb, var(--vx-bg) 45%, transparent); }
.sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}
</style>
