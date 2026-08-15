import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code          = searchParams.get('code')
  const state         = searchParams.get('state')
  const redirect      = state ? decodeURIComponent(state) : '/dashboard/settings'
  const codeVerifier  = request.cookies.get('twitter_code_verifier')?.value

  if (!code || !codeVerifier) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=twitter_denied`, request.url)
    )
  }

  try {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64')

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        Authorization:   `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type:     'authorization_code',
        redirect_uri:   `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/twitter/callback`,
        code_verifier:  codeVerifier,
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error('No access token')

    // Get Twitter user ID
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    const userData = await userRes.json()

    // Store in Supabase
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')

    await supabase.from('platform_accounts').upsert({
      client_id:     session.user.id,
      platform:      'twitter',
      account_id:    userData.data?.id,
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_valid:   true,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'client_id, platform' })

    // Clear the code verifier cookie
    const response = NextResponse.redirect(
      new URL(`${redirect}?connected=twitter`, request.url)
    )
    response.cookies.delete('twitter_code_verifier')
    return response

  } catch (err) {
    console.error('Twitter OAuth error:', err)
    return NextResponse.redirect(
      new URL(`${redirect}?error=twitter_failed`, request.url)
    )
  }
}