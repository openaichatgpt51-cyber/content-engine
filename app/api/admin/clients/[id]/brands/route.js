import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'

// Add a brand for a client. The database trigger still enforces max_brands.
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('clients.brands')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const name = String(body.name || '').trim()
  if (name.length < 1 || name.length > 60) return badRequest('Give the brand a name (up to 60 characters).')
  const language = String(body.language || 'en').slice(0, 8)
  const country = String(body.country || 'NG').trim().slice(0, 2).toUpperCase()

  const { data: brand, error: bErr } = await supabaseAdmin.from('brands').insert({ client_id: params.id, name, is_default: false }).select('id').single()
  if (bErr) {
    if (bErr.code === 'P0001') return badRequest('This client is at their brand allowance. Raise it first.', 403)
    return badRequest('Could not add the brand: ' + bErr.message, 500)
  }
  const { error: pErr } = await supabaseAdmin.from('brand_profiles').insert({ client_id: params.id, brand_id: brand.id, language, country })
  if (pErr) {
    await supabaseAdmin.from('brands').delete().eq('id', brand.id)
    return badRequest('Could not set up the brand profile, so the brand was removed: ' + pErr.message, 500)
  }
  await audit('brand.create', { client_id: params.id, brand_id: brand.id, after: { name, language, country }, reason: body.reason })
  return NextResponse.json({ success: true, brand_id: brand.id, message: `${name} added.` })
}
