<script setup lang="ts">
// Frame for every public page: the site shell with the public nav and the account menu (sign-in comes later).
// Slots pass through to VxSiteShell.
import { VxAccountMenu, VxSiteShell } from '@vexoulz/ui'
import { NAV } from '@/lib/nav'

defineProps<{ fill?: boolean; sky?: 'full' | 'dim' | 'off' }>()
</script>

<template>
  <VxSiteShell site="vods" :nav="NAV" :fill="fill" :sky="sky">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}"></slot></template>
    <template v-if="!$slots.account" #account>
      <VxAccountMenu disabled note="Sign-in comes later; progress is saved in this browser." />
    </template>
  </VxSiteShell>
</template>
