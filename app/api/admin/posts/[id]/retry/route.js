import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'
import { loadPostContext } from '../../../../../../lib/admin/posts'
import { retryDecision, fromZonedInput, unpublishedPlatforms, LIVE_PLATFORMS } from '../../../../../../lib/admin/rules'

// Retry = reset to PENDING (or HALTED if the client is paused). The Railway
// scheduler picks PENDING posts up within 60 s; n8n skips any platform whose
// *_posted flag is already YES, so nothing is posted twice.
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('posts.retry')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error

  const ctx = await loadPostContext(params.id)
  if (!ctx) return badRequest('Post not found.', 404)
  const decision = retryDecision({ post: ctx.post, paused: ctx.paused, accounts: ctx.accounts })
  if (!decision.ok) return badRequest(decision.reason, 409)

  const changes = { posting_status: decision.nextStatus }
  if (body.mode === 'at') {
    const iso = fromZonedInput(body.at, ctx.tz)
    if (!iso || new Date(iso) <= new Date()) return badRequest('Pick a time in the future.')
    for (const p of unpublishedPlatforms(ctx.post).filter(p => LIVE_PLATFORMS.includes(p.key))) changes[p.time] = iso
  }

  // Conditional update: only if it is still FAILED/PARTIAL (guards double clicks
  // and two admins acting at once).
  const { data: updated, error: uErr } = await supabaseAdmin.from('posts')
    .update(changes).eq('id', params.id).in('posting_status', ['FAILED', 'PARTIAL']).select('id')
  if (uErr) return badRequest('Could not retry: ' + uErr.message, 500)
  if (!updated?.length) return badRequest('This post changed while you were looking at it. Reload and check its status.', 409)

  await audit('post.retry', { client_id: ctx.post.client_id, brand_id: ctx.post.brand_id, post_id: params.id, before: { posting_status: ctx.post.posting_status }, after: changes, reason: body.reason })
  const message = decision.nextStatus === 'HALTED'
    ? 'Queued, but held: posting is paused for this client.'
    : body.mode === 'at' ? 'Rescheduled. It will publish at the new time.' : 'Queued. It should publish within about a minute.'
  return NextResponse.json({ success: true, message })
}
