<script setup lang="ts">
// The drawn tags hanging off a VOD's thumbnail (lib/vodTags: which tags are drawn, their color and shape). The parent
// places it; clicks go through to the thumbnail's link underneath.
import type { Vod } from '@vexoulz/vods-core'
import { computed } from 'vue'
import TagMark from './TagMark.vue'
import { splitTags, tagStyle } from '@/lib/vodTags'

const props = defineProps<{ vod: Vod }>()
const tags = computed(() => splitTags(props.vod).drawn.map((name) => ({ name, style: tagStyle(name) })))
</script>

<template>
  <ul v-if="tags.length" class="thumb-tags">
    <li v-for="t in tags" :key="t.name"><TagMark :tag="t.style" /></li>
  </ul>
</template>

<style scoped>
.thumb-tags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
li { display: flex; }
</style>
