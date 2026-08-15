import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code     = searchParams.get('code')
  const state    = searchParams.get('state')
  const redirect = state ? decodeURIComponent(state) : '/dashboard/settings'

  if (!code) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=linkedin_denied`, request.url)
    )
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`,
        client_id:     process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error('No access token returned')

    // Get LinkedIn member info. Note: this app requests the OpenID Connect
    // scopes (openid profile email w_member_social) — that product only
    // authorizes the /v2/userinfo endpoint. The legacy /v2/me endpoint
    // requires r_liteprofile, which this app does not have, and will 403.
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const profile = await profileRes.json()
    if (!profile.sub) throw new Error('Could not fetch LinkedIn member id')

    // Store in Supabase
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase.from('platform_accounts').upsert({
      client_id:    session.user.id,
      platform:     'linkedin',
      account_id:   profile.sub,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at:   expiresAt,
      token_valid:  true,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'client_id, platform' })

    if (dbError) {
      console.error('LinkedIn OAuth: Supabase write failed:', dbError)
      throw new Error(`Supabase write failed: ${dbError.message}`)
    }

    return NextResponse.redirect(
      new URL(`${redirect}?connected=linkedin`, request.url)
    )
  } catch (err) {
    console.error('LinkedIn OAuth error:', err)
    return NextResponse.redirect(
      new URL(`${redirect}?error=linkedin_failed`, request.url)
    )
  }
}