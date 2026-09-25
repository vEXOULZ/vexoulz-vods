import type { Chapter, Vod } from '@vexoulz/vods-core'
import { describe, expect, it } from 'vitest'
import { boxArt, gamesWithArt, thumbnailOf } from '@/lib/art'

const ch = (name: string, image: string | null): Chapter => ({ name, image, gameId: null, start: 0, end: 1, restricted: false })

describe('boxArt', () => {
  it('fills templates and resizes baked-in sizes', () => {
    expect(boxArt('https://static-cdn.jtvnw.net/ttv-boxart/509658-{width}x{height}.jpg')).toBe(
      'https://static-cdn.jtvnw.net/ttv-boxart/509658-144x192.jpg',
    )
    expect(boxArt('https://static-cdn.jtvnw.net/ttv-boxart/491327_IGDB-40x53.jpg', 60)).toBe(
      'https://static-cdn.jtvnw.net/ttv-boxart/491327_IGDB-60x80.jpg',
    )
    expect(boxArt(null)).toBeNull()
  })
})

describe('gamesWithArt', () => {
  it('keeps chapter order, one entry per game, art from any chapter', () => {
    expect(gamesWithArt([ch('A', null), ch('B', 'https://x/b-40x53.jpg'), ch('A', 'https://x/a-40x53.jpg')])).toEqual([
      { name: 'A', image: 'https://x/a-144x192.jpg' },
      { name: 'B', image: 'https://x/b-144x192.jpg' },
    ])
    expect(gamesWithArt([ch('C', null)])).toEqual([{ name: 'C' }])
  })
})

describe('thumbnailOf', () => {
  const base = { thumbnail: null, uploads: [], games: [] } as unknown as Vod
  it('falls back from the VOD to its uploads to its game uploads', () => {
    expect(thumbnailOf({ ...base, thumbnail: 'v' })).toBe('v')
    expect(thumbnailOf({ ...base, uploads: [{ thumbnail: null }, { thumbnail: 'u' }] } as unknown as Vod)).toBe('u')
    expect(thumbnailOf({ ...base, games: [{ thumbnail: 'g' }] } as unknown as Vod)).toBe('g')
    expect(thumbnailOf(base)).toBeNull()
  })
})
