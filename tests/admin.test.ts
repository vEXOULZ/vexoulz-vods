import { describe, expect, it, vi } from 'vitest'
import { AdminApiError, AdminClient, jobActions, type Job } from '@/admin/api'
import { stepPosition, stepStates } from '@/admin/format'

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

  it('starts bot chat for one VOD, and backfills all or only some', async () => {
    const fetch = fakeFetch(200, { error: false, msg: 'ok', jobId: 3 })
    const c = new AdminClient({ base: '', fetch })
    await c.botChat('123')
    await c.botChatBackfill()
    await c.botChatBackfill(['1', '2'])
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body])
    expect(sent).toEqual([
      ['/admin/bot-chat', 'POST', JSON.stringify({ vodId: '123' })],
      ['/admin/bot-chat/backfill', 'POST', JSON.stringify({})],
      ['/admin/bot-chat/backfill', 'POST', JSON.stringify({ vodIds: ['1', '2'] })],
    ])
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

})

describe('AdminClient: VODs, games, settings and storage', () => {
  it('lists VODs with only the filters given, and patches, reads and replaces games', async () => {
    const fetch = fakeFetch(200, { data: [], next: null })
    const c = new AdminClient({ base: '', fetch })
    await c.vods({ q: 'doom', hidden: false, limit: 30, before: undefined })
    await c.vods({ hidden: true })
    await c.updateVod('12', { hidden: true, thumbnailUrl: null })
    await c.games('12')
    await c.saveGames('12', [{ start_time: 0, end_time: 60, game_id: '1', game_name: 'Doom' }])
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/admin/vods?q=doom&hidden=false&limit=30', 'GET', null],
      ['/admin/vods?hidden=true', 'GET', null],
      ['/admin/vods/12', 'PATCH', JSON.stringify({ hidden: true, thumbnailUrl: null })],
      ['/admin/vods/12/games', 'GET', null],
      ['/admin/vods/12/games', 'PUT', JSON.stringify({ games: [{ start_time: 0, end_time: 60, game_id: '1', game_name: 'Doom' }] })],
    ])
  })

  it('reads, saves and resets settings, and reads and deletes storage', async () => {
    const fetch = fakeFetch(200, { data: [] })
    const c = new AdminClient({ base: '', fetch })
    await c.settings()
    await c.saveSettings({ runner_concurrency: 2, vod_download: false })
    await c.resetSetting('runner_concurrency')
    await c.storage()
    await c.storage(true)
    await c.deleteFolder('vods', '123')
    const sent = fetch.mock.calls.map(([url, init]) => [url, init!.method, init!.body ?? null])
    expect(sent).toEqual([
      ['/admin/settings', 'GET', null],
      ['/admin/settings', 'PATCH', JSON.stringify({ runner_concurrency: 2, vod_download: false })],
      ['/admin/settings/runner_concurrency', 'DELETE', null],
      ['/admin/storage', 'GET', null],
      ['/admin/storage?refresh=true', 'GET', null],
      ['/admin/storage/vods/123', 'DELETE', null],
    ])
  })
})
