import type { NavItem } from '@vexoulz/ui'
import { site } from '@/vods.config'

export const NAV: NavItem[] = [
  { label: 'VODs', to: '/vods' },
  { label: 'Playthroughs', to: '/playthroughs' },
  { label: 'Live', href: site.twitchUrl, external: true },
]
