import type { Job, JobState } from './api'

type Tone = 'default' | 'accent' | 'ok' | 'warn' | 'bad'

export const STATE_TONE: Record<JobState, Tone> = {
  queued: 'default',
  running: 'accent',
  paused: 'warn',
  done: 'ok',
  failed: 'bad',
  cancelled: 'default',
}

/** Local date and time, for tooltips and detail views. */
export const stamp = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : '—')

/** Where a job is in its steps: 0-based index of the current step, and the total. */
export function stepPosition(job: Pick<Job, 'state' | 'step' | 'steps'>): { index: number; total: number } {
  const total = job.steps.length
  if (job.state === 'done') return { index: total, total }
  const i = job.step ? job.steps.indexOf(job.step) : -1
  return { index: i < 0 ? 0 : i, total }
}

/** The state of each step, for the step list on the job page. */
export function stepStates(job: Pick<Job, 'state' | 'step' | 'steps' | 'pauseBefore'>) {
  const { index } = stepPosition(job)
  return job.steps.map((name, i) => ({
    name,
    status: (i < index ? 'done' : i > index ? 'todo' : job.state === 'done' ? 'done' : job.state) as 'done' | 'todo' | JobState,
    pauseBefore: job.pauseBefore?.includes(name) ?? false,
  }))
}
