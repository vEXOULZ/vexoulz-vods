<script setup lang="ts">
// Tag filter for the list page: the tags the open tab can be narrowed to (lib/listQuery, tagFilters), each in its
// color. Empty value = any tag.
import { VxButton, VxMenuItem, VxPopover } from '@vexoulz/ui'
import { computed } from 'vue'
import { tagFilters, type Tab } from '@/lib/listQuery'
import { DATE_TAGS, tagConfig, tagStyle } from '@/lib/vodTags'

const props = defineProps<{ tab: Tab }>()
const model = defineModel<string>({ required: true })

const tags = computed(() =>
  [...new Set([...DATE_TAGS, ...Object.keys(tagConfig.value)])]
    .filter((name) => tagFilters(props.tab, name))
    .map((name) => ({ name, ...tagStyle(name) })),
)
const current = computed(() => (model.value ? tagStyle(model.value) : null))

function pick(name: string, close: () => void) {
  model.value = name
  close()
}
</script>

<template>
  <VxPopover width="min(260px, calc(100vw - 24px))" :cap="400">
    <template #trigger="{ toggle, open }">
      <VxButton class="trigger" :pressed="open || !!model" :label="current ? `Tag: ${current.label}` : 'Tag: any'" @click="toggle">
        <span v-if="current" class="dot" :style="{ background: current.color }"></span>
        <span class="label">{{ current?.label ?? 'Any tag' }}</span>
        <span aria-hidden="true">▾</span>
      </VxButton>
    </template>
    <template #default="{ close }">
      <VxMenuItem :current="!model" @click="pick('', close)">Any tag</VxMenuItem>
      <VxMenuItem v-for="t in tags" :key="t.name" :current="t.name === model" @click="pick(t.name, close)">
        <template #lead><span class="dot" :style="{ background: t.color }"></span></template>
        {{ t.label }}
      </VxMenuItem>
    </template>
  </VxPopover>
</template>

<style scoped>
.trigger { max-width: 220px; }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--vx-surface-2); border: 1px solid var(--vx-line); }
</style>
