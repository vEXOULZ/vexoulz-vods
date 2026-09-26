<script setup lang="ts">
// Past broadcasts: one filter bar (All resets, title search, game dropdown with every game in the archive, date
// range; all combinable and kept in the URL), a grid of cards, and "load more". On phones the bar wraps.
// Unfiltered, the newest VOD also gets its own panel on top, with shortcuts to the most played games and recent dates.
import {
  VxAccountMenu,
  VxButton,
  VxCallout,
  VxDateRange,
  VxEmptyState,
  VxInput,
  VxPopover,
  VxSiteShell,
  VxSkeleton,
} from '@vexoulz/ui'
import { isResumable, type GamePlayed, type Progress, type Vod } from '@vexoulz/vods-core'
import { useVodsContext } from '@vexoulz/vods-core/vue'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GamePicker from '@/components/GamePicker.vue'
import LatestVod from '@/components/LatestVod.vue'
import ShortcutsTile from '@/components/ShortcutsTile.vue'
import VodCard from '@/components/VodCard.vue'
import { loadGamesPlayed } from '@/lib/gamesPlayed'
import { hasFilters, parseListQuery, toApiFilter, toListQuery, type ListState } from '@/lib/listQuery'
import { NAV } from '@/lib/nav'
import { site, vodsConfig } from '@/vods.config'

const { client, progress } = useVodsContext()
const route = useRoute()
const router = useRouter()
const state = computed(() => parseListQuery(route.query))

function go(patch: Partial<ListState>, push = false) {
  const query = toListQuery({ ...state.value, page: 1, ...patch })
  return push ? router.push({ query }) : router.replace({ query })
}

// ---- list: pages [first .. last] of the current filters ----
const vods = shallowRef<Vod[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
let lastPage = 0
let filterKey = ''
let ctrl: AbortController | undefined

async function load(s: ListState) {
  const key = JSON.stringify({ ...s, page: 0 })
  const append = key === filterKey && s.page === lastPage + 1 && vods.value.length > 0
  ctrl?.abort()
  const mine = (ctrl = new AbortController())
  loading.value = true
  error.value = null
  if (!append) vods.value = []
  try {
    const res = await client.listVods({ ...toApiFilter(s), page: s.page, perPage: site.perPage }, mine.signal)
    if (mine.signal.aborted) return
    vods.value = append ? [...vods.value, ...res.vods] : res.vods
    total.value = res.total
    lastPage = s.page
    filterKey = key
  } catch (e) {
    if (!mine.signal.aborted) error.value = (e as Error).message || 'Something went wrong'
  } finally {
    if (!mine.signal.aborted) loading.value = false
  }
}
watch(state, load, { immediate: true, deep: true })
onUnmounted(() => ctrl?.abort())

const shownFrom = computed(() => (lastPage - Math.ceil(vods.value.length / site.perPage)) * site.perPage)
const hasMore = computed(() => shownFrom.value + vods.value.length < total.value)
const loadMore = () => go({ page: lastPage + 1 })

// ---- search (debounced into the URL) ----
const titleDraft = ref(state.value.title)
watch(
  () => state.value.title,
  (t) => {
    if (t !== titleDraft.value.trim()) titleDraft.value = t
  },
)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(titleDraft, (t) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (t.trim() !== state.value.title) go({ title: t.trim() })
  }, 350)
})

// ---- games: every game in the archive ----
const games = shallowRef<GamePlayed[] | null>(null)
const gamesError = ref<string | null>(null)
function fetchGames(retry = false) {
  gamesError.value = null
  loadGamesPlayed(client, retry)
    .then((g) => (games.value = g))
    .catch((e: Error) => (gamesError.value = e.message || 'Something went wrong'))
}
fetchGames()
const game = computed({
  get: () => state.value.game,
  set: (g: string) => go({ game: g }),
})

function resetAll() {
  clearTimeout(searchTimer)
  titleDraft.value = ''
  router.replace({ query: {} })
}

// ---- dates ----
const dateFrom = ref(state.value.from)
const dateTo = ref(state.value.to)
watch(state, (s) => {
  dateFrom.value = s.from
  dateTo.value = s.to
})
watch([dateFrom, dateTo], ([from, to]) => {
  if (from !== state.value.from || to !== state.value.to) go({ from, to })
})
const minDay = vodsConfig.startDate.toISOString().slice(0, 10)
const dateLabel = computed(() => {
  const { from, to } = state.value
  if (!from && !to) return 'Any date'
  return `${from || '…'} → ${to || 'now'}`
})

