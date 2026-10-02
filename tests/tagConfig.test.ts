import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminClient } from '@/admin/api'
import { blankDraft, draftOf, draftsOf, previewOf, rawOf, tagChanges } from '@/admin/tags'
import { fromRaw, loadTagConfig, tagConfig, type RawTag } from '@/lib/vodTags'
import { site } from '@/vods.config'

const raw = (o: Partial<RawTag> = {}): RawTag => ({ name: 'new', label: 'new', drawn: true, color: null, shape: null, width: null, height: null, ...NO_TEXT, ...o })
const NO_TEXT = { text: null, textColor: null, textSize: null, textX: null, textY: null }
const json = (status: number, body: unknown) => vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body), { status }))

afterEach(() => {
  tagConfig.value = site.tags
})

describe('fromRaw', () => {
  it('resolves shapes against the API and keeps only safe values', () => {
    const out = fromRaw(
      [
        raw({ color: 'var(--vx-ok)', shape: 'v1/site/tags/new.svg?v=ab12', width: 80, height: 300 }),
        raw({ name: 'x', label: '', color: 'red;background:url(//evil)', shape: 'https://evil/x.svg' }),
        raw({ name: 'Bad Name' }),
      ],
      '/backend/',
    )
    expect(out.new).toEqual({ label: 'new', drawn: true, color: 'var(--vx-ok)', shape: '/backend/v1/site/tags/new.svg?v=ab12', width: 80, height: undefined })
    expect(out.x).toEqual({ label: 'x', drawn: true, color: undefined, shape: null, width: undefined, height: undefined })
    expect(Object.keys(out)).toEqual(['new', 'x'])
  })
  it('takes the text on a tag, within its limits', () => {
    const out = fromRaw(
      [
        raw({ text: '  100%  ', textColor: 'var(--vx-ink)', textSize: 12, textX: -3, textY: 2 }),
        raw({ name: 'x', text: 'y'.repeat(30), textColor: 'url(x)', textSize: 99, textX: 1.5, textY: 500 }),
      ],
      '',
    )
    expect(out.new).toMatchObject({ text: '100%', textColor: 'var(--vx-ink)', textSize: 12, textX: -3, textY: 2 })
    expect(out.x).toMatchObject({ text: 'y'.repeat(24), textColor: undefined, textSize: undefined, textX: undefined, textY: undefined })
  })
})

describe('loadTagConfig', () => {
  it('takes the archive’s tags', async () => {
    const f = json(200, { tags: [raw({ name: 'speedrun', label: 'speedrun', color: '#ff0' })] })
    await loadTagConfig(f as unknown as typeof fetch, '/backend')
    expect(f.mock.calls[0]![0]).toBe('/backend/v1/site/tags')
    expect(Object.keys(tagConfig.value)).toEqual(['speedrun'])
  })
  it('keeps the built-in tags when the archive has none', async () => {
    await loadTagConfig(json(404, { message: 'No record found' }) as unknown as typeof fetch, '/backend')
    expect(tagConfig.value).toBe(site.tags)
    await loadTagConfig((async () => { throw new Error('offline') }) as unknown as typeof fetch, '/backend')
    expect(tagConfig.value).toBe(site.tags)
  })
})

