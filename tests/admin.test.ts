import { describe, expect, it, vi } from 'vitest'
import { AdminApiError, AdminClient, jobActions, type Job } from '@/admin/api'
import { ago, stepPosition, stepStates } from '@/admin/format'

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers }),
  )
}

describe('AdminClient', () => {
  it('sends CSRF only on changes, and builds query strings without empty filters', async () => {
    const fetch = fakeFetch(200, { counts: {}, data: [] })
    const c = new AdminClient({ base: '/backend-admin/', fetch })
    c.csrf = 'tok'
    await c.jobs({ state: 'active', kind: '', vodId: undefined, before: 40 })
    await c.pause(7)
    const [url1, init1] = fetch.mock.calls[0]!
    expect(url1).toBe('/backend-admin/admin/jobs?state=active&before=40')
    expect((init1!.headers as Record<string, string>)['x-csrf-token']).toBeUndefined()
    const [url2, init2] = fetch.mock.calls[1]!
    expect(url2).toBe('/backend-admin/admin/jobs/7/pause')
    expect(init2!.method).toBe('POST')
    expect((init2!.headers as Record<string, string>)['x-csrf-token']).toBe('tok')
  })

  it('turns worker errors into AdminApiError with the message and Retry-After', async () => {
    const c = new AdminClient({ base: '', fetch: fakeFetch(429, { error: true, msg: 'Too many attempts' }, { 'retry-after': '120' }) })
    const err = await c.login('x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AdminApiError)
    expect(err).toMatchObject({ status: 429, message: 'Too many attempts', retryAfter: 120 })
  })

  it('reports an expired session, but not a failed login', async () => {
    const c = new AdminClient({ base: '', fetch: fakeFetch(401, { error: true, msg: 'Not logged in' }) })
    const expired = vi.fn()
    c.onUnauthorized = expired
    await c.login('wrong').catch(() => {})
    expect(expired).not.toHaveBeenCalled()
    await c.health().catch(() => {})
    expect(expired).toHaveBeenCalledOnce()
  })

  it('handles 204 and non-JSON error bodies', async () => {
    const ok = new AdminClient({ base: '', fetch: vi.fn(async () => new Response(null, { status: 204 })) })
    await expect(ok.logout()).resolves.toBeUndefined()
    const bad = new AdminClient({ base: '', fetch: vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })) })
    await expect(bad.health()).rejects.toMatchObject({ status: 502, message: 'HTTP 502' })
  })
})

const job = (over: Partial<Job>): Job => ({
  id: 1, kind: 'archive', vodId: '1', state: 'running', step: 'split', attempts: 1, lastError: null, payload: {},
  notBefore: null, pauseBefore: null, pauseNext: false, steps: ['capture', 'split', 'upload'], createdAt: null, updatedAt: null,
  ...over,
})

describe('job helpers', () => {
  it('marks steps before, at and after the current one', () => {
    expect(stepStates(job({ pauseBefore: ['upload'] }))).toEqual([
      { name: 'capture', status: 'done', pauseBefore: false },
      { name: 'split', status: 'running', pauseBefore: false },
      { name: 'upload', status: 'todo', pauseBefore: true },
    ])
    expect(stepStates(job({ state: 'done', step: null })).every((s) => s.status === 'done')).toBe(true)
    expect(stepPosition(job({ state: 'failed', step: 'upload' }))).toEqual({ index: 2, total: 3 })
  })

  it('offers only the actions the worker allows', () => {
    expect(jobActions({ state: 'paused' })).toEqual({ pause: false, resume: true, retry: false, cancel: true })
    expect(jobActions({ state: 'done' })).toEqual({ pause: false, resume: false, retry: false, cancel: false })
    expect(jobActions({ state: 'failed' }).retry).toBe(true)
  })

  it('formats relative times', () => {
    const now = Date.parse('2026-09-25T12:00:00Z')
    expect(ago('2026-09-25T11:59:30Z', now)).toBe('30s ago')
    expect(ago('2026-09-25T11:00:00Z', now)).toBe('1 h ago')
    expect(ago('2026-09-20T11:00:00Z', now)).toBe('2026-09-20')
    expect(ago(null, now)).toBe('—')
  })
})
