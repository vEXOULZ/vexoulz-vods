<script setup lang="ts">
// Filter shortcuts beside the latest VOD: the most played games (in how many VODs, last played when) and a few
// date ranges. Each one sets that filter on the list below; the game picker in the bar still has every game.
import { learnGameColors, VxButton, VxPosters, VxSkeleton } from '@vexoulz/ui'
import type { GamePlayed } from '@vexoulz/vods-core'
import { computed, watchEffect } from 'vue'
import { boxArt } from '@/lib/art'
import { dateShortcuts, relativeDay, type DateShortcut } from '@/lib/dates'

const props = withDefaults(defineProps<{ games: GamePlayed[] | null; error?: string | null; limit?: number }>(), { limit: 8 })
const emit = defineEmits<{ game: [name: string]; dates: [range: DateShortcut]; retry: [] }>()

const top = computed(() =>
  [...(props.games ?? [])].sort((a, b) => b.vods - a.vods || b.lastPlayed.getTime() - a.lastPlayed.getTime()).slice(0, props.limit),
)
const art = (g: GamePlayed) => boxArt(g.image) ?? undefined
watchEffect(() => learnGameColors(top.value.map((g) => ({ name: g.name, image: art(g) }))))
const ranges = dateShortcuts()
</script>

<template>
  <aside class="tile vx-panel" aria-label="Filter shortcuts">
    <div class="vx-eyebrow">Most played</div>
    <div v-if="error" class="vx-muted small">
      Couldn't load the games. <VxButton size="sm" variant="ghost" @click="emit('retry')">Try again</VxButton>
    </div>
    <div v-else-if="!games" class="games" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="34px" /></div>
    <ol v-else class="games">
      <li v-for="(g, i) in top" :key="g.name">
        <button type="button" class="game" :title="`Show the VODs with ${g.name}`" @click="emit('game', g.name)">
          <span class="rank vx-mono vx-muted">{{ i + 1 }}</span>
          <VxPosters :games="[{ name: g.name, image: art(g) }]" mode="row" :size="22" />
          <span class="name">{{ g.name }}</span>
          <span class="count vx-mono" :title="`Last played ${relativeDay(g.lastPlayed)}`">{{ g.vods }} VOD{{ g.vods === 1 ? '' : 's' }}</span>
        </button>
      </li>
    </ol>
    <div class="vx-eyebrow">Streamed</div>
    <div class="dates">
      <VxButton v-for="r in ranges" :key="r.label" size="sm" @click="emit('dates', r)">{{ r.label }}</VxButton>
    </div>
  </aside>
</template>

<style scoped>
.tile { display: flex; flex-direction: column; gap: 10px; padding: 14px; min-width: 0; }
.games { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.game {
  width: 100%; display: grid; grid-template-columns: 1.2em auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
  padding: 5px 6px; border: 0; border-radius: var(--vx-radius-sm); background: none; color: var(--vx-ink);
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.game:hover { background: var(--vx-surface); }
.game:hover .name { color: var(--vx-accent); }
.game:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: -2px; }
.rank { font-size: 11px; text-align: right; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { font-size: 11px; color: var(--vx-muted); white-space: nowrap; }
.dates { display: flex; flex-wrap: wrap; gap: 6px; }
.small { font-size: 12px; }
</style>
