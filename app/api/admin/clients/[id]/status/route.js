import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { disableAccount, enableAccount, offboardAccount } from '../../../../../../lib/admin/clientOps'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'

// Enable / disable a client account (Owner and Support), or offboard (Owner).
export async function POST(request, { params }) {
  const peek = await request.clone().json().catch(() => ({}))
  const action = peek?.action
  if (!['disable', 'enable', 'offboard'].includes(action)) return badRequest('action must be disable, enable or offboard.')
  const { error: authErr, audit } = await requireAdminApi(action === 'offboard' ? 'clients.offboard' : 'clients.status')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error

  const { data: client } = await supabaseAdmin.from('clients').select('id, lifecycle').eq('id', params.id).maybeSingle()
  if (!client) return badRequest('Client not found.', 404)
  const { data: isAdmin } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', params.id).maybeSingle()
  if (isAdmin) return badRequest('Admins are managed on the Admins page.', 403)
  if (action === 'enable' && client.lifecycle === 'offboarded') return badRequest('This client was offboarded. Set them up again as a new client.')

  try {
    if (action === 'disable') await disableAccount(params.id)
    if (action === 'enable') await enableAccount(params.id)
    if (action === 'offboard') await offboardAccount(params.id)
    await audit(`client.${action}`, { client_id: params.id, before: { lifecycle: client.lifecycle }, after: { lifecycle: action === 'enable' ? 'active' : action === 'disable' ? 'suspended' : 'offboarded' }, reason: body.reason })
    const message = action === 'disable' ? 'Account disabled and posting paused.' : action === 'enable' ? 'Account enabled. Posting is still paused until you resume it.' : 'Client offboarded.'
    return NextResponse.json({ success: true, message })
  } catch (e) {
    await audit(`client.${action}_failed`, { client_id: params.id, after: { error: e.message }, reason: body.reason })
    return badRequest(e.message, 500)
  }
}
