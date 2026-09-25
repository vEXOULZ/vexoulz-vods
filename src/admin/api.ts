import type { RawDrive, RawEmoteSets, RawVod } from '@vexoulz/vods-core'

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

/** GET /admin/vods/{id}: the VOD as the public API renders it, plus what only admins need. */
export interface AdminVod extends RawVod {
  chaptersLocked: boolean
  /** Recent jobs for this VOD, newest first. */
  jobs: Job[]
}

/** A chapter as PUT /admin/vods/{id}/chapters takes it. Times in seconds; `length`, not an end time. */
export interface ChapterEdit {
  name: string | null
  gameId: string | null
  imageTemplate?: string | null
  start: number
  length: number
  restricted: boolean
}

export interface YoutubeEdit {
  id: string
  type: 'vod' | 'live'
  part: number
  /** Seconds; omit to keep what the archive has. */
  duration?: number
}

export interface TwitchGame {
  gameId: string
  name: string
  imageTemplate: string | null
}

export interface AdminEmotes extends RawEmoteSets {
  createdAt?: string
  updatedAt?: string
}

export interface AuditEntry {
  id: number
  at: string
  actor: 'password' | 'api-key'
  /** "METHOD /route/{param}". */
  action: string
  /** "vod:<id>", "job:<id>" or null. */
  target: string | null
  detail: unknown
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

  // ---- VODs ----
  vod(id: string, signal?: AbortSignal): Promise<AdminVod> {
    return this.request('GET', `/admin/vods/${enc(id)}`, undefined, signal)
  }
  updateVod(id: string, patch: { title?: string }): Promise<AdminVod> {
    return this.request('PATCH', `/admin/vods/${enc(id)}`, patch)
  }
  saveChapters(id: string, chapters: ChapterEdit[], locked: boolean): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/chapters`, { chapters, locked })
  }
  saveYoutube(id: string, youtube: YoutubeEdit[]): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/youtube`, { youtube })
  }
  saveDrive(id: string, drive: RawDrive[]): Promise<AdminVod> {
    return this.request('PUT', `/admin/vods/${enc(id)}/drive`, { drive })
  }
  vodEmotes(id: string, signal?: AbortSignal): Promise<AdminEmotes | null> {
    return this.request('GET', `/admin/vods/${enc(id)}/emotes`, undefined, signal)
  }
  searchGames(query: string, signal?: AbortSignal): Promise<TwitchGame[]> {
    return this.request('GET', `/admin/twitch/games?query=${encodeURIComponent(query)}`, undefined, signal)
  }

  // ---- VOD jobs and fixes (the worker's existing routes) ----
  /** Chapters from Twitch; `force` also replaces chapters edited by hand. */
  refetchChapters(vodId: string, force = false): Promise<ActionResult> {
    return this.request('POST', '/admin/chapters', { vodId, ...(force ? { force } : {}) })
  }
  /** Fill the VOD's missing emote sets; `force` replaces the saved ones with today's. */
  captureEmotes(vodId: string, force = false): Promise<ActionResult> {
    return this.request('POST', '/admin/emotes', { vodId, ...(force ? { force } : {}) })
  }
  saveChat(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/logs', { vodId })
  }
  refreshDuration(vodId: string): Promise<ActionResult & { duration?: string }> {
    return this.request('POST', '/admin/duration', { vodId })
  }
  /** Download again (whole VOD or a part range), split and upload. */
  redownload(vodId: string, opts: { type?: 'vod' | 'live'; startPart?: number; endPart?: number } = {}): Promise<ActionResult> {
    return this.request('POST', '/admin/download', { vodId, ...opts })
  }
  reuploadPart(vodId: string, part: number, type: 'vod' | 'live' = 'vod'): Promise<ActionResult> {
    return this.request('POST', '/admin/reupload', { vodId, part, type })
  }
  updateDescriptions(vodId: string, type: 'vod' | 'live' = 'vod'): Promise<ActionResult> {
    return this.request('POST', '/admin/youtube/parts', { vodId, type })
  }
  /** Removes the VOD with its chat, emotes and game uploads from the archive (not from YouTube). */
  deleteVod(vodId: string): Promise<ActionResult> {
    return this.request('DELETE', '/admin/delete', { vodId })
  }
  /** A VOD the monitor missed: create it from Twitch and run the whole archive pipeline. */
  archiveFromTwitch(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/hls/download', { vodId })
  }
  /** Create the VOD row from Twitch (plus its chapters and emotes) without downloading anything. */
  createFromTwitch(vodId: string): Promise<ActionResult> {
    return this.request('POST', '/admin/generate/vod', { vodId })
  }
  backfillGlobalEmotes(vodIds?: string[]): Promise<ActionResult> {
    return this.request('POST', '/admin/emotes/backfill', vodIds?.length ? { vodIds } : {})
  }

  // ---- audit ----
  audit(q: { before?: number; limit?: number } = {}, signal?: AbortSignal): Promise<{ data: AuditEntry[] }> {
    const params = new URLSearchParams()
    if (q.before) params.set('before', String(q.before))
    if (q.limit) params.set('limit', String(q.limit))
    const qs = params.toString()
    return this.request('GET', `/admin/audit${qs ? `?${qs}` : ''}`, undefined, signal)
  }
}

const enc = encodeURIComponent

/** What an admin can do with a job in its state (mirrors the worker's rules). */
export function jobActions(job: Pick<Job, 'state'>) {
  return {
    pause: job.state === 'queued' || job.state === 'running',
    resume: job.state === 'paused',
    retry: job.state === 'failed' || job.state === 'cancelled',
    cancel: job.state === 'queued' || job.state === 'paused' || job.state === 'running',
  }
}
