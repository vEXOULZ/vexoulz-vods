import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import '@vexoulz/platform-web/style.css'
import '@vexoulz/vods-core/app.css'

import { VxNoThumbnail, VxTwitchGlyph } from '@vexoulz/ui'
import { createVodsApp } from '@vexoulz/vods-core/app'

import { AUTH_BASE, site, vodsConfig } from './vods.config'

// The whole site (pages, player, chat replay, Manage) is vods-core's app; this one adds its channel, name and art.
createVodsApp({
  config: vodsConfig,
  site,
  adminBase: import.meta.env.VITE_ADMIN_API || '/backend-admin',
  authBase: AUTH_BASE,
  commit: __COMMIT__,
  art: { noThumbnail: VxNoThumbnail, twitchGlyph: VxTwitchGlyph },
}).app.mount('#app')