describe('tagChanges', () => {
  const saved = [raw({ color: 'var(--vx-accent)' }), raw({ name: 'compilation', label: 'playthrough', drawn: false })]
  it('sees no change in what was loaded', () => {
    const r = tagChanges(saved, saved.map((t) => draftOf(t)))
    expect(r.changed).toBe(false)
    expect(r.errors.size).toBe(0)
  })
  it('builds the list to save, sizes as numbers and empty as null', () => {
    const drafts = saved.map((t) => draftOf(t))
    drafts[0]!.width = '70'
    drafts[1]!.color = ' #abcdef '
    const r = tagChanges(saved, drafts)
    expect(r.changed).toBe(true)
    expect(r.body).toEqual([
      { name: 'new', label: 'new', drawn: true, color: 'var(--vx-accent)', width: 70, height: null, ...NO_TEXT },
      { name: 'compilation', label: 'playthrough', drawn: false, color: '#abcdef', width: null, height: null, ...NO_TEXT },
    ])
  })
  it('takes sizes as the number inputs give them', () => {
    const drafts = saved.map((t) => draftOf(t))
    drafts[0]!.height = 32
    drafts[1]!.width = 7
    const r = tagChanges(saved, drafts)
    expect(r.body[0]!.height).toBe(32)
    expect(r.errors.get(drafts[1]!.key)).toEqual({ width: expect.any(String) })
    expect(previewOf(drafts[0]!, '/backend').height).toBe(32)
  })
  it('flags bad fields by draft', () => {
    const a = blankDraft()
    const b = Object.assign(blankDraft(), { name: 'new', label: 'x', color: 'url(x)', width: '7', height: '20.5' })
    const r = tagChanges(saved, [draftOf(saved[0]!), a, b])
    expect(r.errors.get(a.key)).toEqual({ name: expect.any(String), label: 'Needs a label' })
    expect(Object.keys(r.errors.get(b.key)!)).toEqual(['name', 'color', 'width', 'height'])
    expect(r.errors.get(b.key)!.name).toBe('Another tag has this name')
  })
  it('saves text only while it is on', () => {
    const drafts = saved.map((t) => draftOf(t))
    Object.assign(drafts[0]!, { textOn: true, text: ' 100% ', textColor: 'var(--vx-ink)', textSize: 12, textX: '-4', textY: '' })
    Object.assign(drafts[1]!, { textOn: false, text: 'kept', textSize: '999' })
    const r = tagChanges(saved, drafts)
    expect(r.errors.size).toBe(0)
    expect(r.body[0]).toMatchObject({ text: '100%', textColor: 'var(--vx-ink)', textSize: 12, textX: -4, textY: null })
    expect(r.body[1]).toMatchObject(NO_TEXT)
    expect(previewOf(drafts[0]!, '').text).toBe('100%')
    expect(previewOf(drafts[1]!, '').text).toBeUndefined()
    // Loaded back, the text is on again.
    expect(draftOf({ ...saved[0]!, ...r.body[0]!, shape: null })).toMatchObject({ textOn: true, text: '100%', textX: '-4' })
  })
  it('flags bad text fields', () => {
    const d = Object.assign(draftOf(saved[0]!), { textOn: true, text: ' ', textColor: 'url(x)', textSize: 5, textX: 101, textY: '1.5' })
    const r = tagChanges(saved, [d, draftOf(saved[1]!)])
    expect(Object.keys(r.errors.get(d.key)!)).toEqual(['text', 'textColor', 'textSize', 'textX', 'textY'])
  })
  it('starts from site.tags and previews a draft', () => {
    const list = rawOf(site.tags)
    expect(list.map((t) => t.name)).toEqual(['new', 'updated', 'complete', 'compilation'])
    const d = draftOf(raw({ shape: 'v1/site/tags/new.svg?v=1', width: '' as never, color: 'nope(' }))
    expect(previewOf(d, '/backend')).toMatchObject({ shape: '/backend/v1/site/tags/new.svg?v=1', color: undefined, width: undefined })
  })
})

describe('draftsOf', () => {
  it('always lists the auto tags, and only those are auto', () => {
    const drafts = draftsOf([raw({ name: 'complete', label: 'complete' }), raw({ name: 'updated', label: 'fresh' })])
    expect(drafts.map((d) => [d.name, d.auto, d.saved])).toEqual([
      ['complete', false, true],
      ['updated', true, true],
      ['new', true, false],
      ['compilation', true, false],
    ])
    expect(drafts[1]!.label).toBe('fresh')
    expect(blankDraft().auto).toBe(false)
  })
  it('makes a list missing an auto tag a change to save', () => {
    const saved = [raw({ name: 'complete', label: 'complete' })]
    expect(tagChanges(saved, draftsOf(saved)).changed).toBe(true)
  })
})

describe('AdminClient site tags', () => {
  it('sends an SVG as itself, with CSRF', async () => {
    const f = json(200, { tags: [], updatedAt: null, updatedBy: null })
    const c = new AdminClient({ base: '', fetch: f })
    c.csrf = 't'
    await c.uploadTagShape('new tag', new Blob(['<svg/>'], { type: 'image/svg+xml' }))
    await c.uploadTagShape('new', new Blob(['<svg/>']))
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/admin/site/tags/new%20tag/shape')
    expect(init!.method).toBe('PUT')
    expect(init!.body).toBeInstanceOf(Blob)
    expect((init!.headers as Record<string, string>)['content-type']).toBe('image/svg+xml')
    expect((init!.headers as Record<string, string>)['x-csrf-token']).toBe('t')
    expect((f.mock.calls[1]![1]!.headers as Record<string, string>)['content-type']).toBe('image/svg+xml')
  })
})
