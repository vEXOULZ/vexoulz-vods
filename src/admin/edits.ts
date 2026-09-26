// Editing a VOD's chapters and uploads: draft rows for the forms, the same checks the worker makes (so mistakes show
// next to the row before saving), and the request bodies. Pure functions; the pages hold the drafts.
import { toClock, toSeconds, type RawChapter, type RawDrive, type RawUpload } from '@vexoulz/vods-core'
import type { ChapterEdit, YoutubeEdit } from './api'

let nextKey = 1
const key = () => nextKey++

/** A chapter's game as the game picker edits it. */
export interface GameValue {
  name: string | null
  gameId: string | null
  imageTemplate: string | null
}

export interface ChapterDraft {
  key: number
  name: string | null
  gameId: string | null
  imageTemplate: string | null
  /** VOD seconds. */
  start: number
  /** VOD seconds (absolute), unlike the API's length. */
  end: number
  restricted: boolean
  /** A merge's gap chapter ("Technical difficulties"): kept as one on save. */
  kind?: 'gap'
}

/** A box art URL with the size baked in → a `{width}x{height}` template (older chapters only have `image`). */
export function templateOf(image: string | null | undefined): string | null {
  if (!image) return null
  if (image.includes('{width}x{height}')) return image
  const t = image.replace(/-\d+x\d+(\.\w+)(\?.*)?$/, '-{width}x{height}$1')
  return t === image ? null : t
}

export function chapterDrafts(chapters: readonly RawChapter[] | null | undefined): ChapterDraft[] {
  return (chapters ?? []).map((c) => {
    const length = c.length ?? c.end
    return {
      key: key(),
      name: c.name ?? null,
      gameId: c.gameId ?? null,
      imageTemplate: c.imageTemplate ?? templateOf(c.image),
      start: c.start,
      end: c.start + length,
      restricted: !!c.restricted,
      ...(c.kind === 'gap' ? { kind: 'gap' as const } : {}),
    }
  })
}

/** A new chapter after the last one (or at 0), running to the end of the VOD. */
export function newChapter(rows: readonly ChapterDraft[], duration: number): ChapterDraft {
  const start = rows.reduce((m, r) => Math.max(m, r.end), 0)
  return { key: key(), name: null, gameId: null, imageTemplate: null, start, end: Math.max(start + 1, duration), restricted: false }
}

/**
 * Problems per row (by key), matching the worker's checks: start ≥ 0, length > 0, inside the VOD, and no overlap
 * with the chapter before it once sorted. Unsorted rows are fine here; they're sorted on save.
 */
export function chapterErrors(rows: readonly ChapterDraft[], duration: number): Map<number, string> {
  const errors = new Map<number, string>()
  const sorted = [...rows].sort((a, b) => a.start - b.start)
  let prev: ChapterDraft | null = null
  for (const r of sorted) {
    if (!Number.isFinite(r.start) || r.start < 0) errors.set(r.key, 'Start must be a time ≥ 0:00.')
    else if (!Number.isFinite(r.end) || r.end <= r.start) errors.set(r.key, 'End must be after the start.')
    else if (duration > 0 && r.end > duration + 1) errors.set(r.key, `Ends after the VOD (${toClock(duration)}).`)
    else if (prev && r.start < prev.end - 0.001) errors.set(r.key, `Overlaps the chapter before it (ends ${toClock(prev.end)}).`)
    prev = r
  }
  return errors
}

export function chapterEdits(rows: readonly ChapterDraft[]): ChapterEdit[] {
  return [...rows]
    .sort((a, b) => a.start - b.start)
    .map((r) => ({
      name: r.name,
      gameId: r.gameId,
      imageTemplate: r.imageTemplate,
      start: r.start,
      length: r.end - r.start,
      restricted: r.restricted,
      ...(r.kind === 'gap' ? { kind: 'gap' as const } : {}),
    }))
}

/** Stretches of the VOD no chapter covers (shown as a hint; gaps are allowed). */
export function chapterGaps(rows: readonly ChapterDraft[], duration: number): { start: number; end: number }[] {
  const gaps: { start: number; end: number }[] = []
  let at = 0
  for (const r of [...rows].sort((a, b) => a.start - b.start)) {
    if (r.start - at > 1) gaps.push({ start: at, end: r.start })
    at = Math.max(at, r.end)
  }
  if (duration - at > 1) gaps.push({ start: at, end: duration })
  return gaps
}

