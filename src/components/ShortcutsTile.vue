<script setup lang="ts">
// Filter shortcuts under the latest VOD: the most played games as a hand of box-art cards (with how many VODs
// each is in) and a few date ranges. Each sets that filter on the list below; the game picker still has every game.
import { learnGameColors, VxButton, VxPlaceholder, VxSkeleton } from '@vexoulz/ui'
import type { GamePlayed } from '@vexoulz/vods-core'
import { computed, watchEffect } from 'vue'
import { boxArt } from '@/lib/art'
import { dateShortcuts, relativeDay, type DateShortcut } from '@/lib/dates'

const props = withDefaults(defineProps<{ games: GamePlayed[] | null; error?: string | null; limit?: number }>(), { limit: 8 })
const emit = defineEmits<{ game: [name: string]; dates: [range: DateShortcut]; retry: [] }>()

const top = computed(() =>
  [...(props.games ?? [])].sort((a, b) => b.vods - a.vods || b.lastPlayed.getTime() - a.lastPlayed.getTime()).slice(0, props.limit),
)
const art = (g: GamePlayed) => boxArt(g.image, 208) ?? undefined
watchEffect(() => learnGameColors(top.value.map((g) => ({ name: g.name, image: art(g) }))))
const ranges = dateShortcuts()
</script>

<template>
  <aside class="strip vx-panel" aria-label="Filter shortcuts">
    <div class="group games-group">
      <div class="vx-eyebrow">Most played</div>
      <div v-if="error" class="vx-muted small">
        Couldn't load the games. <VxButton size="sm" variant="ghost" @click="emit('retry')">Try again</VxButton>
      </div>
      <div v-else-if="!games" class="hand" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" w="104px" h="139px" /></div>
      <ul v-else class="hand" :style="{ '--n': top.length }">
        <li v-for="(g, i) in top" :key="g.name" :style="{ '--i': i }">
          <button type="button" class="card" :title="`${g.name}: ${g.vods} VODs, last played ${relativeDay(g.lastPlayed)}`" @click="emit('game', g.name)">
            <img v-if="art(g)" :src="art(g)" alt="" loading="lazy" decoding="async" />
            <VxPlaceholder v-else :label="g.name" ratio="3 / 4" />
            <span class="count vx-mono">{{ g.vods }} VOD{{ g.vods === 1 ? '' : 's' }}</span>
            <span class="name">{{ g.name }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div class="group">
      <div class="vx-eyebrow">Streamed</div>
      <div class="dates">
        <VxButton v-for="r in ranges" :key="r.label" size="sm" @click="emit('dates', r)">{{ r.label }}</VxButton>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.strip { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; padding: 12px 14px; }
.group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.games-group { flex: 1 1 32rem; container-type: inline-size; }
.dates { display: flex; flex-wrap: wrap; gap: 6px; }
.small { font-size: 12px; }

/* A hand of cards: overlapping, fanned out from the middle, and the one you point at rises to the top. */
.hand {
  /* Cards shrink to fit the row (down to 72px, then the row scrolls). */
  --card: max(72px, min(112px, calc((100cqw - 24px + 16px * (var(--n) - 1)) / var(--n))));
  list-style: none; margin: 0; padding: 16px 12px 26px; display: flex; justify-content: center; min-width: 0;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--vx-line) transparent;
}
.hand > li {
  --off: calc(var(--i) - (var(--n) - 1) / 2);
  flex: none; position: relative; z-index: var(--i);
  transform: translateY(calc(var(--off) * var(--off) * 1.6px)) rotate(calc(var(--off) * 2.5deg));
  transition: transform 160ms ease;
}
.hand > li + li { margin-left: -16px; }
.hand > li:hover, .hand > li:focus-within { z-index: 20; transform: translateY(-8px) rotate(0deg); }
.card {
  position: relative; display: block; width: var(--card, 104px); aspect-ratio: 3 / 4; padding: 0; overflow: hidden;
  border: 1px solid var(--vx-line); border-radius: var(--vx-radius); background: var(--vx-surface);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.45); color: #fff; font: inherit; cursor: pointer; text-align: left;
}
.card img, .card :deep(.vx-ph) { display: block; width: 100%; height: 100%; object-fit: cover; }
.card:hover, .card:focus-visible { border-color: var(--vx-accent); outline: none; }
.count {
  position: absolute; top: 5px; right: 5px; padding: 0 5px; font-size: 10px; border-radius: var(--vx-radius-sm);
  background: rgb(0 0 0 / 0.75); color: var(--vx-accent);
}
.name {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 6px 5px; font-size: 11.5px; font-weight: 600;
  line-height: 1.2; background: linear-gradient(transparent, rgb(0 0 0 / 0.85));
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
@container (max-width: 480px) {
  /* Too narrow to fan: a straight row that scrolls sideways. */
  .hand { justify-content: flex-start; padding: 4px 0 8px; --card: 92px; }
  .hand > li { transform: none; }
  .hand > li + li { margin-left: 8px; }
  .hand > li:hover, .hand > li:focus-within { transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .hand > li { transition: none; }
}
</style>
