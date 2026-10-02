<script setup lang="ts">
// The newest playthroughs above the list, as a row of cards that scrolls sideways, with a button that opens the
// Playthroughs tab (left out when that tab is already open). Hidden while there are none or they couldn't load.
import { VxButton, VxSkeleton } from '@vexoulz/ui'
import type { Progress, Vod } from '@vexoulz/vods-core'
import VodCard from './VodCard.vue'

defineProps<{ vods: Vod[]; loading: boolean; resume: (v: Vod) => Progress | null | undefined; more: boolean }>()
const emit = defineEmits<{ more: [] }>()
</script>

<template>
  <section v-if="loading || vods.length" class="strip vx-panel" aria-label="Latest playthroughs">
    <div class="head">
      <div class="vx-eyebrow">Latest playthroughs</div>
      <VxButton v-if="more" size="sm" @click="emit('more')">See all playthroughs →</VxButton>
    </div>
    <ul class="row" :aria-busy="loading && !vods.length">
      <template v-if="!vods.length">
        <li v-for="i in 3" :key="i" class="sk">
          <VxSkeleton ratio="16 / 9" h="auto" />
          <VxSkeleton w="80%" />
        </li>
      </template>
      <li v-for="v in vods" v-else :key="v.id"><VodCard :vod="v" :progress="resume(v)" /></li>
    </ul>
  </section>
</template>

<style scoped>
.strip { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.row {
  list-style: none; margin: 0; padding: 0 0 6px; display: flex; gap: 18px;
  overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: var(--vx-line) transparent;
}
.row > li { flex: 0 0 min(300px, 78%); min-width: 0; scroll-snap-align: start; }
.sk { display: flex; flex-direction: column; gap: 8px; }
</style>
