import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'
import { loadPostContext } from '../../../../../../lib/admin/posts'
import { PLATFORMS, fromZonedInput, postPlatforms } from '../../../../../../lib/admin/rules'

const MOVABLE = ['AWAITING_APPROVAL', 'PENDING', 'HALTED']

// Move one platform's scheduled time. The time is entered in the brand's
// timezone and stored in UTC.
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('posts.reschedule')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const ctx = await loadPostContext(params.id)
  if (!ctx) return badRequest('Post not found.', 404)
  if (!MOVABLE.includes(ctx.post.posting_status)) return badRequest(`A ${ctx.post.posting_status} post can’t be rescheduled. Use Retry for failed posts.`, 409)
  const platform = PLATFORMS.find(p => p.key === body.platform)
  if (!platform || !postPlatforms(ctx.post).some(p => p.key === platform.key)) return badRequest('Choose a platform this post uses.')
  if (ctx.post[platform.posted] === 'YES') return badRequest(`It’s already published on ${platform.label}.`)
  const iso = fromZonedInput(body.at, ctx.tz)
  if (!iso || new Date(iso) <= new Date()) return badRequest('Pick a time in the future.')

  const { data: updated, error: uErr } = await supabaseAdmin.from('posts').update({ [platform.time]: iso })
    .eq('id', params.id).in('posting_status', MOVABLE).select('id')
  if (uErr) return badRequest('Could not reschedule: ' + uErr.message, 500)
  if (!updated?.length) return badRequest('This post changed while you were looking at it. Reload and check.', 409)
  await audit('post.reschedule', { client_id: ctx.post.client_id, brand_id: ctx.post.brand_id, post_id: params.id, before: { [platform.time]: ctx.post[platform.time] }, after: { [platform.time]: iso }, reason: body.reason })
  return NextResponse.json({ success: true, message: `${platform.label} time changed.` })
}
