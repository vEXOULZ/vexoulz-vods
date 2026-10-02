// A VOD's tags and how each shows. Two follow the dates: `new` (its first footage went live in the last week) and
// `updated` (a synthetic VOD, not new, that got footage from the last week). The others are tags set on the VOD, like
// `complete`, which an admin sets on a playthrough that was played to the end. Whether a tag is drawn on the
// thumbnail or is a chip, and its color and shape, come from the archive (edited on /manage/tags; docs/admin-api.md,
// "Site tags"), or from `site.tags` while the archive has none.
import type { Vod } from '@vexoulz/vods-core'
import { shallowRef } from 'vue'
import { site, vodsConfig, type TagStyle } from '@/vods.config'

export const RECENT_MS = 7 * 24 * 3600 * 1000
/** The VOD tag behind `complete`; set on the synthetic VOD's manage page. */
export const COMPLETE_TAG = 'complete'

/** How every tag shows: `site.tags` until loadTagConfig() gets the archive's. */
export const tagConfig = shallowRef<Record<string, TagStyle>>(site.tags)

/** The date tags first, then the VOD's own, each once. */
export function vodTags(vod: Vod, now = Date.now()): string[] {
  const recent = (d: Date | null | undefined) => !!d && now - d.getTime() < RECENT_MS
  const out: string[] = []
  if (recent(vod.synthetic?.firstLiveAt ?? vod.createdAt)) out.push('new')
  else if (vod.synthetic && recent(vod.synthetic.lastLiveAt)) out.push('updated')
  return [...new Set([...out, ...vod.tags])]
}

export const tagStyle = (tag: string, tags: Record<string, TagStyle> = tagConfig.value): TagStyle =>
  tags[tag] ?? { label: tag, drawn: false }

/** The tags drawn on the thumbnail, and the ones shown as chips. */
export function splitTags(vod: Vod, now = Date.now(), tags: Record<string, TagStyle> = tagConfig.value) {
  const all = vodTags(vod, now)
  return {
    drawn: all.filter((t) => tagStyle(t, tags).drawn),
    chips: all.filter((t) => !tagStyle(t, tags).drawn),
  }
}

// ---- the archive's tag config (GET /v1/site/tags) ----

/** One tag as the archive sends it. `shape` is a path under the public API (`v1/site/tags/new.svg?v=…`). */
export interface RawTag {
  name: string
  label: string
  drawn: boolean
  color: string | null
  shape: string | null
  width: number | null
  height: number | null
}

export const TAG_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
/** Colors a tag may have: a hex, a theme token, a named color, or rgb()/hsl()/oklch(). The archive checks the same. */
export const TAG_COLOR = /^(#[0-9a-f]{3,8}|var\(--vx-[a-z0-9-]+\)|[a-z]{3,20}|(rgba?|hsla?|oklch)\([0-9.,%\s/a-z-]{1,60}\))$/i
export const TAG_SIZE = { min: 8, max: 200 }
export const TAG_LABEL_MAX = 40

/** The archive's list as tag styles: shapes resolved against the API, anything malformed dropped or defaulted. */
export function fromRaw(raw: RawTag[], apiBase: string): Record<string, TagStyle> {
  const size = (n: unknown) => (typeof n === 'number' && n >= TAG_SIZE.min && n <= TAG_SIZE.max ? n : undefined)
  const out: Record<string, TagStyle> = {}
  for (const t of raw) {
    if (!t || typeof t.name !== 'string' || !TAG_NAME.test(t.name)) continue
    out[t.name] = {
      label: typeof t.label === 'string' && t.label ? t.label : t.name,
      drawn: t.drawn === true,
      color: typeof t.color === 'string' && TAG_COLOR.test(t.color) ? t.color : undefined,
      shape: typeof t.shape === 'string' && /^v1\/site\/tags\/[\w.?=&-]+$/.test(t.shape) ? `${apiBase.replace(/\/+$/, '')}/${t.shape}` : null,
      width: size(t.width),
      height: size(t.height),
    }
  }
  return out
}

/** Takes the archive's tag config when it has one; on any failure (an archive without it answers 404) keeps what's there. */
export async function loadTagConfig(fetcher: typeof fetch = (...a) => fetch(...a), apiBase = vodsConfig.apiBase): Promise<void> {
  try {
    const res = await fetcher(`${apiBase.replace(/\/+$/, '')}/v1/site/tags`, { headers: { accept: 'application/json' } })
    if (!res.ok) return
    const body = (await res.json()) as { tags?: RawTag[] }
    if (Array.isArray(body?.tags)) tagConfig.value = fromRaw(body.tags, apiBase)
  } catch {
    // keep site.tags
  }
}