// ---- resume positions ----
const resumeAt = shallowRef(new Map<string, Progress>())
progress
  .list(500)
  .then((all) => (resumeAt.value = new Map(all.filter((p) => isResumable(p)).map((p) => [p.vodId, p]))))
  .catch(() => undefined)

// ---- the latest VOD, highlighted on top when nothing is filtered (it stays in the grid too) ----
const latest = computed(() => (!hasFilters(state.value) && shownFrom.value === 0 && vods.value.length ? vods.value[0]! : null))

const countText = computed(() => `${(shownFrom.value + vods.value.length).toLocaleString()} of ${total.value.toLocaleString()}`)
</script>

<template>
  <VxSiteShell site="vods" :nav="NAV">
    <template #account><VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." /></template>

    <section v-if="latest" class="top">
      <LatestVod :vod="latest" :progress="resumeAt.get(latest.id)" />
      <ShortcutsTile
        :games="games"
        :error="gamesError"
        @game="(g) => go({ game: g }, true)"
        @dates="(r) => go({ from: r.from, to: r.to }, true)"
        @retry="fetchGames(true)"
      />
    </section>

    <div class="bar">
      <h1 class="vx-display">Past broadcasts</h1>
      <div class="filters">
        <VxButton :pressed="!hasFilters(state)" label="Show all VODs (clear every filter)" @click="resetAll">All</VxButton>
        <VxInput v-model="titleDraft" class="search" type="search" placeholder="Search titles…" clearable>
          <template #icon>⌕</template>
        </VxInput>
        <GamePicker v-model="game" :games="games" :error="gamesError" @retry="fetchGames(true)" />
        <VxPopover width="min(320px, calc(100vw - 32px))" role="dialog">
          <template #trigger="{ toggle, open }">
            <VxButton :pressed="open || !!(state.from || state.to)" @click="toggle">📅 {{ dateLabel }} ▾</VxButton>
          </template>
          <div class="date-pop">
            <div class="vx-eyebrow">Streamed between</div>
            <VxDateRange v-model:from="dateFrom" v-model:to="dateTo" :min="minDay" />
          </div>
        </VxPopover>
      </div>
    </div>

    <VxCallout v-if="error" tone="error" title="Couldn't load the VODs">
      {{ error }}
      <template #actions><VxButton size="sm" @click="load(state)">Try again</VxButton></template>
    </VxCallout>

    <div v-else-if="loading && !vods.length" class="grid" aria-busy="true">
      <div v-for="i in 8" :key="i" class="sk">
        <VxSkeleton ratio="16 / 9" h="auto" />
        <VxSkeleton w="80%" />
        <VxSkeleton w="45%" h="0.8em" />
      </div>
    </div>

    <VxEmptyState v-else-if="!vods.length" title="No VODs match" :text="hasFilters(state) ? 'Try another search or date range.' : 'Nothing archived yet.'">
      <template v-if="hasFilters(state)" #actions>
        <VxButton @click="resetAll">Clear filters</VxButton>
      </template>
    </VxEmptyState>

    <template v-else>
      <div class="grid">
        <VodCard v-for="v in vods" :key="v.id" :vod="v" :progress="resumeAt.get(v.id)" />
      </div>
      <div class="more">
        <VxButton v-if="hasMore" :loading="loading" @click="loadMore">Load {{ site.perPage }} more</VxButton>
        <span class="vx-muted vx-mono small">{{ countText }}</span>
      </div>
    </template>
  </VxSiteShell>
</template>

<style scoped>
.bar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.bar h1 { font-size: 28px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.search { flex: 1 1 220px; max-width: 360px; }
.search :deep(input) { width: 100%; }
@container vx-site (max-width: 700px) {
  /* Search gets its own full-width line; All, game and dates share the next. */
  .search { order: -1; flex-basis: 100%; max-width: none; }
}
.date-pop { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.top { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 24px 18px; }
.sk { display: flex; flex-direction: column; gap: 8px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 28px; }
.small { font-size: 11px; }
</style>
