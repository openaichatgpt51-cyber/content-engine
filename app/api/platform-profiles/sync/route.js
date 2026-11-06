import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { lookupPlatformProfile } from '../../../../lib/platform-profile'

// Fills in (or refreshes) name / handle / avatar for the signed-in client's
// connected accounts. Covers accounts connected before profiles were stored,
// and Instagram avatars, whose URLs expire after a few days.
// Tokens are read server-side only and never returned.
const STALE_MS = 3 * 24 * 60 * 60 * 1000

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: rows, error } = await supabaseAdmin
      .from('platform_accounts')
      .select('brand_id, platform, account_id, access_token, display_name, handle, profile_synced_at')
      .eq('client_id', session.user.id)
    if (error) return NextResponse.json({ updated: 0, error: error.message })

    const now = Date.now()
    let updated = 0
    const results = []
    for (const r of rows || []) {
      if (!r.access_token) continue
      const missing = !r.display_name && !r.handle
      const stale = !r.profile_synced_at || now - new Date(r.profile_synced_at).getTime() > STALE_MS
      if (!missing && !stale) continue

      const { profile, reason } = await lookupPlatformProfile(r.platform, r.access_token, r.account_id)
      if (!profile) { results.push({ platform: r.platform, ok: false, reason }); continue }
      const { error: upErr } = await supabaseAdmin
        .from('platform_accounts')
        .update({ ...profile, profile_synced_at: new Date().toISOString() })
        .eq('client_id', session.user.id)
        .eq('brand_id', r.brand_id)
        .eq('platform', r.platform)
      if (upErr) { results.push({ platform: r.platform, ok: false, reason: 'save failed: ' + upErr.message }); continue }
      updated++
      results.push({ platform: r.platform, ok: true, handle: profile.handle, name: profile.display_name })
    }
    return NextResponse.json({ updated, results })
  } catch (err) {
    console.error('Platform profile sync error:', err)
    return NextResponse.json({ updated: 0, error: err.message }, { status: 500 })
  }
}
