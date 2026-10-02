// The tags that hang off a VOD's thumbnail. Two follow the dates: `new` (its first footage went live in the last
// week) and `updated` (a synthetic VOD, not new, that got footage from the last week). `complete` is a VOD tag an
// admin sets on a playthrough that was played to the end.
import type { Vod } from '@vexoulz/vods-core'

export const RECENT_MS = 7 * 24 * 3600 * 1000
/** The VOD tag behind `complete`; set on the synthetic VOD's manage page. */
export const COMPLETE_TAG = 'complete'

export type ThumbTag = 'new' | 'updated' | 'complete'

export const THUMB_TAG_TITLES: Record<ThumbTag, string> = {
  new: 'New: first streamed in the last 7 days',
  updated: 'Updated: new footage from the last 7 days',
  complete: 'Complete: played to the end',
}

export function thumbTags(vod: Vod, now = Date.now()): ThumbTag[] {
  const recent = (d: Date | null | undefined) => !!d && now - d.getTime() < RECENT_MS
  const out: ThumbTag[] = []
  const isNew = recent(vod.synthetic?.firstLiveAt ?? vod.createdAt)
  if (isNew) out.push('new')
  else if (vod.synthetic && recent(vod.synthetic.lastLiveAt)) out.push('updated')
  if (vod.tags.includes(COMPLETE_TAG)) out.push('complete')
  return out
}
