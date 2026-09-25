// The list page keeps its filters in the URL so a link reproduces the view: ?title=&game=&from=&to=&page=
import type { VodListOptions } from '@vexoulz/vods-core'

export interface ListState {
  page: number
  title: string
  game: string
  /** YYYY-MM-DD or '' (open-ended). */
  from: string
  to: string
}

type Query = Record<string, string | null | (string | null)[] | undefined>

const first = (v: Query[string]): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim()
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`))

export function parseListQuery(q: Query): ListState {
  const page = Number.parseInt(first(q.page), 10)
  const from = first(q.from)
  const to = first(q.to)
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    title: first(q.title).slice(0, 200),
    game: first(q.game).slice(0, 200),
    from: isDay(from) ? from : '',
    to: isDay(to) ? to : '',
  }
}

/** Query object with defaults left out, so the plain list is just `/vods`. */
export function toListQuery(s: ListState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.title) q.title = s.title
  if (s.game) q.game = s.game
  if (s.from) q.from = s.from
  if (s.to) q.to = s.to
  if (s.page > 1) q.page = String(s.page)
  return q
}

/** Filters for the API. Dates are local days: `from` from its start, `to` through its end. */
export function toApiFilter(s: ListState): Omit<VodListOptions, 'page' | 'perPage'> {
  return {
    title: s.title || undefined,
    game: s.game || undefined,
    from: s.from ? new Date(`${s.from}T00:00:00`) : undefined,
    to: s.to ? new Date(`${s.to}T23:59:59.999`) : undefined,
  }
}

export const hasFilters = (s: ListState) => !!(s.title || s.game || s.from || s.to)

/** Watch URL for a VOD: its VOD uploads, else its live uploads, else the auto route (which explains what's missing). */
export function watchPath(vod: { id: string; uploads: { type: 'vod' | 'live' }[] }, t?: number): string {
  const base = vod.uploads.some((u) => u.type === 'vod')
    ? `/vods/${vod.id}`
    : vod.uploads.some((u) => u.type === 'live')
      ? `/live/${vod.id}`
      : `/youtube/${vod.id}`
  return t && t > 0 ? `${base}?t=${Math.floor(t)}s` : base
}
