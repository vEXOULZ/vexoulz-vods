import { describe, expect, it } from 'vitest'
import { dateShortcuts, isoDay, relativeDay } from '../src/lib/dates'

const now = new Date(2026, 8, 26, 15, 0)

describe('relativeDay', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(relativeDay(new Date(2026, 8, 26, 1, 0), now)).toBe('today')
    expect(relativeDay(new Date(2026, 8, 25, 23, 59), now)).toBe('yesterday')
    expect(relativeDay(new Date(2026, 8, 21), now)).toBe('5 days ago')
    expect(relativeDay(new Date(2026, 8, 5), now)).toBe('3 weeks ago')
  })
  it('gives the date for anything older than about two months', () => {
    expect(relativeDay(new Date(2026, 5, 1), now)).not.toMatch(/ago/)
  })
})

describe('dateShortcuts', () => {
  it('ends every range today, as local days', () => {
    expect(dateShortcuts(now)).toEqual([
      { label: 'Last 7 days', from: '2026-09-20', to: '' },
      { label: 'Last 30 days', from: '2026-08-28', to: '' },
      { label: '2026', from: '2026-01-01', to: '' },
    ])
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
