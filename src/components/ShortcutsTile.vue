<script setup lang="ts">
// Filter shortcuts under the latest VOD, as one short strip: the most played games side by side (with how many
// VODs each is in) and a few date ranges. Each sets that filter on the list below; the game picker still has every game.
import { learnGameColors, VxButton, VxChip, VxPosters, VxSkeleton } from '@vexoulz/ui'
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
  <aside class="strip vx-panel" aria-label="Filter shortcuts">
    <div class="group games-group">
      <div class="vx-eyebrow">Most played</div>
      <div v-if="error" class="vx-muted small">
        Couldn't load the games. <VxButton size="sm" variant="ghost" @click="emit('retry')">Try again</VxButton>
      </div>
      <div v-else-if="!games" class="games" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" w="9rem" h="32px" /></div>
      <ul v-else class="games">
        <li v-for="g in top" :key="g.name">
          <button type="button" class="game" :title="`${g.name}: ${g.vods} VODs, last played ${relativeDay(g.lastPlayed)}`" @click="emit('game', g.name)">
            <VxPosters :games="[{ name: g.name, image: art(g) }]" mode="row" :size="20" />
            <span class="name">{{ g.name }}</span>
            <VxChip class="count">{{ g.vods }}</VxChip>
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
.strip { display: flex; flex-wrap: wrap; gap: 10px 24px; padding: 10px 14px; align-items: flex-start; }
.group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.games-group { flex: 1 1 30rem; }
.games { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.game {
  display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 6px 0 4px; max-width: 16rem;
  border: 1px solid var(--vx-line); border-radius: var(--vx-radius-sm); background: var(--vx-surface);
  color: var(--vx-ink); font: inherit; font-size: 13px; cursor: pointer;
}
.game:hover { border-color: color-mix(in srgb, var(--vx-accent) 55%, transparent); }
.game:hover .name { color: var(--vx-accent); }
.game:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.count { flex: none; }
.dates { display: flex; flex-wrap: wrap; gap: 6px; }
.small { font-size: 12px; }
</style>
