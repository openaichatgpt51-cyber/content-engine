import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

// One lightweight read call per platform to confirm the stored token still
// works — surfaces a broken connection immediately instead of only finding
// out when a real post fails hours or days later.
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { platform } = await request.json()
    if (!platform) return NextResponse.json({ error: 'platform is required' }, { status: 400 })

    const { data: account } = await supabaseAdmin
      .from('platform_accounts')
      .select('access_token, account_id')
      .eq('client_id', session.user.id)
      .eq('platform', platform)
      .maybeSingle()

    if (!account?.access_token) {
      return NextResponse.json({ ok: false, error: 'No connection found for this platform' }, { status: 404 })
    }

    let testUrl
    if (platform === 'linkedin') {
      // Current OIDC userinfo endpoint — not the deprecated /v2/me path.
      testUrl = 'https://api.linkedin.com/v2/userinfo'
    } else if (platform === 'instagram') {
      testUrl = `https://graph.facebook.com/v21.0/${account.account_id}?fields=username&access_token=${account.access_token}`
    } else {
      return NextResponse.json({ ok: false, error: `Testing not yet supported for ${platform}` }, { status: 400 })
    }

    const headers = platform === 'linkedin' ? { Authorization: `Bearer ${account.access_token}` } : {}
    const res = await fetch(testUrl, { headers })

    if (res.ok) {
      // Mark token_valid true again on a successful test — a prior failed
      // real post may have set this false; a passing test should clear it.
      await supabaseAdmin
        .from('platform_accounts')
        .update({ token_valid: true })
        .eq('client_id', session.user.id)
        .eq('platform', platform)
      return NextResponse.json({ ok: true })
    }

    // Token itself is dead — record that, same signal the Notifications
    // feature already reads from.
    await supabaseAdmin
      .from('platform_accounts')
      .update({ token_valid: false })
      .eq('client_id', session.user.id)
      .eq('platform', platform)

    const body = await res.text().catch(() => '')
    return NextResponse.json({ ok: false, error: `Connection test failed (${res.status})`, detail: body }, { status: 200 })

  } catch (err) {
    console.error('Test connection error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
