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

/** How a VOD tag shows (see `site.tags`). */
export interface TagStyle {
  /** What it reads as: on its chip, or to screen readers when drawn. */
  label: string
  /** Hangs off the thumbnail as a drawn tag; otherwise it's a chip by the date. */
  drawn: boolean
  /** Any CSS color: the drawn tag's paint, or the chip's text and border. Unset: the default look. */
  color?: string
  /** A drawn tag's vector image (a URL, e.g. `/tags/new.svg` from `public/`), in its own colors: the parts in
   * `currentColor` (or, in a file without currentColor, the black parts) take `color` (lib/tagShape). Null: a
   * placeholder until the image exists. */
  shape?: string | null
  /** A drawn tag's size in px. Default 62 × 22. */
  width?: number
  height?: number
  /** Text written on a drawn tag (not the label, which stays for chips and screen readers). Unset: none. */
  text?: string
  /** The text's color (any CSS color) and size in px. Unset: the page background's color, and half the height. */
  textColor?: string
  textSize?: number
  /** Moves the text from the tag's middle, in px (e.g. off a tag's hole). */
  textX?: number
  textY?: number
  /** Turns the text, in degrees, clockwise (−180 to 180). Unset: level with the tag. */
  textRotate?: number
  /** A pattern over the tag-colored parts: diagonal stripes or checks of `color` and `patternColor`. Unset: plain. */
  pattern?: 'stripes' | 'checks'
  /** The pattern's second color (any CSS color) and the width of one stripe or square in px. Unset: the page
   * background's color, and 4. */
  patternColor?: string
  patternSize?: number
}

export const site = {
  twitchUrl: 'https://twitch.tv/vexoulz',
  /** VOD cards per page. */
  perPage: 24,
  /**
   * VOD tags, by name. `new` and `updated` come from the VOD's dates (src/lib/vodTags.ts); the rest are tags set on
   * the VOD (`compilation` on a playthrough, `complete` from its manage page). A tag not listed is a chip with its
   * own name. These are the defaults: once the archive has tags edited on /manage/tags, the site uses those.
   */
  tags: {
    new: { label: 'new', drawn: true, color: 'var(--vx-accent)', shape: null },
    updated: { label: 'updated', drawn: true, color: 'var(--vx-info)', shape: null },
    complete: { label: 'complete', drawn: true, color: 'var(--vx-ok)', shape: null },
    compilation: { label: 'playthrough', drawn: false },
  } as Record<string, TagStyle>,
}
