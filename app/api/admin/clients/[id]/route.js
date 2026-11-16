import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'

const HARD_CAP = 10

// Edit a client's details or brand allowance (the old /api/admin/max-brands
// rules live here now). Owner only; reason required; audit-logged.
export async function PATCH(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('clients.edit')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error

  const { data: before } = await supabaseAdmin.from('clients').select('id, company_name, contact_name, max_brands').eq('id', params.id).maybeSingle()
  if (!before) return badRequest('Client not found.', 404)

  const changes = {}
  if (typeof body.company_name === 'string') changes.company_name = body.company_name.trim().slice(0, 160)
  if (typeof body.contact_name === 'string') changes.contact_name = body.contact_name.trim().slice(0, 120)
  if (body.max_brands !== undefined && body.max_brands !== null) {
    const n = Number(body.max_brands)
    if (!Number.isInteger(n) || n < 1 || n > HARD_CAP) return badRequest(`Brand allowance must be a whole number from 1 to ${HARD_CAP}.`)
    const { count, error: cErr } = await supabaseAdmin.from('brands').select('id', { count: 'exact', head: true }).eq('client_id', params.id)
    if (cErr) return badRequest('Could not check existing brands.', 500)
    if (n < (count || 0)) return badRequest(`This client already has ${count} brands. Remove one before lowering the allowance below that.`)
    changes.max_brands = n
  }
  if (!Object.keys(changes).length) return badRequest('Nothing to change.')

  const { error: uErr } = await supabaseAdmin.from('clients').update(changes).eq('id', params.id)
  if (uErr) return badRequest('Could not save: ' + uErr.message, 500)
  await audit('client.update', { client_id: params.id, before, after: changes, reason: body.reason })
  return NextResponse.json({ success: true, message: 'Saved.' })
}
