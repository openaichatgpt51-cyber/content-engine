// Pure helpers: where is each campaign topic now, and what is left?
// A topic (campaign_job_items row) is generated into one post; the post then
// moves through review, scheduling and publishing on each platform.

export const PLATFORM_FIELDS = {
  LinkedIn:  { posted: 'linkedin_posted',  time: 'linkedin_scheduled_time',  label: 'LinkedIn' },
  Instagram: { posted: 'instagram_posted', time: 'instagram_scheduled_time', label: 'Instagram' },
  Twitter:   { posted: 'twitter_posted',   time: 'twitter_scheduled_time',   label: 'X' },
}

// Status of one platform for one post.
export function platformStatus(post, platform) {
  const f = PLATFORM_FIELDS[platform]
  if (!post || !f) return { state: 'waiting', label: 'Waiting' }
  if (post[f.posted] === 'YES') return { state: 'published', label: 'Published', at: post[`${f.posted}_at`] || null }
  const s = post.posting_status
  if (s === 'REJECTED') return { state: 'rejected', label: 'Rejected' }
  if (s === 'AWAITING_APPROVAL') return { state: 'review', label: 'Needs review' }
  if (s === 'FAILED' || s === 'HALTED') return { state: 'failed', label: s === 'HALTED' ? 'Paused' : 'Failed' }
  if (s === 'IN_PROGRESS') return { state: 'publishing', label: 'Publishing' }
  if (s === 'DONE' || s === 'PARTIAL') return { state: 'missed', label: 'Not published' }   // finished without this platform
  return { state: 'scheduled', label: 'Scheduled', at: post[f.time] || null }
}

// Overall stage of a topic.
export function topicStage(item, post) {
  if (item.status === 'queued' || item.status === 'running') return { stage: 'generating', label: 'Writing' }
  if (item.status === 'failed') return { stage: 'generation_failed', label: 'Generation failed' }
  if (!post) return { stage: 'untracked', label: 'Created' }
  const states = (item.platforms || []).map(p => platformStatus(post, p).state)
  if (!states.length) return { stage: 'untracked', label: 'Created' }
  if (states.every(s => s === 'published')) return { stage: 'published', label: 'Published' }
  if (states.every(s => s === 'rejected')) return { stage: 'rejected', label: 'Rejected' }
  if (states.includes('review')) return { stage: 'review', label: 'Needs review' }
  if (states.includes('failed')) return { stage: 'failed', label: 'Failed' }
  if (states.includes('published') && states.every(s => s === 'published' || s === 'missed')) {
    return { stage: 'partly', label: 'Partly published' }
  }
  if (states.every(s => s === 'missed')) return { stage: 'missed', label: 'Not published' }
  if (states.includes('publishing')) return { stage: 'publishing', label: 'Publishing' }
  return { stage: 'scheduled', label: 'Scheduled' }
}

const DONE_STAGES = new Set(['published', 'rejected', 'partly', 'missed'])

// Counts for a whole campaign. "remaining" = topics that have not finished
// going out yet (published, rejected and partly-published count as finished).
export function summariseCampaign(rows = []) {
  const c = { total: rows.length, generating: 0, generation_failed: 0, review: 0, scheduled: 0,
    publishing: 0, published: 0, failed: 0, partly: 0, missed: 0, rejected: 0, untracked: 0 }
  for (const r of rows) c[r.stage.stage] = (c[r.stage.stage] || 0) + 1
  const finished = rows.filter(r => DONE_STAGES.has(r.stage.stage)).length
  return { ...c, finished, remaining: rows.length - finished }
}

// Join items with their latest post (a retried topic can have more than one).
export function buildRows(items = [], posts = []) {
  const latest = new Map()
  for (const p of posts) {
    const cur = latest.get(p.campaign_item_id)
    if (!cur || new Date(p.created_at || 0) > new Date(cur.created_at || 0)) latest.set(p.campaign_item_id, p)
  }
  return [...items].sort((a, b) => a.position - b.position).map(item => {
    const post = latest.get(item.id) || null
    return {
      item, post,
      stage: topicStage(item, post),
      platforms: (item.platforms || []).map(p => ({ platform: p, name: PLATFORM_FIELDS[p]?.label || p, ...platformStatus(post, p) })),
    }
  })
}
