import { describe, it, expect } from 'vitest'
import { summarise, estimateMinutes, needsResume, buildItems, friendlyError, STALE_MS } from '../campaign-jobs-rules'
import { advanceJob } from '../campaign-jobs'

const it_ = (status, extra = {}) => ({ id: Math.random().toString(36).slice(2), status, ...extra })

describe('campaign job rules', () => {
  it('summarises item states', () => {
    const s = summarise([it_('done'), it_('failed'), it_('running'), it_('queued')])
    expect(s).toMatchObject({ done: 1, failed: 1, running: 1, queued: 1, total: 4, finished: 2, active: true })
    expect(summarise([it_('done'), it_('failed')]).active).toBe(false)
  })

  it('estimates two minutes per remaining post', () => {
    expect(estimateMinutes([it_('done'), it_('running'), it_('queued'), it_('queued')])).toBe(6)
  })

  it('asks for a resume only when nothing is moving or the running item is stale', () => {
    const now = Date.now()
    expect(needsResume([it_('queued'), it_('queued')], now)).toBe(true)                 // nothing running
    expect(needsResume([it_('running', { started_at: new Date(now - 60000).toISOString() }), it_('queued')], now)).toBe(false)
    expect(needsResume([it_('running', { started_at: new Date(now - STALE_MS - 1000).toISOString() })], now)).toBe(true)
    expect(needsResume([it_('done'), it_('failed')], now)).toBe(false)                   // finished
  })

  it('builds ordered items and clamps carousel slides', () => {
    const items = buildItems([
      { topic: ' A ', platforms: ['LinkedIn'], isCarousel: true, slideCount: 99 },
      { topic: 'B', platforms: ['X'], tone: 'casual' },
    ], 'job1')
    expect(items[0]).toMatchObject({ job_id: 'job1', position: 1, topic: 'A', slide_count: 10, is_carousel: true })
    expect(items[1]).toMatchObject({ position: 2, tone: 'casual', slide_count: null, is_carousel: false })
  })

  it('never shows raw upstream errors to clients', () => {
    expect(friendlyError({ status: 'failed', error: '500 {"stack":"secret"}' })).toBe('Generation failed for this topic. You can retry it.')
    expect(friendlyError({ status: 'failed', error: 'Timed out waiting for the generator.' })).toMatch(/^Timed out/)
    expect(friendlyError({ status: 'done' })).toBeNull()
  })
})

function fakeDeps(initial, n8n) {
  const rows = initial.map((status, i) => ({ id: `i${i}`, position: i + 1, status, platforms: ['LinkedIn'], topic: `t${i}` }))
  const state = { done: false, logs: [] }
  return {
    state, rows,
    async claim() {
      if (rows.some(i => i.status === 'running')) return null
      const next = rows.find(i => i.status === 'queued')
      if (next) next.status = 'running'
      return next || null
    },
    async items() { return rows.map(i => ({ ...i })) },
    async finish(id, patch) { Object.assign(rows.find(i => i.id === id), patch) },
    async markDone() { state.done = true },
    async log(item, r) { state.logs.push([item.id, r.ok]) },
    async callN8n(item) { return n8n(item) },
  }
}

describe('advanceJob', () => {
  it('runs one item per call, in order, and finishes the job after the last', async () => {
    const d = fakeDeps(['queued', 'queued'], async () => ({ ok: true }))
    const a = await advanceJob(d, 'j')
    expect(a).toMatchObject({ advanced: true, more: true })
    expect(d.rows.map(i => i.status)).toEqual(['done', 'queued'])
    expect(d.state.done).toBe(false)
    const b = await advanceJob(d, 'j')
    expect(b).toMatchObject({ advanced: true, more: false })
    expect(d.state.done).toBe(true)
  })

  it('records a failure and carries on to the next topic', async () => {
    const d = fakeDeps(['queued', 'queued'], async item => item.id === 'i0' ? { ok: false, error: '500 boom' } : { ok: true })
    await advanceJob(d, 'j'); await advanceJob(d, 'j')
    expect(d.rows.map(i => i.status)).toEqual(['failed', 'done'])
    expect(d.rows[0].error).toBe('500 boom')
    expect(d.state.done).toBe(true)
  })

  it('turns a thrown error into a failed item', async () => {
    const d = fakeDeps(['queued'], async () => { throw new Error('network down') })
    await advanceJob(d, 'j')
    expect(d.rows[0]).toMatchObject({ status: 'failed', error: 'network down' })
  })

  it('does nothing while another item is already running', async () => {
    const d = fakeDeps(['running', 'queued'], async () => ({ ok: true }))
    const r = await advanceJob(d, 'j')
    expect(r.advanced).toBe(false)
    expect(d.rows.map(i => i.status)).toEqual(['running', 'queued'])
    expect(d.state.done).toBe(false)
  })
})
