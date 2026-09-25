import type { RawChapter } from '@vexoulz/vods-core'
import { describe, expect, it } from 'vitest'
import {
  chapterDrafts,
  chapterEdits,
  chapterErrors,
  chapterGaps,
  driveId,
  formatTime,
  parseTime,
  templateOf,
  youtubeDrafts,
  youtubeEdits,
  youtubeErrors,
  youtubeId,
} from '@/admin/edits'

const raw = (over: Partial<RawChapter>): RawChapter => ({ name: 'Game', gameId: '1', start: 0, end: 100, ...over })

describe('chapter drafts', () => {
  it('turn the API length-as-end into absolute ends, and back into lengths sorted by start', () => {
    const drafts = chapterDrafts([raw({ start: 100, end: 50, name: 'B' }), raw({ start: 0, end: 100, name: 'A' })])
    expect(drafts.map((d) => [d.start, d.end])).toEqual([[100, 150], [0, 100]])
    expect(chapterEdits(drafts)).toEqual([
      { name: 'A', gameId: '1', imageTemplate: null, start: 0, length: 100, restricted: false },
      { name: 'B', gameId: '1', imageTemplate: null, start: 100, length: 50, restricted: false },
    ])
  })

  it('keep uncategorised chapters as null and derive templates from baked-in box art', () => {
    const [d] = chapterDrafts([raw({ name: null, gameId: null, image: 'https://static-cdn.jtvnw.net/ttv-boxart/1-40x53.jpg' })])
    expect(d).toMatchObject({ name: null, gameId: null, imageTemplate: 'https://static-cdn.jtvnw.net/ttv-boxart/1-{width}x{height}.jpg' })
    expect(templateOf('https://x/{width}x{height}.jpg')).toBe('https://x/{width}x{height}.jpg')
    expect(templateOf('https://x/no-size.jpg')).toBeNull()
  })

  it('flag the same problems the worker rejects', () => {
    const [a, b, c, d] = chapterDrafts([
      raw({ start: 0, end: 100 }),
      raw({ start: 90, end: 20 }), // overlaps a
      raw({ start: 200, end: 0 }), // zero length
      raw({ start: 300, end: 900 }), // past the end
    ])
    const errors = chapterErrors([a!, b!, c!, d!], 1000)
    expect(errors.has(a!.key)).toBe(false)
    expect(errors.get(b!.key)).toMatch(/Overlaps/)
    expect(errors.get(c!.key)).toMatch(/after the start/)
    expect(errors.get(d!.key)).toMatch(/Ends after the VOD/)
    // Touching chapters and unsorted rows are fine.
    const ok = chapterDrafts([raw({ start: 100, end: 50 }), raw({ start: 0, end: 100 })])
    expect(chapterErrors(ok, 150).size).toBe(0)
  })

  it('find stretches no chapter covers', () => {
    const drafts = chapterDrafts([raw({ start: 10, end: 20 }), raw({ start: 50, end: 10 })])
    expect(chapterGaps(drafts, 100)).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 50 },
      { start: 60, end: 100 },
    ])
  })
})

describe('times', () => {
  it('parse clock, h/m/s and plain seconds', () => {
    expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime('62:03')).toBe(3723)
    expect(parseTime('1h2m3s')).toBe(3723)
    expect(parseTime('3723')).toBe(3723)
    expect(parseTime('1:2:x')).toBeNaN()
    expect(parseTime('')).toBeNaN()
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(3723.25)).toBe('1:02:03.250')
  })
})

describe('uploads', () => {
  it('read ids from URLs', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId(' dQw4w9WgXcQ ')).toBe('dQw4w9WgXcQ')
    expect(driveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing')).toBe('1AbCdEfGhIjKlMn')
  })

  it('reject duplicate videos and parts, and send only known durations', () => {
    const rows = youtubeDrafts([
      { id: 'a', type: 'vod', part: 2, duration: 100 },
      { id: 'b', type: 'vod', part: 1, duration: null },
      { id: 'c', type: 'live', part: 1 },
    ])
    expect(youtubeErrors(rows).size).toBe(0)
    expect(youtubeEdits(rows)).toEqual([
      { id: 'b', type: 'vod', part: 1 },
      { id: 'a', type: 'vod', part: 2, duration: 100 },
      { id: 'c', type: 'live', part: 1 },
    ])
    rows[2]!.type = 'vod'
    rows[2]!.part = 2
    expect([...youtubeErrors(rows).values()]).toEqual(['There is already a vod part 2.'])
  })
})
