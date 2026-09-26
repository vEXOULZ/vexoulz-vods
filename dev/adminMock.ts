// Dev-only stand-in for the worker admin API (docs/admin-api.md), so `npm run dev` can show /admin without a real
// archive. Fake data, in memory; jobs advance on their own. Password: "admin". Never part of a build.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { Plugin } from 'vite'

type State = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
const STATES: State[] = ['queued', 'running', 'paused', 'done', 'failed', 'cancelled']
const GROUPS: Record<string, State[]> = {
  waiting: ['queued'],
  stopped: ['paused', 'failed', 'cancelled'],
  active: ['queued', 'running', 'paused'],
  finished: ['done', 'failed', 'cancelled'],
}
// Same kinds and steps as the worker (twitch-archive README, "Job kinds").
const KINDS: Record<string, { steps: string[]; manualSteps: string[] }> = {
  archive: { steps: ['capture', 'finalize', 'chapters', 'chat', 'emotes', 'split', 'upload', 'describe', 'cleanup'], manualSteps: [] },
  download: { steps: ['ensure_source', 'chapters', 'split', 'upload', 'describe', 'cleanup'], manualSteps: [] },
  reupload: { steps: ['ensure_source', 'split', 'upload', 'describe', 'cleanup'], manualSteps: ['upload'] },
  dmca: { steps: ['ensure_source', 'dmca_edit', 'split', 'upload', 'describe', 'cleanup'], manualSteps: ['upload'] },
  chat: { steps: ['chat'], manualSteps: [] },
  chapters: { steps: ['chapters'], manualSteps: [] },
  emotes: { steps: ['emotes'], manualSteps: [] },
  describe: { steps: ['describe'], manualSteps: [] },
  global_emotes_backfill: { steps: ['global_emotes_backfill'], manualSteps: [] },
}

interface Job {
  id: number; kind: string; vodId: string | null; state: State; step: string | null; attempts: number
  lastError: string | null; payload: Record<string, unknown>; notBefore: string | null
  pauseBefore: string[] | null; pauseNext: boolean; createdAt: string; updatedAt: string
  ticks: number
}
interface Event { seq: number; at: string; level: 'info' | 'warning' | 'error'; step: string | null; message: string; progress: { done: number; total: number; unit: string } | null }

const iso = (ms = 0) => new Date(Date.now() - ms).toISOString()
let nextId = 1
const jobs: Job[] = []
const events = new Map<number, Event[]>()
let seq = 0

function log(job: Job, message: string, level: Event['level'] = 'info', progress: Event['progress'] = null) {
  const list = events.get(job.id) ?? []
  list.push({ seq: ++seq, at: iso(), level, step: job.step, message, progress })
  events.set(job.id, list.slice(-1000))
}

function add(kind: string, vodId: string | null, state: State, stepIndex: number, ageMin: number, extra: Partial<Job> = {}) {
  const steps = KINDS[kind]!.steps
  const job: Job = {
    id: nextId++, kind, vodId, state, step: state === 'done' ? null : steps[Math.min(stepIndex, steps.length - 1)]!,
    attempts: state === 'failed' ? 3 : 1, lastError: null, payload: {}, notBefore: null, pauseBefore: null, pauseNext: false,
    createdAt: iso(ageMin * 60_000), updatedAt: iso(ageMin * 30_000), ticks: 0, ...extra,
  }
  jobs.unshift(job)
  log(job, `Job created (${kind})`)
  return job
}

// Seed: a history of finished work plus a few in flight.
for (let i = 0; i < 70; i++) add(i % 3 ? 'archive' : 'chapters', String(2300000000 + i * 7919), 'done', 99, 60 * 24 * (70 - i))
add('dmca', '2301234567', 'cancelled', 1, 60 * 30)
add('reupload', '2309876543', 'failed', 1, 60 * 5, { lastError: 'YouTube quota exceeded (403 quotaExceeded); retry after midnight Pacific.' })
add('download', '2311111111', 'paused', 2, 90, { pauseBefore: ['upload'] })
add('archive', '2312345678', 'running', 6, 40)
add('emotes', '2312345678', 'queued', 0, 1)

