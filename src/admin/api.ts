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
  /** Merges and splits touching this VOD, oldest first (undone ones included, with `undoneAt`). */
  splices?: Splice[]
}

/** A merge (`otherId` appended to `vodId` at `offset`) or split (`vodId` from `offset` on became `otherId`). */
export interface Splice {
  id: number
  kind: 'merge' | 'split'
  vodId: string
  otherId: string
  /** Seconds into `vodId`. */
  offset: number
  /** Merges only: seconds the stream was down between the two (negative when they overlapped). */
  gap: number | null
  detail: Record<string, unknown>
  createdAt: string
  undoneAt: string | null
  /** False while a later splice on either VOD has to be undone first. */
  undoable: boolean
}

/** Whether Twitch's VOD of this id no longer matches it (merged or split), so the Twitch re-fetches refuse it. */
export const isSpliced = (v: Pick<AdminVod, 'merged_into' | 'splices'>) => !!v.merged_into || (v.splices ?? []).some((s) => !s.undoneAt)

export interface MergeCandidate {
  id: string
  streamId: string | null
  title: string | null
  createdAt: string
  /** "HH:MM:SS". */
  duration: string
  /** Seconds between the end of this VOD and the start of that one; negative when they overlap. */
  gap: number
  overlaps: boolean
  titlesMatch: boolean
}

/** GET /admin/vods/{id}/merge-candidates: VODs that started up to `withinMinutes` after this one ended. */
export interface MergeCandidates {
  vod: { id: string; streamId: string | null; title: string | null; createdAt: string; duration: string; endsAt: string; mergedInto: { id: string; offset: number } | null }
  withinMinutes: number
  candidates: MergeCandidate[]
}

/** What merge, unmerge, split and unsplit answer: the splice and this VOD as it is now. */
export interface SpliceResult {
  error: false
  msg: string
  splice: Splice
  vod: AdminVod
  /** Merges: the source's other upload type now plays a few seconds off. */
  warnings?: string[]
  /** Splits: the id of the new VOD. */
  newVodId?: string
  /** Set when the split point was a merge's join, so the split undid that merge instead. */
  undid?: 'merge'
}

/** Where a split can go instead (a 409's `validPoints`): `at`, anywhere from `from` to `to` works too. */
export interface SplitPoint {
  at: number
  from: number
  to: number
}

/** A chapter as PUT /admin/vods/{id}/chapters takes it. Times in seconds; `length`, not an end time. */
export interface ChapterEdit {
  name: string | null
  gameId: string | null
  imageTemplate?: string | null
  start: number
  length: number
  restricted: boolean
  /** "gap" keeps a merge's gap chapter one (the worker drops nothing else it doesn't know). */
  kind?: 'gap'
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
    /** The rest of the error body (a 409's `validPoints`, `edited`, `blockedBy`, …). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'AdminApiError'
  }

  /** The session is gone (expired, or the worker restarted): log in again. */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** A split refused inside an upload: the nearest points where it would work. */
  get validPoints(): SplitPoint[] {
    return Array.isArray(this.extra.validPoints) ? (this.extra.validPoints as SplitPoint[]) : []
  }

  /** An undo refused because it would throw away edits made since ("vodId.field", …); retry with force. */
  get edited(): string[] {
    return Array.isArray(this.extra.edited) ? (this.extra.edited as string[]) : []
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
      const { error: _e, msg: _m, message: _msg, ...extra } = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
      const err = new AdminApiError(res.status, msg || `HTTP ${res.status}`, Number.isFinite(retry) && retry > 0 ? retry : null, extra)
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

  // ---- merges and splits (one broadcast that Twitch cut in two, or two streams in one VOD) ----
  mergeCandidates(id: string, signal?: AbortSignal): Promise<MergeCandidates> {
    return this.request('GET', `/admin/vods/${enc(id)}/merge-candidates`, undefined, signal)
  }
  /** Appends `source` (the later VOD) to `id`; `gap` (seconds) replaces the gap worked out from the start times. */
  merge(id: string, source: string, gap?: number): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/merge`, { source, ...(gap != null ? { gap } : {}) })
  }
  unmerge(id: string, source: string, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/unmerge`, { source, ...(force ? { force } : {}) })
  }
  /** From `at` (VOD seconds) on becomes a new VOD; at a merge's join, undoes that merge. */
  split(id: string, at: number, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/split`, { at, ...(force ? { force } : {}) })
  }
  /** Undoes the latest split of `id`, or the one that made `source`. */
  unsplit(id: string, source?: string, force = false): Promise<SpliceResult> {
    return this.request('POST', `/admin/vods/${enc(id)}/unsplit`, { ...(source ? { source } : {}), ...(force ? { force } : {}) })
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
