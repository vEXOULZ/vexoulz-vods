<script setup lang="ts">
// The tags hanging off a VOD's thumbnail (new, updated, complete; see lib/vodTags): each a luggage tag tied to the
// thumbnail's left edge. The images are placeholders until the real ones exist (README, "Assets still needed").
// The parent places it; clicks go through to the thumbnail's link underneath.
import { VxPlaceholder } from '@vexoulz/ui'
import type { Vod } from '@vexoulz/vods-core'
import { computed } from 'vue'
import { THUMB_TAG_TITLES, thumbTags } from '@/lib/vodTags'

const props = defineProps<{ vod: Vod }>()
const tags = computed(() => thumbTags(props.vod))
</script>

<template>
  <ul v-if="tags.length" class="thumb-tags">
    <li v-for="t in tags" :key="t" :class="`is-${t}`">
      <span class="body" aria-hidden="true"><VxPlaceholder :label="t" :w="54" :h="16" /></span>
      <span class="sr">{{ THUMB_TAG_TITLES[t] }}</span>
    </li>
  </ul>
</template>

<style scoped>
.thumb-tags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
/* The string: from the thumbnail's edge to the tag's hole. */
li {
  position: relative; display: flex; align-items: center; padding-left: 7px;
  transform: rotate(-4deg); transform-origin: 0 50%; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5));
}
li::before {
  content: ''; position: absolute; left: 0; top: 50%; width: 15px; height: 1.5px; margin-top: -0.75px;
  background: var(--vx-ink); opacity: 0.8; border-radius: 1px;
}
/* The tag: pointed at the string's end, with a punched hole. */
.body {
  display: flex; align-items: center; padding: 3px 5px 3px 14px; background: var(--vx-surface-2);
  clip-path: polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%);
  -webkit-mask: radial-gradient(circle at 8px 50%, transparent 2.5px, #000 3px);
  mask: radial-gradient(circle at 8px 50%, transparent 2.5px, #000 3px);
}
.is-new .body { background: var(--vx-accent); }
.is-updated .body { background: var(--vx-info); }
.is-complete .body { background: var(--vx-ok); }
.body :deep(.vx-ph) { border-radius: 2px; font-size: 9px; }
.sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}
</style>
