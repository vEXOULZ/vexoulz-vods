// The Tags page's drafts: each tag as its fields are typed (sizes as text), the checks the archive also makes, and
// the list PUT /admin/site/tags takes.
import type { TagInput } from './api'
import { AUTO_TAGS, isAutoTag, TAG_COLOR, TAG_LABEL_MAX, TAG_NAME, TAG_SIZE, type RawTag } from '@/lib/vodTags'
import { site, type TagStyle } from '@/vods.config'

export interface TagDraft {
  /** Stable across edits, for v-for and errors (a name can change while it's new). */
  key: number
  name: string
  label: string
  drawn: boolean
  color: string
  width: string
  height: string
  /** The shape as saved (a path under the public API); uploads and removals apply straight away. */
  shape: string | null
  /** Saved in the archive: its name is fixed and it can take a shape. */
  saved: boolean
  /** Set automatically (AUTO_TAGS): its name is fixed and it can't be removed. */
  auto: boolean
}

export type TagField = 'name' | 'label' | 'color' | 'width' | 'height'

let nextKey = 0
export const draftOf = (t: RawTag, saved = true): TagDraft => ({
  key: ++nextKey,
  name: t.name,
  label: t.label,
  drawn: t.drawn,
  color: t.color ?? '',
  width: t.width == null ? '' : String(t.width),
  height: t.height == null ? '' : String(t.height),
  shape: t.shape,
  saved,
  auto: isAutoTag(t.name),
})
export const blankDraft = (): TagDraft => draftOf({ name: '', label: '', drawn: true, color: null, shape: null, width: null, height: null }, false)

/** `site.tags` as the archive's list: what the page starts from while the archive has none. */
export const rawOf = (tags: Record<string, TagStyle>): RawTag[] =>
  Object.entries(tags).map(([name, s]) => ({
    name, label: s.label, drawn: s.drawn, color: s.color ?? null, shape: null, width: s.width ?? null, height: s.height ?? null,
  }))

/** The archive's list as drafts, with any auto tag it lacks added from `site.tags` (unsaved, so Save adds it). */
export function draftsOf(list: RawTag[]): TagDraft[] {
  const builtIn = rawOf(site.tags)
  const missing = AUTO_TAGS.filter((name) => !list.some((t) => t.name === name)).map(
    (name) => builtIn.find((t) => t.name === name) ?? { name, label: name, drawn: false, color: null, shape: null, width: null, height: null },
  )
  return [...list.map((t) => draftOf(t)), ...missing.map((t) => draftOf(t, false))]
}

const inputOf = (t: RawTag): TagInput => ({ name: t.name, label: t.label, drawn: t.drawn, color: t.color, width: t.width, height: t.height })

/** The list to save, the problems by draft key and field, and whether anything differs from `saved`. */
export function tagChanges(saved: RawTag[], drafts: TagDraft[]) {
  const errors = new Map<number, Partial<Record<TagField, string>>>()
  const flag = (key: number, field: TagField, msg: string) => errors.set(key, { ...errors.get(key), [field]: msg })
  const seen = new Set<string>()
  const size = (key: number, field: 'width' | 'height', text: string): number | null => {
    if (!text.trim()) return null
    const n = Number(text)
    if (!Number.isInteger(n) || n < TAG_SIZE.min || n > TAG_SIZE.max) flag(key, field, `${TAG_SIZE.min}–${TAG_SIZE.max} px`)
    return n
  }
  const body: TagInput[] = drafts.map((d) => {
    const name = d.name.trim()
    const label = d.label.trim()
    const color = d.color.trim()
    if (!TAG_NAME.test(name)) flag(d.key, 'name', 'Lowercase letters, digits and dashes, up to 32')
    else if (seen.has(name)) flag(d.key, 'name', 'Another tag has this name')
    seen.add(name)
    if (!label) flag(d.key, 'label', 'Needs a label')
    else if (label.length > TAG_LABEL_MAX) flag(d.key, 'label', `Up to ${TAG_LABEL_MAX} characters`)
    if (color && !TAG_COLOR.test(color)) flag(d.key, 'color', 'A hex, var(--vx-…), a color name, or rgb()/hsl()/oklch()')
    return { name, label, drawn: d.drawn, color: color || null, width: size(d.key, 'width', d.width), height: size(d.key, 'height', d.height) }
  })
  const changed = JSON.stringify(body) !== JSON.stringify(saved.map(inputOf))
  return { body, errors, changed }
}

/** How a draft shows in the preview, with its saved shape resolved against the public API. */
export function previewOf(d: TagDraft, apiBase: string): TagStyle {
  const n = (t: string) => {
    const v = Number(t)
    return t.trim() && Number.isInteger(v) && v >= TAG_SIZE.min && v <= TAG_SIZE.max ? v : undefined
  }
  return {
    label: d.label.trim() || d.name || 'tag',
    drawn: d.drawn,
    color: TAG_COLOR.test(d.color.trim()) ? d.color.trim() : undefined,
    shape: d.shape ? `${apiBase.replace(/\/+$/, '')}/${d.shape}` : null,
    width: n(d.width),
    height: n(d.height),
  }
}
