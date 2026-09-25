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
const KINDS: Record<string, { steps: string[]; manualSteps: string[] }> = {
  archive: { steps: ['vod', 'capture', 'finalize', 'emotes', 'chat', 'chapters', 'split', 'upload', 'describe'], manualSteps: [] },
  download: { steps: ['download', 'split', 'upload'], manualSteps: [] },
  reupload: { steps: ['split', 'upload', 'describe'], manualSteps: ['upload'] },
  chapters: { steps: ['chapters'], manualSteps: [] },
  emotes: { steps: ['emotes'], manualSteps: [] },
  dmca: { steps: ['mute', 'split', 'upload'], manualSteps: ['upload'] },
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

export function adminMock(base = '/backend-admin'): Plugin {
  return {
    name: 'vods-admin-mock',
    apply: 'serve',
    configureServer(server) {
      const timer = setInterval(advance, 2000)
      timer.unref()
      server.httpServer?.on('close', () => clearInterval(timer))
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

        if (!s) return fail(res, 401, 'Not logged in')
        if (method !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) return fail(res, 403, 'Bad CSRF token')

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
          const b = await body(req)
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

        const m = /^\/admin\/jobs\/(\d+)(?:\/(\w+))?$/.exec(path)
        const job = m ? jobs.find((j) => j.id === Number(m[1])) : undefined
        if (m && !job) return fail(res, 404, 'No such job')
        if (m && job) {
          const action = m[2]
          if (!action && method === 'GET') return send(res, 200, json(job))
          if (!action && method === 'PATCH') {
            const b = await body(req)
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
            const b = await body(req)
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
        return fail(res, 404, 'Not in the dev mock')
      })
    },
  }
}
