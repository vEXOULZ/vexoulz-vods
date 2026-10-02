<script setup lang="ts">
// "See all VODs" / "See all playthroughs" on the top tiles: a button in its own colour, so it stands out from the
// green Watch and the plain controls around it: a solid fill in the info colour.
import { VxButton } from '@vexoulz/ui'

// Hidden for now: flip to bring both buttons back (the tiles and the page still wire them up).
const shown = false
</script>

<template>
  <VxButton v-if="shown" class="see-all"><slot /> →</VxButton>
</template>

<style scoped>
.see-all {
  color: var(--vx-bg); font-weight: 600; background: var(--vx-info); border-color: var(--vx-info);
  backdrop-filter: none; -webkit-backdrop-filter: none;
}
.see-all:hover { color: var(--vx-bg); background: var(--vx-info); border-color: var(--vx-info); filter: brightness(1.1); }
</style>