function advance() {
  for (const job of jobs) {
    if (job.state === 'queued') {
      job.state = 'running'
      job.updatedAt = iso()
      log(job, `Step ${job.step} started`)
      continue
    }
    if (job.state !== 'running') continue
    const steps = KINDS[job.kind]!.steps
    job.ticks++
    const total = 8
    if (job.ticks < total) {
      log(job, `${job.step}: part ${job.ticks}/${total}`, 'info', { done: job.ticks, total, unit: 'parts' })
      continue
    }
    job.ticks = 0
    const i = steps.indexOf(job.step!)
    log(job, `Step ${job.step} finished`)
    job.updatedAt = iso()
    if (i + 1 >= steps.length) {
      job.state = 'done'
      job.step = null
      log(job, 'Job done')
    } else {
      job.step = steps[i + 1]!
      if (job.pauseNext || job.pauseBefore?.includes(job.step)) {
        job.state = 'paused'
        job.pauseNext = false
        log(job, `Paused before ${job.step}`, 'warning')
      } else log(job, `Step ${job.step} started`)
    }
  }
}

const json = (job: Job) => {
  const { ticks: _t, ...rest } = job
  return { ...rest, steps: KINDS[job.kind]!.steps }
}
const counts = () => Object.fromEntries(STATES.map((s) => [s, jobs.filter((j) => j.state === s).length]))

// ---- sessions ----
const sessions = new Map<string, { csrf: string; expires: number }>()
const COOKIE = 'archive_admin'
const failures: number[] = []

function sessionOf(req: IncomingMessage) {
  const m = /(?:^|;\s*)archive_admin=([^;]+)/.exec(req.headers.cookie ?? '')
  const s = m ? sessions.get(m[1]!) : undefined
  return s && s.expires > Date.now() ? { token: m![1]!, ...s } : null
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function send(res: ServerResponse, status: number, data?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(data === undefined ? undefined : JSON.stringify(data))
}
const fail = (res: ServerResponse, status: number, msg: string) => send(res, status, { error: true, msg })
const ok = (res: ServerResponse, msg: string, job?: Job) => send(res, 200, { error: false, msg, jobId: job?.id })

// ---- VODs: real ones from the public archive API, edited in memory ----
type Json = Record<string, any>
const vods = new Map<string, Json>()
const deleted = new Set<string>()
const locked = new Set<string>()
const emoteRows = new Map<string, Json | null>()
const audit: Json[] = []
let auditId = 0

async function publicJson(api: string, path: string): Promise<unknown> {
  const res = await fetch(`${api}${path}`)
  if (!res.ok) throw new Error(`public API ${res.status}`)
  return res.json()
}

async function vodOf(api: string, id: string): Promise<Json | null> {
  if (!id || deleted.has(id)) return null
  if (!vods.has(id)) {
    try {
      vods.set(id, (await publicJson(api, `/vods/${encodeURIComponent(id)}`)) as Json)
    } catch {
      return null
    }
  }
  return vods.get(id)!
}

const adminVod = (v: Json) => ({
  ...v,
  chaptersLocked: locked.has(String(v.id)),
  jobs: jobs.filter((j) => j.vodId === v.id).slice(0, 20).map(json),
  splices: splicesOf(String(v.id)),
})

const hms = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s % 60)].map((n) => String(n).padStart(2, '0')).join(':')
const secondsOf = (hhmmss: unknown) => String(hhmmss ?? '0').split(':').reduce((t, p) => t * 60 + Number(p), 0)

/** Same checks as the worker's vod_edits.chapters. */
function checkChapters(items: unknown, duration: number): Json[] {
  if (!Array.isArray(items)) throw new Error('chapters must be a list')
  let prevStart: number | null = null
  let prevEnd: number | null = null
  return items.map((c: Json, i) => {
    const where = `chapters[${i}]`
    const start = Number(c.start), length = Number(c.length)
    if (!(start >= 0)) throw new Error(`${where}.start must be a number of seconds >= 0`)
    if (!(length > 0)) throw new Error(`${where}.length must be a number of seconds > 0`)
    if (prevStart != null && start < prevStart) throw new Error(`${where} starts before chapters[${i - 1}]; sort chapters by start`)
    if (prevEnd != null && start < prevEnd - 0.001) throw new Error(`${where} starts at ${start}s, inside chapters[${i - 1}] (which ends at ${prevEnd}s)`)
    if (duration > 0 && start + length > duration + 1) throw new Error(`${where} ends at ${start + length}s, after the end of the VOD (${duration}s)`)
    prevStart = start
    prevEnd = start + length
    const t = (c.imageTemplate as string | null) ?? null
    return {
      gameId: c.gameId ?? null, name: c.name ?? null, image: t ? t.replace('{width}', '40').replace('{height}', '53') : null,
      imageTemplate: t, duration: hms(start), start, end: length, length, restricted: !!c.restricted,
      ...(c.kind === 'gap' ? { kind: 'gap' } : {}),
    }
  })
}

