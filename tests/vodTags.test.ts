import type { Synthetic, Vod } from '@vexoulz/vods-core'
import { describe, expect, it } from 'vitest'
import { thumbTags } from '../src/lib/vodTags'

const now = new Date(2026, 9, 2, 12, 0).getTime()
const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000)
const vod = (o: Partial<Vod> = {}): Vod =>
  ({ id: '1', title: '', createdAt: daysAgo(30), duration: 0, chapters: [], uploads: [], drive: [], games: [], thumbnail: null, streamId: null, tags: [], ...o }) as Vod
const syn = (first: Date | null, last: Date | null): Synthetic => ({
  supersedes: false,
  segments: [],
  madeAt: null,
  changedAt: null,
  firstLiveAt: first,
  lastLiveAt: last,
})

describe('thumbTags', () => {
  it('marks a VOD streamed in the last week as new', () => {
    expect(thumbTags(vod({ createdAt: daysAgo(2) }), now)).toEqual(['new'])
    expect(thumbTags(vod({ createdAt: daysAgo(10) }), now)).toEqual([])
    expect(thumbTags(vod({ createdAt: daysAgo(7) }), now)).toEqual([])
  })
  it('marks a synthetic VOD by its first and last footage', () => {
    expect(thumbTags(vod({ synthetic: syn(daysAgo(10), daysAgo(2)) }), now)).toEqual(['updated'])
    expect(thumbTags(vod({ synthetic: syn(daysAgo(2), daysAgo(1)) }), now)).toEqual(['new'])
    expect(thumbTags(vod({ synthetic: syn(daysAgo(10), daysAgo(10)) }), now)).toEqual([])
  })
  it('falls back to createdAt without live dates', () => {
    expect(thumbTags(vod({ createdAt: daysAgo(1), synthetic: syn(null, null) }), now)).toEqual(['new'])
    expect(thumbTags(vod({ createdAt: daysAgo(20), synthetic: syn(null, null) }), now)).toEqual([])
  })
  it('shows complete when an admin tagged it', () => {
    expect(thumbTags(vod({ tags: ['compilation', 'complete'], synthetic: syn(daysAgo(20), daysAgo(3)) }), now)).toEqual(['updated', 'complete'])
    expect(thumbTags(vod({ tags: ['compilation'] }), now)).toEqual([])
  })
})