/** "1:02:03", "62:03", "3723" or "1h2m3s" → seconds; NaN when it can't be read. */
export function parseTime(value: string): number {
  const v = value.trim().toLowerCase()
  if (!v) return NaN
  if (/^\d+(\.\d+)?$/.test(v) || v.includes(':')) return toSeconds(v)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(v)
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Seconds → "1:02:03" for the time inputs (keeps a fraction if there is one). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return ''
  const whole = Math.floor(seconds)
  const frac = seconds - whole
  const h = Math.floor(whole / 3600)
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0')
  const s = String(whole % 60).padStart(2, '0')
  return `${h}:${m}:${s}${frac > 0.0005 ? frac.toFixed(3).slice(1) : ''}`
}

// ---- uploads ----

export interface YoutubeDraft {
  key: number
  id: string
  type: 'vod' | 'live'
  part: number
  /** Seconds, or null to keep what the archive has (still processing). */
  duration: number | null
  thumbnail: string | null
}

export function youtubeDrafts(uploads: readonly RawUpload[] | null | undefined): YoutubeDraft[] {
  return (uploads ?? []).map((u, i) => ({
    key: key(),
    id: u.id,
    type: u.type,
    part: u.part ?? i + 1,
    duration: u.duration ?? null,
    thumbnail: u.thumbnail_url ?? null,
  }))
}

export function newYoutube(rows: readonly YoutubeDraft[], type: 'vod' | 'live' = 'vod'): YoutubeDraft {
  const part = rows.filter((r) => r.type === type).reduce((m, r) => Math.max(m, r.part), 0) + 1
  return { key: key(), id: '', type, part, duration: null, thumbnail: null }
}

/** A YouTube URL (watch, youtu.be, shorts, embed) or a bare id → the id. */
export function youtubeId(value: string): string {
  const v = value.trim()
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/.exec(v)
  return m ? m[1]! : v
}

export function youtubeErrors(rows: readonly YoutubeDraft[]): Map<number, string> {
  const errors = new Map<number, string>()
  const ids = new Set<string>()
  const parts = new Set<string>()
  for (const r of rows) {
    const id = r.id.trim()
    const slot = `${r.type}:${r.part}`
    if (!id) errors.set(r.key, 'Video id is required.')
    else if (!Number.isInteger(r.part) || r.part < 1) errors.set(r.key, 'Part must be a whole number ≥ 1.')
    else if (ids.has(id)) errors.set(r.key, 'This video is listed twice.')
    else if (parts.has(slot)) errors.set(r.key, `There is already a ${r.type} part ${r.part}.`)
    else if (r.duration != null && (!Number.isFinite(r.duration) || r.duration < 0)) errors.set(r.key, 'Duration must be a time.')
    ids.add(id)
    parts.add(slot)
  }
  return errors
}

export function youtubeEdits(rows: readonly YoutubeDraft[]): YoutubeEdit[] {
  return [...rows]
    .sort((a, b) => (a.type === b.type ? a.part - b.part : a.type === 'vod' ? -1 : 1))
    .map((r) => ({ id: r.id.trim(), type: r.type, part: r.part, ...(r.duration != null ? { duration: r.duration } : {}) }))
}

export interface DriveDraft extends RawDrive {
  key: number
}

export const driveDrafts = (files: readonly RawDrive[] | null | undefined): DriveDraft[] =>
  (files ?? []).map((f) => ({ key: key(), id: f.id, type: f.type }))

export const newDrive = (): DriveDraft => ({ key: key(), id: '', type: 'vod' })

/** A Google Drive file URL or a bare id → the id. */
export function driveId(value: string): string {
  const v = value.trim()
  const m = /\/d\/([\w-]{10,})|[?&]id=([\w-]{10,})/.exec(v)
  return m ? (m[1] ?? m[2])! : v
}

export function driveErrors(rows: readonly DriveDraft[]): Map<number, string> {
  const errors = new Map<number, string>()
  const ids = new Set<string>()
  for (const r of rows) {
    const id = r.id.trim()
    if (!id) errors.set(r.key, 'File id is required.')
    else if (ids.has(id)) errors.set(r.key, 'This file is listed twice.')
    ids.add(id)
  }
  return errors
}

export const driveEdits = (rows: readonly DriveDraft[]): RawDrive[] => rows.map((r) => ({ id: r.id.trim(), type: r.type }))
