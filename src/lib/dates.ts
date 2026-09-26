// Day-level dates for the list page: "today", "3 days ago", and the ranges behind its date shortcuts.

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** YYYY-MM-DD in local time, the format the date filter keeps in the URL. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "today", "yesterday", "3 days ago", "2 weeks ago", then the date. */
export function relativeDay(when: Date, now = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(when).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface DateShortcut {
  label: string
  from: string
  to: string
}

/** Quick date ranges: the last week, the last month, and this year (all up to today). */
export function dateShortcuts(now = new Date()): DateShortcut[] {
  const today = startOfDay(now)
  const back = (days: number) => isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days))
  return [
    { label: 'Last 7 days', from: back(6), to: '' },
    { label: 'Last 30 days', from: back(29), to: '' },
    { label: `${today.getFullYear()}`, from: `${today.getFullYear()}-01-01`, to: '' },
  ]
}
