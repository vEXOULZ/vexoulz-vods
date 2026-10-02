// A VOD's tags and how each shows. Two follow the dates: `new` (its first footage went live in the last week) and
// `updated` (a synthetic VOD, not new, that got footage from the last week). The others are tags set on the VOD, like
// `complete`, which an admin sets on a playthrough that was played to the end. Whether a tag is drawn on the
// thumbnail or is a chip, and its color and shape, come from `site.tags`.
import type { Vod } from '@vexoulz/vods-core'
import { site, type TagStyle } from '@/vods.config'

export const RECENT_MS = 7 * 24 * 3600 * 1000
/** The VOD tag behind `complete`; set on the synthetic VOD's manage page. */
export const COMPLETE_TAG = 'complete'

/** The date tags first, then the VOD's own, each once. */
export function vodTags(vod: Vod, now = Date.now()): string[] {
  const recent = (d: Date | null | undefined) => !!d && now - d.getTime() < RECENT_MS
  const out: string[] = []
  if (recent(vod.synthetic?.firstLiveAt ?? vod.createdAt)) out.push('new')
  else if (vod.synthetic && recent(vod.synthetic.lastLiveAt)) out.push('updated')
  return [...new Set([...out, ...vod.tags])]
}

export const tagStyle = (tag: string, tags: Record<string, TagStyle> = site.tags): TagStyle =>
  tags[tag] ?? { label: tag, drawn: false }

/** The tags drawn on the thumbnail, and the ones shown as chips. */
export function splitTags(vod: Vod, now = Date.now(), tags: Record<string, TagStyle> = site.tags) {
  const all = vodTags(vod, now)
  return {
    drawn: all.filter((t) => tagStyle(t, tags).drawn),
    chips: all.filter((t) => !tagStyle(t, tags).drawn),
  }
}
