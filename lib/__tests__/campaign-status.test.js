import { describe, it, expect } from 'vitest'
import { platformStatus, topicStage, summariseCampaign, buildRows } from '../campaign-status'

const item = (o = {}) => ({ id: 'i1', position: 1, topic: 'T', platforms: ['LinkedIn', 'Twitter'], status: 'done', ...o })
const post = (o = {}) => ({
  id: 'p1', campaign_item_id: 'i1', posting_status: 'PENDING', created_at: '2026-11-26T10:00:00Z',
  linkedin_posted: 'NO', twitter_posted: 'NO', instagram_posted: 'NO',
  linkedin_scheduled_time: '2026-11-27T08:00:00Z', twitter_scheduled_time: '2026-11-27T09:00:00Z', ...o,
})

describe('platformStatus', () => {
  it('reports published, scheduled and review per platform', () => {
    expect(platformStatus(post({ linkedin_posted: 'YES', linkedin_posted_at: 'x' }), 'LinkedIn')).toMatchObject({ state: 'published', at: 'x' })
    expect(platformStatus(post(), 'Twitter')).toMatchObject({ state: 'scheduled', at: '2026-11-27T09:00:00Z' })
    expect(platformStatus(post({ posting_status: 'AWAITING_APPROVAL' }), 'Twitter').state).toBe('review')
  })
  it('flags a finished post that never went to a platform', () => {
    expect(platformStatus(post({ posting_status: 'DONE', linkedin_posted: 'YES' }), 'Twitter').state).toBe('missed')
  })
  it('handles failures, pauses and a missing post', () => {
    expect(platformStatus(post({ posting_status: 'FAILED' }), 'Twitter').state).toBe('failed')
    expect(platformStatus(post({ posting_status: 'HALTED' }), 'Twitter').label).toBe('Paused')
    expect(platformStatus(null, 'Twitter').state).toBe('waiting')
  })
})

describe('topicStage', () => {
  it('follows generation first', () => {
    expect(topicStage(item({ status: 'queued' }), null).stage).toBe('generating')
    expect(topicStage(item({ status: 'running' }), null).stage).toBe('generating')
    expect(topicStage(item({ status: 'failed' }), null).stage).toBe('generation_failed')
  })
  it('marks a generated topic with no linked post as untracked', () => {
    expect(topicStage(item(), null).stage).toBe('untracked')
  })
  it('walks review, scheduled, published', () => {
    expect(topicStage(item(), post({ posting_status: 'AWAITING_APPROVAL' })).stage).toBe('review')
    expect(topicStage(item(), post()).stage).toBe('scheduled')
    expect(topicStage(item(), post({ posting_status: 'DONE', linkedin_posted: 'YES', twitter_posted: 'YES' })).stage).toBe('published')
  })
  it('separates partly published and failed', () => {
    expect(topicStage(item(), post({ posting_status: 'DONE', linkedin_posted: 'YES' })).stage).toBe('partly')
    expect(topicStage(item(), post({ posting_status: 'FAILED', linkedin_posted: 'YES' })).stage).toBe('failed')
  })
})

describe('summariseCampaign and buildRows', () => {
  it('counts what is left', () => {
    const items = [item({ id: 'a', position: 1 }), item({ id: 'b', position: 2 }), item({ id: 'c', position: 3, status: 'queued' })]
    const posts = [
      post({ id: 'pa', campaign_item_id: 'a', posting_status: 'DONE', linkedin_posted: 'YES', twitter_posted: 'YES' }),
      post({ id: 'pb', campaign_item_id: 'b' }),
    ]
    const s = summariseCampaign(buildRows(items, posts))
    expect(s).toMatchObject({ total: 3, published: 1, scheduled: 1, generating: 1, finished: 1, remaining: 2 })
  })
  it('names each platform and keeps its status label', () => {
    const rows = buildRows([item({ id: 'a' })], [post({ campaign_item_id: 'a' })])
    expect(rows[0].platforms.map(p => [p.name, p.label])).toEqual([['LinkedIn', 'Scheduled'], ['X', 'Scheduled']])
  })
  it('uses the newest post when a topic was retried, and orders by position', () => {
    const items = [item({ id: 'b', position: 2 }), item({ id: 'a', position: 1 })]
    const posts = [
      post({ id: 'old', campaign_item_id: 'a', posting_status: 'FAILED', created_at: '2026-11-26T09:00:00Z' }),
      post({ id: 'new', campaign_item_id: 'a', created_at: '2026-11-26T11:00:00Z' }),
    ]
    const rows = buildRows(items, posts)
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b'])
    expect(rows[0].post.id).toBe('new')
    expect(rows[0].stage.stage).toBe('scheduled')
  })
  it('counts a rejected or partly published topic as finished', () => {
    const rows = buildRows([item({ id: 'a' }), item({ id: 'b', position: 2 })], [
      post({ id: 'x', campaign_item_id: 'a', posting_status: 'REJECTED' }),
      post({ id: 'y', campaign_item_id: 'b', posting_status: 'DONE', linkedin_posted: 'YES' }),
    ])
    expect(summariseCampaign(rows)).toMatchObject({ rejected: 1, partly: 1, remaining: 0 })
  })
})
