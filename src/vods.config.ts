// The channel this site archives. Everything the old site read from REACT_APP_* lives here.
// A friend's instance changes these values (and nothing else in the code).
import { defineVodsConfig } from '@vexoulz/vods-core'

export const vodsConfig = defineVodsConfig({
  channel: 'vEXOULZ',
  twitchId: '38656648',
  // Same origin as the site in production; `npm run dev` proxies it (see vite.config.ts).
  apiBase: import.meta.env.VITE_ARCHIVE_API || '/backend',
  startDate: '2024-09-16',
  // Length assumed for a YouTube part that is still processing (uploads are split every 3 h).
  defaultPartDuration: 10800,
})

export const site = {
  twitchUrl: 'https://twitch.tv/vexoulz',
  repoUrl: 'https://github.com/vEXOULZ/vexoulz-vods',
  /** VOD cards per page. */
  perPage: 24,
}
