import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'
import { parseLimit } from '../../../../../../lib/usageRules'

// Switch monthly usage metering on or off for one client, and set the cap.
// Owner only; reason required; audit-logged.
// body: { metering: 'on' | 'off', limit?: number, reason }
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('clients.usage')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error

  const { data: before } = await supabaseAdmin.from('clients')
    .select('id, usage_metering, monthly_post_limit').eq('id', params.id).maybeSingle()
  if (!before) return badRequest('Client not found.', 404)

  const on = body.metering === true || body.metering === 'on'
  const changes = { usage_metering: on }
  if (on) {
    const limit = parseLimit(body.limit ?? before.monthly_post_limit)
    if (!limit) return badRequest('Set a monthly limit: a whole number of posts, 1 or more.')
    changes.monthly_post_limit = limit
  } else if (body.limit !== undefined && body.limit !== null && body.limit !== '') {
    const limit = parseLimit(body.limit)
    if (!limit) return badRequest('The monthly limit must be a whole number of posts, 1 or more.')
    changes.monthly_post_limit = limit
  }

  const { error: uErr } = await supabaseAdmin.from('clients').update(changes).eq('id', params.id)
  if (uErr) return badRequest('Could not save: ' + uErr.message, 500)
  await audit(on ? 'client.usage_on' : 'client.usage_off', { client_id: params.id, before, after: changes, reason: body.reason })
  return NextResponse.json({
    success: true,
    message: on ? `Metering on: ${changes.monthly_post_limit} posts a month.` : 'Metering off. This client has no monthly cap.',
  })
}
