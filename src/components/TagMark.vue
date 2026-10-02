<script setup lang="ts">
// One drawn tag (ThumbTags; the preview on /manage/tags): its vector shape painted in its color, or until it has one,
// a placeholder of the same size in that color (README, "Assets still needed").
import { VxPlaceholder } from '@vexoulz/ui'
import { computed } from 'vue'
import type { TagStyle } from '@/vods.config'

const props = defineProps<{ tag: TagStyle }>()
const w = computed(() => props.tag.width ?? 62)
const h = computed(() => props.tag.height ?? 22)
</script>

<template>
  <span class="tag-mark" :style="{ '--tag-color': tag.color }">
    <span
      v-if="tag.shape"
      class="shape"
      aria-hidden="true"
      :style="{ width: `${w}px`, height: `${h}px`, '--tag-shape': `url(${JSON.stringify(tag.shape)})` }"
    ></span>
    <span v-else class="ph" aria-hidden="true"><VxPlaceholder :label="tag.label" :w="w" :h="h" /></span>
    <span class="sr">{{ tag.label }}</span>
  </span>
</template>

<style scoped>
.tag-mark { display: inline-flex; transform: rotate(-4deg); transform-origin: 0 50%; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5)); }
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
