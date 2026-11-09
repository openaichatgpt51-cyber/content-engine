import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Admin-only: set how many brands a client may have (the paid extra-brand add-on).
// Admin status is checked here on every call, not just by the page that shows
// the control, so the route is safe even if called directly.
const HARD_CAP = 10

export async function POST(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: me } = await supabase.from('clients').select('is_admin').eq('id', session.user.id).maybeSingle()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { client_id, max_brands } = await request.json().catch(() => ({}))
  const n = Number(max_brands)
  if (!client_id || !Number.isInteger(n) || n < 1 || n > HARD_CAP) {
    return NextResponse.json({ error: `Brand allowance must be a whole number from 1 to ${HARD_CAP}.` }, { status: 400 })
  }

  // Never set the allowance below the brands the client already has.
  const { count, error: countErr } = await supabaseAdmin
    .from('brands').select('id', { count: 'exact', head: true }).eq('client_id', client_id)
  if (countErr) return NextResponse.json({ error: 'Could not check existing brands.' }, { status: 500 })
  if (n < (count || 0)) {
    return NextResponse.json({ error: `This client already has ${count} brands. Remove one before lowering the allowance below that.` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('clients').update({ max_brands: n }).eq('id', client_id).select('id')
  if (error) {
    console.error('Set max_brands failed:', error.message)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  return NextResponse.json({ success: true, max_brands: n })
}
