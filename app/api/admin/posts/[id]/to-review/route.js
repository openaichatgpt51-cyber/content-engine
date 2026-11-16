import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'

const FROM = ['FAILED', 'PARTIAL', 'PENDING', 'HALTED']

// Send a post back to the client's Review Queue (e.g. wrong image, wrong
// language, or past its time). Never touches a post that is publishing.
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('posts.to_review')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const { data: post } = await supabaseAdmin.from('posts').select('id, client_id, brand_id, posting_status').eq('id', params.id).maybeSingle()
  if (!post) return badRequest('Post not found.', 404)
  if (!FROM.includes(post.posting_status)) return badRequest(`A ${post.posting_status} post can’t be sent back to review.`, 409)
  const { data: updated, error: uErr } = await supabaseAdmin.from('posts').update({ posting_status: 'AWAITING_APPROVAL' })
    .eq('id', params.id).in('posting_status', FROM).select('id')
  if (uErr) return badRequest('Could not move the post: ' + uErr.message, 500)
  if (!updated?.length) return badRequest('This post changed while you were looking at it. Reload and check.', 409)
  await audit('post.to_review', { client_id: post.client_id, brand_id: post.brand_id, post_id: post.id, before: { posting_status: post.posting_status }, after: { posting_status: 'AWAITING_APPROVAL' }, reason: body.reason })
  return NextResponse.json({ success: true, message: 'Back in the client’s Review Queue.' })
}
