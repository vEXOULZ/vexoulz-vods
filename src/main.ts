import '@vex/ui/fonts.css'
import '@vex/ui/style.css'
import '@vex/platform-web/style.css'
import '@vex/vods-core/app.css'

import { VxNoThumbnail, VxTwitchGlyph } from '@vex/ui'
import { createVodsApp } from '@vex/vods-core/app'

import { AUTH_BASE, site, USER_LOOKUP, vodsConfig } from './vods.config'

// The whole site (pages, player, chat replay, Manage) is vods-core's app; this one adds its channel, name and art.
createVodsApp({
  config: vodsConfig,
  site,
  adminBase: import.meta.env.VITE_ADMIN_API || '/backend-admin',
  authBase: AUTH_BASE,
  commit: __COMMIT__,
  art: { noThumbnail: VxNoThumbnail, twitchGlyph: VxTwitchGlyph },
  userLookupUrl: USER_LOOKUP || undefined,
}).app.mount('#app')
