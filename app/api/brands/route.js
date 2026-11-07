import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { BRAND_COOKIE } from '../../../lib/brand'
import { MULTI_BRAND_ENABLED } from '../../../lib/featureFlags'

// Creates a new (non-default) brand for the signed-in client.
// The database enforces the allowance (clients.max_brands) with a trigger, so
// this cannot be bypassed by calling the API directly. A new brand also gets
// a copy of the default brand's posting schedule (another trigger) and an
// empty brand profile, created here.
export async function POST(request) {
  if (!MULTI_BRAND_ENABLED) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const userId = session.user.id

  const { name } = await request.json().catch(() => ({}))
  const clean = typeof name === 'string' ? name.trim() : ''
  if (clean.length < 1 || clean.length > 60) {
    return NextResponse.json({ error: 'Give the brand a name (up to 60 characters).' }, { status: 400 })
  }

  const { data: brand, error: brandErr } = await supabase
    .from('brands')
    .insert({ client_id: userId, name: clean, is_default: false })
    .select('id')
    .single()

  if (brandErr) {
    if (brandErr.code === 'P0001') {
      return NextResponse.json(
        { error: 'You have reached the number of brands on your plan. Contact us to add more.' },
        { status: 403 }
      )
    }
    console.error('Create brand failed:', brandErr.message)
    return NextResponse.json({ error: 'Could not add the brand.' }, { status: 500 })
  }

  // Empty profile for the new brand. If this fails, remove the brand again so
  // nobody is left with a half-created one.
  const { error: profileErr } = await supabase
    .from('brand_profiles')
    .insert({ client_id: userId, brand_id: brand.id })

  if (profileErr) {
    console.error('Create brand profile failed:', profileErr.message)
    await supabase.from('brands').delete().eq('id', brand.id)
    return NextResponse.json(
      { error: 'Could not set up the new brand. Please try again or contact support.' },
      { status: 500 }
    )
  }

  const res = NextResponse.json({ success: true, brand_id: brand.id })
  res.cookies.set(BRAND_COOKIE, brand.id, {
    path: '/', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365,
  })
  return res
}

// Renames a brand the signed-in client owns. Uses the service role with an
// explicit client_id match so ownership is checked here, not left to a policy.
export async function PATCH(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { brand_id, name } = await request.json().catch(() => ({}))
  const clean = typeof name === 'string' ? name.trim() : ''
  if (!brand_id || clean.length < 1 || clean.length > 60) {
    return NextResponse.json({ error: 'Give the brand a name (up to 60 characters).' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', brand_id)
    .eq('client_id', session.user.id)
    .select('id')
  if (error) {
    console.error('Rename brand failed:', error.message)
    return NextResponse.json({ error: 'Could not rename the brand.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })
  return NextResponse.json({ success: true })
}
