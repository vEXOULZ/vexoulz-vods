<script setup lang="ts">
// Past broadcasts: search, game chips and a date range (all combinable and kept in the URL), a grid of cards,
// and "load more". On phones the search field moves under a square button; nothing else changes.
import {
  VxAccountMenu,
  VxButton,
  VxCallout,
  VxChip,
  VxDateRange,
  VxEmptyState,
  VxInput,
  VxPopover,
  VxSiteShell,
  VxSkeleton,
} from '@vexoulz/ui'
import { isResumable, type Progress, type Vod } from '@vexoulz/vods-core'
import { useVodsContext } from '@vexoulz/vods-core/vue'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VodCard from '@/components/VodCard.vue'
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
const searchOpen = ref(!!state.value.title)
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

// ---- game chips: the most-played games of the last 100 VODs ----
const topGames = ref<string[]>([])
client
  .listVods({ perPage: 100 })
  .then(({ vods }) => {
    const counts = new Map<string, number>()
    for (const v of vods) for (const g of new Set(v.chapters.map((c) => c.name))) counts.set(g, (counts.get(g) ?? 0) + 1)
    topGames.value = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g)
  })
  .catch(() => undefined)
const gameChips = computed(() => {
  const g = state.value.game
  return g && !topGames.value.includes(g) ? [g, ...topGames.value] : topGames.value
})

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

const countText = computed(() => `${(shownFrom.value + vods.value.length).toLocaleString()} of ${total.value.toLocaleString()}`)
</script>

<template>
  <VxSiteShell site="vods" :nav="NAV">
    <template #actions>
      <VxInput v-model="titleDraft" class="search wide-only" type="search" placeholder="Search vods…" clearable />
      <VxButton class="narrow-only" icon label="Search" :pressed="searchOpen" @click="searchOpen = !searchOpen">⌕</VxButton>
    </template>
    <template #account><VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." /></template>

    <VxInput v-if="searchOpen" v-model="titleDraft" class="search-row narrow-only" type="search" placeholder="Search vods…" clearable />

    <div class="bar">
      <h1 class="vx-display">Past broadcasts</h1>
      <div class="filters">
        <VxChip clickable :active="!state.game" @click="go({ game: '' })">All</VxChip>
        <VxChip v-for="g in gameChips" :key="g" clickable :active="state.game === g" @click="go({ game: state.game === g ? '' : g })">
          {{ g }}
        </VxChip>
        <VxPopover width="min(320px, calc(100vw - 32px))" role="dialog">
          <template #trigger="{ toggle, open }">
            <VxButton size="sm" :pressed="open || !!(state.from || state.to)" @click="toggle">📅 {{ dateLabel }}</VxButton>
          </template>
          <div class="date-pop">
            <div class="vx-eyebrow">Streamed between</div>
            <VxDateRange v-model:from="dateFrom" v-model:to="dateTo" :min="minDay" />
          </div>
        </VxPopover>
        <VxButton v-if="hasFilters(state)" size="sm" variant="ghost" @click="router.replace({ query: {} })">Clear filters</VxButton>
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
        <VxButton @click="router.replace({ query: {} })">Clear filters</VxButton>
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
.search { width: 220px; }
.search-row { width: 100%; margin-bottom: 16px; }
.narrow-only { display: none; }
@container vx-site (max-width: 700px) {
  .wide-only { display: none; }
  .narrow-only { display: inline-flex; }
  .search-row.narrow-only { display: flex; }
}
.bar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.bar h1 { font-size: 28px; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.date-pop { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 24px 18px; }
.sk { display: flex; flex-direction: column; gap: 8px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 28px; }
.small { font-size: 11px; }
</style>
