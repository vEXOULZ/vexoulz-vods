// Client for twitch-archive's worker admin API, as described in docs/admin-api.md. The browser holds no key: a
// password login gives it an HttpOnly session cookie, and every change carries the session's CSRF token.

export type JobState = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
export const JOB_STATES: readonly JobState[] = ['queued', 'running', 'paused', 'done', 'failed', 'cancelled']

export interface Job {
  id: number
  kind: string
  vodId: string | null
  state: JobState
  /** The next step to run (the current one while running). */
  step: string | null
  attempts: number
  lastError: string | null
  payload: Record<string, unknown>
  notBefore: string | null
  pauseBefore: string[] | null
  pauseNext: boolean
  steps: string[]
  createdAt: string | null
  updatedAt: string | null
}

export interface JobList {
  counts: Record<JobState, number>
  data: Job[]
}

export interface JobKind {
  steps: string[]
  /** Steps the job pauses before by default. */
  manualSteps: string[]
}

export interface JobEvent {
  seq: number
  at: string
  level: 'info' | 'warning' | 'error'
  step: string | null
  message: string
  progress: { done: number; total: number; unit: string } | null
}

export interface Session {
  authenticated: boolean
  csrf: string | null
  expiresAt: string | null
  /** False when the archive has no admin password configured. */
  passwordLogin: boolean
}

export interface Health {
  worker: { ok: boolean; runningJobs: number; startedAt?: string | null }
  api: { ok: boolean } | null
  youtube: { authorized: boolean; valid: boolean; error: string | null; checkedAt?: string | null } | null
  live: { live: boolean; streamId: string | null; startedAt: string | null } | null
  jobs: { counts: Record<JobState, number>; recentFailures: Job[] }
}

export interface ActionResult {
  error: false
  msg: string
  jobId?: number
}

export interface LaunchJob {
  kind: string
  vodId?: string
  payload?: Record<string, unknown>
  fromStep?: string
  pauseBefore?: string[]
  paused?: boolean
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds, from Retry-After (rate-limited logins). */
    readonly retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }

  /** The session is gone (expired, or the worker restarted): log in again. */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export class AdminClient {
  readonly base: string
  private readonly fetcher: Fetch
  /** Sent as X-CSRF-Token on every change; set from the session. */
  csrf: string | null = null
  /** Called when a request comes back 401/403, so the app can send the admin to the login page. */
  onUnauthorized: (() => void) | null = null

  constructor(opts: { base: string; fetch?: Fetch }) {
    this.base = opts.base.replace(/\/+$/, '')
    this.fetcher = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (method !== 'GET' && this.csrf) headers['x-csrf-token'] = this.csrf
    const res = await this.fetcher(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
    if (res.status === 204) return undefined as T
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // not JSON (a proxy error page, say)
    }
    if (!res.ok) {
      const msg = (data as { msg?: string; message?: string } | null)?.msg ?? (data as { message?: string } | null)?.message
      const retry = Number(res.headers.get('retry-after'))
      const err = new AdminApiError(res.status, msg || `HTTP ${res.status}`, Number.isFinite(retry) && retry > 0 ? retry : null)
      if (err.unauthorized && path !== '/admin/session') this.onUnauthorized?.()
      throw err
    }
    return data as T
  }

  // ---- session ----
  session(signal?: AbortSignal): Promise<Session> {
    return this.request('GET', '/admin/session', undefined, signal)
  }
  login(password: string): Promise<Session> {
    return this.request('POST', '/admin/session', { password })
  }
  logout(): Promise<void> {
    return this.request('DELETE', '/admin/session')
  }

  // ---- overview ----
  health(signal?: AbortSignal): Promise<Health> {
    return this.request('GET', '/admin/health', undefined, signal)
  }
  youtubeAuthUrl(): Promise<{ url: string }> {
    return this.request('GET', '/admin/youtube/auth')
  }

  // ---- jobs ----
  kinds(signal?: AbortSignal): Promise<Record<string, JobKind>> {
    return this.request('GET', '/admin/kinds', undefined, signal)
  }
  jobs(q: { state?: string; vodId?: string; kind?: string; limit?: number; before?: number } = {}, signal?: AbortSignal): Promise<JobList> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v))
    const qs = params.toString()
    return this.request('GET', `/admin/jobs${qs ? `?${qs}` : ''}`, undefined, signal)
  }
  job(id: number, signal?: AbortSignal): Promise<Job> {
    return this.request('GET', `/admin/jobs/${id}`, undefined, signal)
  }
  jobEvents(id: number, after = 0, signal?: AbortSignal): Promise<{ data: JobEvent[]; next: number }> {
    return this.request('GET', `/admin/jobs/${id}/events?after=${after}`, undefined, signal)
  }
  launch(job: LaunchJob): Promise<ActionResult> {
    return this.request('POST', '/admin/jobs', job)
  }
  pause(id: number): Promise<ActionResult> {
    return this.request('POST', `/admin/jobs/${id}/pause`)
  }
  resume(id: number, once = false): Promise<ActionResult> {
    return this.request('POST', `/admin/jobs/${id}/resume`, { once })
  }
  retry(id: number): Promise<ActionResult> {
    return this.request('POST', `/admin/jobs/${id}/retry`)
  }
  cancel(id: number): Promise<ActionResult> {
    return this.request('POST', `/admin/jobs/${id}/cancel`)
  }
  updateJob(id: number, patch: { pauseBefore?: string[] | null; pauseNext?: boolean }): Promise<Job> {
    return this.request('PATCH', `/admin/jobs/${id}`, patch)
  }
}

/** What an admin can do with a job in its state (mirrors the worker's rules). */
export function jobActions(job: Pick<Job, 'state'>) {
  return {
    pause: job.state === 'queued' || job.state === 'running',
    resume: job.state === 'paused',
    retry: job.state === 'failed' || job.state === 'cancelled',
    cancel: job.state === 'queued' || job.state === 'paused' || job.state === 'running',
  }
}