// ---- merges and splits (twitch-archive's splices.py, simplified: one upload type, no chat or games rows) ----
interface SpliceRow {
  id: number; kind: 'merge' | 'split'; vodId: string; otherId: string; offset: number; gap: number | null
  detail: Json; createdAt: string; undoneAt: string | null
  before: Record<string, Json | null>; after: Record<string, string>
}
const splices: SpliceRow[] = []
/** VODs whose rows a splice changed: the public side (`/backend/vods/:id`) answers these from here. */
const spliced = new Set<string>()
const GAP_NAME = 'Technical difficulties'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const durOf = (v: Json) => Number(v.duration_seconds) || secondsOf(v.duration)
const setDur = (v: Json, s: number) => ((v.duration = hms(s)), (v.duration_seconds = s))
const chapterLen = (c: Json) => Number(c.length ?? c.end) || 0
const touches = (o: SpliceRow, sp: SpliceRow) => [o.vodId, o.otherId].some((x) => x === sp.vodId || x === sp.otherId)
const laterThan = (sp: SpliceRow) => splices.filter((o) => !o.undoneAt && o.id > sp.id && touches(o, sp))

function spliceJson(sp: SpliceRow) {
  const { before: _b, after: _a, ...rest } = sp
  return { ...rest, undoable: !sp.undoneAt && laterThan(sp).length === 0 }
}
const splicesOf = (id: string) => splices.filter((sp) => sp.vodId === id || sp.otherId === id).map(spliceJson)
const played = (v: Json) => (((v.youtube as Json[]) ?? []).some((u) => u.type === 'live') ? 'live' : 'vod')

/** Where each part of the played type ends, in VOD time (the site's model: delay at the start, cuts skipped). */
function partEnds(v: Json): { at: number; from: number; to: number }[] {
  const type = played(v)
  const parts = ((v.youtube as Json[]) ?? []).filter((u) => u.type === type).sort((a, b) => a.part - b.part)
  const cuts = ((v.chapters as Json[]) ?? []).filter((c) => c.restricted).map((c) => ({ start: Number(c.start), end: Number(c.start) + chapterLen(c) }))
  const total = parts.reduce((t, u) => t + (Number(u.duration) || 0), 0)
  const delay = Math.max(0, durOf(v) - total - cuts.reduce((t, c) => t + c.end - c.start, 0))
  const out: { at: number; from: number; to: number }[] = []
  let u = 0
  for (const part of parts.slice(0, -1)) {
    u += Number(part.duration) || 0
    let t = u + delay
    for (const c of cuts) if (c.start < t - 0.5) t += c.end - c.start
    const cut = cuts.find((c) => Math.abs(c.start - t) < 1)
    out.push({ at: Math.round(t), from: Math.round(t), to: Math.round(cut ? cut.end : t) })
  }
  return out
}

function recordSplice(kind: SpliceRow['kind'], a: Json, b: Json, offset: number, gap: number | null, before: SpliceRow['before'], detail: Json = {}) {
  const sp: SpliceRow = {
    id: splices.length + 1, kind, vodId: String(a.id), otherId: String(b.id), offset, gap, detail: { offset, gap, ...detail },
    createdAt: iso(), undoneAt: null, before, after: { [a.id]: JSON.stringify(a), [b.id]: JSON.stringify(b) },
  }
  splices.push(sp)
  spliced.add(String(a.id))
  spliced.add(String(b.id))
  locked.add(String(a.id))
  return sp
}

const spliceError = (status: number, msg: string, extra: Json = {}) => Object.assign(new Error(msg), { status, extra })

