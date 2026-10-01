import { describe, expect, it } from 'vitest'
import { hasFilters, parseListQuery, toApiFilter, toListQuery } from '@/lib/listQuery'

describe('parseListQuery', () => {
  it('defaults an empty query', () => {
    expect(parseListQuery({})).toEqual({ tab: 'vods', page: 1, title: '', game: '', from: '', to: '' })
  })

  it('reads every filter and trims', () => {
    expect(parseListQuery({ title: ' chill ', game: 'Minecraft', from: '2025-01-02', to: '2025-02-03', page: '3' })).toEqual({
      tab: 'vods',
      page: 3,
      title: 'chill',
      game: 'Minecraft',
      from: '2025-01-02',
      to: '2025-02-03',
    })
  })

  it('drops bad pages and dates', () => {
    const s = parseListQuery({ page: '-2', from: '2025-13-40', to: 'yesterday' })
    expect(s.page).toBe(1)
    expect(s.from).toBe('')
    expect(s.to).toBe('')
    expect(parseListQuery({ page: 'abc' }).page).toBe(1)
  })

  it('takes the first of repeated params', () => {
    expect(parseListQuery({ game: ['A', 'B'] }).game).toBe('A')
    expect(parseListQuery({ game: [null] }).game).toBe('')
  })
})

describe('toListQuery', () => {
  it('leaves out defaults', () => {
    expect(toListQuery(parseListQuery({}))).toEqual({})
  })

  it('round-trips', () => {
    const q = { title: 'x', game: 'Y', from: '2025-01-01', to: '2025-01-31', page: '2' }
    expect(toListQuery(parseListQuery(q))).toEqual(q)
  })

  it('reads the tab, keeping it out of the URL on the default one', () => {
    expect(parseListQuery({ tab: 'playthroughs' }).tab).toBe('playthroughs')
    expect(parseListQuery({ tab: 'nope' }).tab).toBe('vods')
    expect(toListQuery(parseListQuery({ tab: 'playthroughs', page: '2' }))).toEqual({ tab: 'playthroughs', page: '2' })
    expect(toListQuery(parseListQuery({ tab: 'vods' }))).toEqual({})
  })
})

describe('toApiFilter', () => {
  it('covers whole local days', () => {
    const f = toApiFilter(parseListQuery({ from: '2025-03-01', to: '2025-03-02' }))
    expect(f.from).toEqual(new Date(2025, 2, 1, 0, 0, 0, 0))
    expect(f.to).toEqual(new Date(2025, 2, 2, 23, 59, 59, 999))
  })

  it('omits empty filters', () => {
    expect(toApiFilter(parseListQuery({ tab: 'playthroughs' })).tag).toBe('compilation')
    expect(toApiFilter(parseListQuery({}))).toEqual({ tag: undefined, title: undefined, game: undefined, from: undefined, to: undefined })
  })
})

describe('hasFilters', () => {
  it('ignores the page and the tab', () => {
    expect(hasFilters(parseListQuery({ page: '4', tab: 'playthroughs' }))).toBe(false)
    expect(hasFilters(parseListQuery({ game: 'A' }))).toBe(true)
  })
})
