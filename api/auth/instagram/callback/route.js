import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code     = searchParams.get('code')
  const state    = searchParams.get('state')
  const redirect = state ? decodeURIComponent(state) : '/dashboard/settings'

  if (!code) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=instagram_denied`, request.url)
    )
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        grant_type:    'authorization_code',
        redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
        code,
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error('No access token')

    // Exchange for long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.INSTAGRAM_APP_ID}&client_secret=${process.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    const finalToken = longData.access_token || tokenData.access_token

    // Get Instagram Business Account ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account&access_token=${finalToken}`
    )
    const meData = await meRes.json()
    const igAccountId = meData.instagram_business_account?.id || meData.id

    // Store in Supabase
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')

    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('platform_accounts').upsert({
      client_id:    session.user.id,
      platform:     'instagram',
      account_id:   igAccountId,
      access_token: finalToken,
      expires_at:   expiresAt,
      token_valid:  true,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'client_id, platform' })

    return NextResponse.redirect(
      new URL(`${redirect}?connected=instagram`, request.url)
    )
  } catch (err) {
    console.error('Instagram OAuth error:', err)
    return NextResponse.redirect(
      new URL(`${redirect}?error=instagram_failed`, request.url)
    )
  }
}