function mergeVods(a: Json, b: Json, gapIn: unknown) {
  if (a.id === b.id) throw spliceError(400, 'A VOD cannot be merged with itself')
  if (a.merged_into || b.merged_into) throw spliceError(409, `${a.merged_into ? a.id : b.id} is already merged into another VOD`)
  if (Date.parse(b.createdAt) < Date.parse(a.createdAt)) throw spliceError(409, `${b.id} started before ${a.id}; merge the later VOD into the earlier one`)
  const aDur = durOf(a)
  const measured = Math.round((Date.parse(b.createdAt) - Date.parse(a.createdAt)) / 1000) - aDur
  if (gapIn == null && measured < 0) throw spliceError(409, `The VODs overlap by ${-measured}s; pass gap to set the real one`)
  const gap = gapIn == null ? measured : Number(gapIn)
  if (!(gap >= 0) || !Number.isInteger(gap)) throw spliceError(400, 'gap must be a whole number of seconds >= 0')
  const before = { [a.id]: clone(a), [b.id]: clone(b) }
  const offset = aDur + gap
  const shift = (c: Json) => ({ ...c, start: Number(c.start) + offset })
  const gapChapter = gap > 0 ? [{ name: GAP_NAME, gameId: null, image: null, imageTemplate: null, duration: hms(aDur), start: aDur, end: gap, length: gap, restricted: true, kind: 'gap' }] : []
  a.chapters = [...((a.chapters as Json[]) ?? []), ...gapChapter, ...((b.chapters as Json[]) ?? []).map(shift)]
  const count: Record<string, number> = {}
  a.youtube = [...((a.youtube as Json[]) ?? []), ...((b.youtube as Json[]) ?? [])].map((u) => ({ ...u, part: (count[u.type] = (count[u.type] ?? 0) + 1) }))
  a.drive = [...((a.drive as Json[]) ?? []), ...((b.drive as Json[]) ?? [])]
  setDur(a, offset + durOf(b))
  Object.assign(b, { chapters: [], youtube: [], drive: [], games: [], merged_into: { id: a.id, offset } })
  return recordSplice('merge', a, b, offset, gap, before, { playedType: played(a) })
}

function splitVod(a: Json, at: number) {
  if (a.merged_into) throw spliceError(409, `${a.id} is already merged into ${a.merged_into.id}`)
  const join = [...splices].reverse().find((sp) => sp.kind === 'merge' && !sp.undoneAt && sp.vodId === a.id && at >= sp.offset - (sp.gap ?? 0) - 2 && at <= sp.offset + 2)
  if (join) return { undid: undo(join, false) }
  const ends = partEnds(a)
  const hit = ends.find((p) => at >= p.from - 2 && at <= p.to + 2)
  if (!hit) {
    const validPoints = [...ends].sort((x, y) => Math.abs(x.at - at) - Math.abs(y.at - at)).slice(0, 4)
    throw spliceError(409, `${hms(at)} is inside an upload; split where one part ends and the next starts`, { validPoints })
  }
  const cut = Math.round(at)
  let n = 2
  while (vods.has(`${a.id}-${n}`) && !deleted.has(`${a.id}-${n}`)) n++
  const id = `${a.id}-${n}`
  const before: Record<string, Json | null> = { [a.id]: clone(a), [id]: null }
  const type = played(a)
  const parts = ((a.youtube as Json[]) ?? []).filter((u) => u.type === type)
  const idx = ends.indexOf(hit) + 1
  const b: Json = {
    ...clone(a), id, createdAt: new Date(Date.parse(a.createdAt) + cut * 1000).toISOString(),
    chapters: ((a.chapters as Json[]) ?? []).filter((c) => Number(c.start) + chapterLen(c) > cut).map((c) => {
      const start = Math.max(0, Number(c.start) - cut)
      const length = Number(c.start) + chapterLen(c) - cut - start
      return { ...c, start, end: length, length }
    }),
    youtube: parts.slice(idx).map((u, i) => ({ ...u, part: i + 1 })), drive: [], games: [],
  }
  setDur(b, durOf(a) - cut)
  a.chapters = ((a.chapters as Json[]) ?? []).filter((c) => Number(c.start) < cut).map((c) => {
    const length = Math.min(chapterLen(c), cut - Number(c.start))
    return { ...c, end: length, length }
  })
  a.youtube = parts.slice(0, idx)
  setDur(a, cut)
  vods.set(id, b)
  deleted.delete(id)
  return { splice: recordSplice('split', a, b, cut, null, before), newVodId: id }
}

