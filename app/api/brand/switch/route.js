import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { BRAND_COOKIE } from '../../../../lib/brand'

// Sets the active brand. The brand is looked up with the user's own session,
// so row-level security guarantees it belongs to them.
export async function POST(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { brand_id } = await request.json().catch(() => ({}))
  if (!brand_id) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })

  const { data: brand } = await supabase
    .from('brands').select('id').eq('id', brand_id).eq('client_id', session.user.id).maybeSingle()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const res = NextResponse.json({ success: true })
  res.cookies.set(BRAND_COOKIE, brand.id, {
    path: '/', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
