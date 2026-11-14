import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { pausePosting, resumePosting } from '../../../../../../lib/admin/clientOps'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'

// Pause or resume all posting for a client (same effect as their own switch).
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('clients.pause')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  if (!['pause', 'resume'].includes(body.action)) return badRequest('action must be pause or resume.')

  const { data: client } = await supabaseAdmin.from('clients').select('lifecycle').eq('id', params.id).maybeSingle()
  if (!client) return badRequest('Client not found.', 404)
  if (body.action === 'resume' && client.lifecycle !== 'active') return badRequest('Enable the account before resuming posting.')

  try {
    const result = body.action === 'pause' ? await pausePosting(params.id) : await resumePosting(params.id)
    await audit(`client.posting_${body.action}`, { client_id: params.id, after: result, reason: body.reason })
    const message = body.action === 'pause' ? `Posting paused. ${result.held} queued post(s) held.` : `Posting resumed. ${result.requeued} post(s) back in the queue.`
    return NextResponse.json({ success: true, ...result, message })
  } catch (e) {
    await audit(`client.posting_${body.action}_failed`, { client_id: params.id, after: { error: e.message }, reason: body.reason })
    return badRequest(e.message, 500)
  }
}