function undo(sp: SpliceRow, force: boolean) {
  const later = laterThan(sp).at(-1)
  if (later) throw spliceError(409, `${later.vodId} was ${later.kind === 'merge' ? 'merged with' : 'split into'} ${later.otherId} since (splice ${later.id}); undo that first`)
  const edited = Object.entries(sp.after).flatMap(([id, was]) => {
    const now = vods.get(id)
    if (!now) return []
    const old = JSON.parse(was) as Json
    return ['title', 'chapters', 'youtube', 'duration'].filter((k) => JSON.stringify(now[k]) !== JSON.stringify(old[k])).map((k) => `${id}.${k}`)
  })
  if (edited.length && !force)
    throw spliceError(409, `Edited since the ${sp.kind}: ${edited.join(', ')}. Undoing it restores the rows as they were before, losing those edits; pass force to do it anyway`, { edited })
  for (const [id, row] of Object.entries(sp.before)) {
    if (row) vods.set(id, clone(row))
    else deleted.add(id)
  }
  sp.undoneAt = iso()
  return spliceJson(sp)
}

export function adminMock(base = '/backend-admin', publicApi = 'https://vods.vexoulz.net/backend'): Plugin {
  return {
    name: 'vods-admin-mock',
    apply: 'serve',
    configureServer(server) {
      const timer = setInterval(advance, 2000)
      timer.unref()
      server.httpServer?.on('close', () => clearInterval(timer))
      // The public API reads the same rows: VODs a mock merge or split changed answer from here.
      server.middlewares.use('/backend', (req, res, next) => {
        const pm = /^\/vods\/([^/?]+)(?:\?.*)?$/.exec(req.url ?? '')
        const id = pm ? decodeURIComponent(pm[1]!) : ''
        if (!pm || !spliced.has(id)) return next()
        if (deleted.has(id)) return send(res, 404, { name: 'NotFound', message: 'No record found', code: 404 })
        const { chaptersLocked: _c, jobs: _j, splices: _s, ...pub } = adminVod(vods.get(id)!)
        return send(res, 200, pub)
      })
      server.middlewares.use(base, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const path = url.pathname
        const method = req.method ?? 'GET'
        const s = sessionOf(req)

        if (path === '/admin/session') {
          if (method === 'GET')
            return send(res, 200, { authenticated: !!s, csrf: s?.csrf ?? null, expiresAt: s ? new Date(s.expires).toISOString() : null, passwordLogin: true })
          if (method === 'POST') {
            const now = Date.now()
            while (failures.length && failures[0]! < now - 300_000) failures.shift()
            if (failures.length >= 5) return send(res, 429, { error: true, msg: 'Too many attempts' }, { 'retry-after': '300' })
            const { password } = await body(req)
            if (password !== 'admin') {
              failures.push(now)
              return fail(res, 401, 'Wrong password')
            }
            const token = randomBytes(24).toString('hex')
            const csrf = randomBytes(16).toString('hex')
            const expires = now + 8 * 3600_000
            sessions.set(token, { csrf, expires })
            return send(res, 200, { authenticated: true, csrf, expiresAt: new Date(expires).toISOString(), passwordLogin: true }, {
              'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
            })
          }
          if (method === 'DELETE') {
            if (s) sessions.delete(s.token)
            res.writeHead(204, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` })
            return res.end()
          }
        }

        // The worker answers 403 for both a missing and an expired session.
        if (!s) return fail(res, 403, 'Session expired; log in again')
        if (method !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) return fail(res, 403, 'Missing or wrong X-CSRF-Token')
        const b: Json = method === 'GET' ? {} : await body(req)
        if (method !== 'GET') {
          res.on('finish', () => {
            if (res.statusCode >= 400) return
            const am = /\/admin\/(vods|jobs)\/([^/]+)/.exec(path)
            const target = am ? `${am[1] === 'vods' ? 'vod' : 'job'}:${am[2]}` : b.vodId ? `vod:${b.vodId}` : null
            audit.unshift({ id: ++auditId, at: iso(), actor: 'password', action: `${method} ${path.replace(/\/\d+/g, '/{id}')}`, target, detail: Object.keys(b).length ? b : null })
          })
        }

        if (path === '/admin/health' && method === 'GET')
          return send(res, 200, {
            worker: { ok: true, runningJobs: jobs.filter((j) => j.state === 'running').length, startedAt: iso(3 * 86400_000) },
            api: { ok: true },
            youtube: { authorized: true, valid: true, error: null, checkedAt: iso(4 * 60_000) },
            live: { live: false, streamId: null, startedAt: null },
            jobs: { counts: counts(), recentFailures: jobs.filter((j) => j.state === 'failed').slice(0, 5).map(json) },
          })
        if (path === '/admin/youtube/auth') return send(res, 200, { url: 'https://accounts.google.com/' })
        if (path === '/admin/kinds') return send(res, 200, KINDS)

        if (path === '/admin/jobs' && method === 'GET') {
          const state = url.searchParams.get('state')
          const wanted = state ? state.split(',').flatMap((x) => GROUPS[x] ?? [x]) : null
          const vodId = url.searchParams.get('vodId')
          const kind = url.searchParams.get('kind')
          const before = Number(url.searchParams.get('before')) || Infinity
          const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
          const data = jobs
            .filter((j) => j.id < before && (!wanted || wanted.includes(j.state)) && (!vodId || j.vodId === vodId) && (!kind || j.kind === kind))
            .slice(0, limit)
          return send(res, 200, { counts: counts(), data: data.map(json) })
        }
        if (path === '/admin/jobs' && method === 'POST') {
          const kind = String(b.kind ?? '')
          if (!KINDS[kind]) return fail(res, 400, `Unknown kind ${kind}`)
          const steps = KINDS[kind]!.steps
          const from = typeof b.fromStep === 'string' && b.fromStep ? steps.indexOf(b.fromStep) : 0
          if (from < 0) return fail(res, 400, `Unknown step ${b.fromStep}`)
          const job = add(kind, b.vodId ? String(b.vodId) : null, b.paused ? 'paused' : 'queued', from, 0, {
            payload: (b.payload as Record<string, unknown>) ?? {},
            pauseBefore: Array.isArray(b.pauseBefore) ? (b.pauseBefore as string[]) : null,
          })
          return ok(res, `Job ${job.id} ${job.kind} ${job.state} at step ${job.step}`, job)
        }

        const m = /^\/admin\/jobs\/(\d+)(?:\/([\w-]+))?$/.exec(path)
        const job = m ? jobs.find((j) => j.id === Number(m[1])) : undefined
        if (m && !job) return fail(res, 404, 'No such job')
        if (m && job) {
          const action = m[2]
          if (!action && method === 'GET') return send(res, 200, json(job))
          if (!action && method === 'PATCH') {
            if ('pauseBefore' in b) job.pauseBefore = (b.pauseBefore as string[] | null) ?? null
            if ('pauseNext' in b) job.pauseNext = !!b.pauseNext
            return send(res, 200, json(job))
          }
          if (action === 'events') {
            const after = Number(url.searchParams.get('after')) || 0
            const data = (events.get(job.id) ?? []).filter((e) => e.seq > after).slice(0, 500)
            return send(res, 200, { data, next: data.length ? data[data.length - 1]!.seq : after })
          }
          if (action === 'pause') {
            if (job.state === 'queued') job.state = 'paused'
            else if (job.state === 'running') job.pauseNext = true
            else return fail(res, 409, `Job is ${job.state}; only queued or running jobs can be paused`)
            log(job, 'Pause requested', 'warning')
            return ok(res, job.state === 'paused' ? `Job ${job.id} paused at step ${job.step}` : `Job ${job.id} will pause when step ${job.step} finishes`, job)
          }
          if (action === 'resume') {
            if (job.state !== 'paused') return fail(res, 409, `Job is ${job.state}; only paused jobs can be resumed`)
            job.state = 'queued'
            job.pauseNext = !!b.once
            log(job, 'Resumed')
            return ok(res, `Job ${job.id} resumed at step ${job.step}`, job)
          }
          if (action === 'retry') {
            job.state = 'queued'
            job.attempts++
            job.lastError = null
            log(job, 'Retried')
            return ok(res, `Job ${job.id} re-queued from step ${job.step}`, job)
          }
          if (action === 'cancel') {
            if (!['queued', 'paused', 'running'].includes(job.state)) return fail(res, 409, `Job is ${job.state}`)
            job.state = 'cancelled'
            log(job, 'Cancelled', 'warning')
            return ok(res, `Job ${job.id} cancelled`, job)
          }
        }
        // ---- VODs ----
        const vm = /^\/admin\/vods\/([^/]+)(?:\/([\w-]+))?$/.exec(path)
        if (vm) {
          const id = decodeURIComponent(vm[1]!)
          const vod = await vodOf(publicApi, id)
          if (!vod) return fail(res, 404, 'No Vod Data')
          const part = vm[2]
          try {
            if (!part && method === 'GET') return send(res, 200, adminVod(vod))
            if (part === 'merge-candidates' && method === 'GET') {
              // The worker lists VODs that started up to 30 minutes after this one ended. Real back-to-back VODs are
              // rare, so the mock offers the next three whatever the gap, to have something to show.
              const aDur = durOf(vod)
              const ends = Date.parse(vod.createdAt) + aDur * 1000
              const page = (await publicJson(publicApi, `/vods?createdAt[$gt]=${encodeURIComponent(vod.createdAt)}&$sort[createdAt]=1&$limit=3`)) as { data: Json[] }
              const norm = (t: unknown) => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
              return send(res, 200, {
                vod: { id: vod.id, streamId: vod.stream_id ?? null, title: vod.title, createdAt: vod.createdAt, duration: vod.duration, endsAt: new Date(ends).toISOString(), mergedInto: vod.merged_into ?? null },
                withinMinutes: 30,
                candidates: page.data.filter((c) => !vods.get(String(c.id))?.merged_into && !deleted.has(String(c.id))).map((c) => {
                  const gap = Math.round((Date.parse(c.createdAt) - Date.parse(vod.createdAt)) / 1000) - aDur
                  return { id: c.id, streamId: c.stream_id ?? null, title: c.title, createdAt: c.createdAt, duration: c.duration, gap, overlaps: gap < 0, titlesMatch: norm(c.title) === norm(vod.title) }
                }),
              })
            }
            if (part === 'merge' && method === 'POST') {
              const src = await vodOf(publicApi, String(b.source ?? ''))
              if (!src) return fail(res, 404, `No Vod Data for ${b.source}`)
              const sp = mergeVods(vod, src, b.gap)
              return send(res, 200, { error: false, msg: `Merged ${src.id} into ${id} at ${sp.offset}s`, splice: spliceJson(sp), warnings: [], vod: adminVod(vod) })
            }
            if (part === 'unmerge' && method === 'POST') {
              const sp = [...splices].reverse().find((x) => x.kind === 'merge' && !x.undoneAt && x.vodId === id && x.otherId === String(b.source))
              if (!sp) return fail(res, 404, `${b.source} is not merged into ${id}`)
              const out = undo(sp, !!b.force)
              return send(res, 200, { error: false, msg: `Unmerged ${sp.otherId} from ${id}`, splice: out, vod: adminVod(vods.get(id)!) })
            }
            if (part === 'split' && method === 'POST') {
              if (typeof b.at !== 'number') return fail(res, 400, 'at must be a number of seconds')
              const r = splitVod(vod, b.at)
              if (r.undid)
                return send(res, 200, { error: false, msg: `${b.at}s is where ${r.undid.otherId} was merged in; undid that merge`, undid: 'merge', splice: r.undid, vod: adminVod(vods.get(id)!) })
              return send(res, 200, { error: false, msg: `Split ${id} at ${r.splice.offset}s into ${r.newVodId}`, splice: spliceJson(r.splice), newVodId: r.newVodId, vod: adminVod(vods.get(id)!) })
            }
            if (part === 'unsplit' && method === 'POST') {
              const sp = [...splices].reverse().find((x) => x.kind === 'split' && !x.undoneAt && x.vodId === id && (!b.source || x.otherId === String(b.source)))
              if (!sp) return fail(res, 404, `${id} has no split to undo`)
              const out = undo(sp, !!b.force)
              return send(res, 200, { error: false, msg: `Joined ${sp.otherId} back into ${id}`, splice: out, vod: adminVod(vods.get(id)!) })
            }
            if (!part && method === 'PATCH') {
              if (typeof b.title !== 'string' || !b.title.trim()) return fail(res, 400, 'title must be a non-empty string')
              vod.title = b.title.trim()
              return send(res, 200, adminVod(vod))
            }
            if (part === 'chapters' && method === 'PUT') {
              if (typeof b.locked !== 'boolean') return fail(res, 400, 'locked must be true or false')
              vod.chapters = checkChapters(b.chapters, Number(vod.duration_seconds) || secondsOf(vod.duration))
              if (b.locked) locked.add(id)
              else locked.delete(id)
              return send(res, 200, adminVod(vod))
            }
            if (part === 'youtube' && method === 'PUT') {
              const old = new Map<unknown, Json>(((vod.youtube as Json[]) ?? []).map((y) => [y.id, y]))
              vod.youtube = ((b.youtube as Json[]) ?? []).map((y) => ({
                id: y.id, type: y.type, duration: y.duration ?? old.get(y.id)?.duration ?? null, part: y.part,
                thumbnail_url: old.get(y.id)?.thumbnail_url ?? `https://i.ytimg.com/vi/${y.id}/mqdefault.jpg`,
              }))
              return send(res, 200, adminVod(vod))
            }
            if (part === 'drive' && method === 'PUT') {
              vod.drive = ((b.drive as Json[]) ?? []).map((d) => ({ id: d.id, type: d.type }))
              return send(res, 200, adminVod(vod))
            }
            if (part === 'emotes' && method === 'GET') {
              if (!emoteRows.has(id)) {
                const page = (await publicJson(publicApi, `/emotes?vod_id=${encodeURIComponent(id)}&$limit=1`)) as { data: Json[] }
                emoteRows.set(id, page.data[0] ?? null)
              }
              return send(res, 200, emoteRows.get(id))
            }
          } catch (e) {
            const err = e as Error & { status?: number; extra?: Json }
            return send(res, err.status ?? 400, { error: true, msg: err.message, ...(err.extra ?? {}) })
          }
        }
        if (path === '/admin/twitch/games') {
          const q = (url.searchParams.get('query') ?? '').trim().toLowerCase()
          if (!q) return fail(res, 400, 'Missing parameter: query')
          // Stand-in for Helix category search: the archive's own games.
          const games = (await publicJson(publicApi, '/v1/games-played')) as Json[]
          return send(res, 200, games
            .filter((g) => g.gameId && String(g.name).toLowerCase().includes(q))
            .slice(0, 10)
            .map((g) => ({ gameId: g.gameId, name: g.name, imageTemplate: g.imageTemplate ?? null })))
        }
        if (path === '/admin/audit') {
          const before = Number(url.searchParams.get('before')) || Infinity
          const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
          return send(res, 200, { data: audit.filter((a) => (a.id as number) < before).slice(0, limit) })
        }

        // ---- the worker's VOD routes: each starts a job ----
        const vodId = b.vodId ? String(b.vodId) : ''
        const start = (kind: string, msg: string) => ok(res, msg, add(kind, vodId || null, 'queued', 0, 0, { payload: { ...b } }))
        if (method === 'POST' || method === 'DELETE') {
          const needsVod = ['/admin/chapters', '/admin/emotes', '/admin/logs', '/admin/duration', '/admin/youtube/parts', '/admin/download', '/admin/reupload', '/admin/delete']
          if (needsVod.includes(path) && !(await vodOf(publicApi, vodId))) return fail(res, 404, 'No Vod Data')
          // A merged or split VOD no longer matches Twitch's VOD of that id: the worker refuses to re-fetch it.
          const twitch = ['/admin/chapters', '/admin/emotes', '/admin/logs', '/admin/duration', '/admin/download', '/admin/reupload', '/admin/delete', '/admin/hls/download']
          if (twitch.includes(path) && (vods.get(vodId)?.merged_into || splicesOf(vodId).some((sp) => !sp.undoneAt)))
            return fail(res, 409, `vod ${vodId} was merged or split; it no longer matches Twitch's VOD of that id`)
          switch (path) {
            case '/admin/chapters': return start('chapters', `Saving Chapters for ${vodId}`)
            case '/admin/emotes': return start('emotes', b.force ? 'Saving emotes (overwriting)..' : 'Saving emotes..')
            case '/admin/emotes/backfill': return start('global_emotes_backfill', 'Backfilling global emotes..')
            case '/admin/logs': return start('chat', 'Getting logs..')
            case '/admin/youtube/parts': return start('describe', `Updating YouTube descriptions for ${vodId}`)
            case '/admin/download': return start('download', 'Starting download..')
            case '/admin/reupload': return start('reupload', `Re-uploading ${vodId} part ${b.part}..`)
            case '/admin/hls/download': return start('archive', `Downloading ${vodId} via HLS..`)
            case '/admin/generate/vod': return start('chapters', `Created vod ${vodId}`)
            case '/admin/duration': return send(res, 200, { error: false, msg: 'Saved duration!', duration: (await vodOf(publicApi, vodId))!.duration })
            case '/admin/delete':
              deleted.add(vodId)
              return send(res, 200, { error: false, msg: `Deleted ${vodId} (vod, logs, emotes, games)` })
          }
        }
        return fail(res, 404, 'Not in the dev mock')
      })
    },
  }
}
