<script setup lang="ts">
import { VxAccountMenu, VxButton, VxEmptyState, VxSiteShell } from '@vexoulz/ui'
import { NAV } from '@/lib/nav'
</script>

<template>
  <VxSiteShell site="vods" :nav="NAV">
    <template #account><VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." /></template>
    <VxEmptyState code="404" title="Nothing here" text="That page doesn't exist. The VOD you're after is probably in the list.">
      <template #actions>
        <VxButton to="/vods" variant="primary">Browse VODs</VxButton>
        <VxButton href="https://vexoulz.net">vexoulz.net</VxButton>
      </template>
    </VxEmptyState>
  </VxSiteShell>
</template>
