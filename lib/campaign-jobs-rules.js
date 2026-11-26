// Pure helpers for background campaigns (no database, safe to unit test).

export const STALE_MS = 6 * 60 * 1000      // matches the SQL claim function
export const MINUTES_PER_POST = 2          // typical n8n time per post

export function summarise(items = []) {
  const c = { queued: 0, running: 0, done: 0, failed: 0 }
  for (const i of items) if (c[i.status] !== undefined) c[i.status]++
  const finished = c.done + c.failed
  return { ...c, total: items.length, finished, active: c.queued + c.running > 0 }
}

export function estimateMinutes(items = []) {
  const s = summarise(items)
  return (s.queued + s.running) * MINUTES_PER_POST
}

// True when nothing is moving but work remains (e.g. the server chain was
// interrupted) — the page then asks the server to advance the job.
export function needsResume(items = [], now = Date.now()) {
  const s = summarise(items)
  if (!s.active) return false
  if (s.running === 0) return s.queued > 0
  const run = items.find(i => i.status === 'running')
  const started = run?.started_at ? new Date(run.started_at).getTime() : 0
  return now - started > STALE_MS
}

export function buildItems(groups = [], jobId) {
  return groups.map((g, i) => ({
    job_id: jobId,
    position: i + 1,
    topic: g.topic.trim(),
    platforms: g.platforms,
    tone: g.tone || 'Professional',
    is_carousel: !!g.isCarousel,
    slide_count: g.isCarousel ? Math.max(2, Math.min(10, Number(g.slideCount) || 5)) : null,
  }))
}

// Clients never see raw upstream errors (they can contain internals).
export function friendlyError(item) {
  if (item.status !== 'failed') return null
  if ((item.error || '').startsWith('Timed out')) return item.error
  return 'Generation failed for this topic. You can retry it.'
}
