import { summarise } from './campaign-jobs-rules'

// Runs ONE queued item of a campaign job, then reports whether more remain.
// Dependencies are injected so the flow can be tested without a database.
//   deps.claim(jobId)        -> next item (now 'running') or null
//   deps.callN8n(item)       -> { ok, error? }
//   deps.finish(id, patch)   deps.items(jobId)   deps.markDone(jobId)
//   deps.log(item, result)
export async function advanceJob(deps, jobId) {
  const item = await deps.claim(jobId)
  if (!item) {
    const items = await deps.items(jobId)
    await finishIfComplete(deps, jobId, items)
    return { advanced: false, more: false, items }
  }

  let result
  try { result = await deps.callN8n(item) }
  catch (e) { result = { ok: false, error: e.message || 'request failed' } }

  await deps.finish(item.id, result.ok
    ? { status: 'done', finished_at: new Date().toISOString() }
    : { status: 'failed', error: String(result.error || 'failed').slice(0, 500), finished_at: new Date().toISOString() })
  try { await deps.log(item, result) } catch { /* logging must never break a run */ }

  const items = await deps.items(jobId)
  await finishIfComplete(deps, jobId, items)
  return { advanced: true, more: summarise(items).queued > 0, items }
}

async function finishIfComplete(deps, jobId, items) {
  if (!summarise(items).active) await deps.markDone(jobId)
}
