// The channel this site archives and what tells it from the other vods sites. The pages, the player and Manage are
// vods-core's app (`createVodsApp()` in main.ts); a friend's instance changes these values and nothing else.
import { defineVodsConfig } from '@vex/vods-core'
import { DEFAULT_TAGS, type VodsSite } from '@vex/vods-core/app'

export const vodsConfig = defineVodsConfig({
  channel: 'vexouLuna',
  twitchId: '38656648',
  // Same origin as the site in production; `npm run dev` proxies it (see vite.config.ts).
  apiBase: import.meta.env.VITE_ARCHIVE_API || '/backend',
  startDate: '2024-09-16',
  // Length assumed for a YouTube part that is still processing (uploads are split every 3 h).
  defaultPartDuration: 10800,
})

export const site: Partial<VodsSite> & Pick<VodsSite, 'id' | 'name' | 'twitchUrl'> = {
  // Its entry in vex-ui's SITES: accent, sky, switcher entry.
  id: 'vods',
  name: 'vods.vexoul.net',
  twitchUrl: 'https://twitch.tv/vexouluna',
  /**
   * VOD tags, by name, until the archive has tags edited on /manage/tags. `new` and `updated` come from the VOD's
   * dates; the rest are set on the VOD. A drawn tag's `shape` is its image in `public/tags/`, null until it exists.
   */
  tags: DEFAULT_TAGS,
}

/**
 * vex-auth's URL, the shared *.vexoul.net sign-in. VITE_AUTH_BASE overrides it (a copy hosted elsewhere points it
 * at its own, or sets it empty: that turns sign-in off, and the menu's "Sign in" is greyed out).
 */
export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? 'https://auth.vexoul.net'

/**
 * Where chat's user cards look a chatter up on Twitch: doomtp-bot's `/api/v2/twitch/users` (its USER_LOOKUP_ORIGINS
 * must list this site). VITE_USER_LOOKUP overrides it; empty turns the lookup off, and a card shows what chat knows.
 */
export const USER_LOOKUP = import.meta.env.VITE_USER_LOOKUP ?? 'https://dtp.vexoul.net/api/v2/twitch/users'
