import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const redirect = searchParams.get('redirect') || '/dashboard/settings'

  // Generate PKCE code verifier and challenge
  const codeVerifier  = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             process.env.TWITTER_CLIENT_ID,
    redirect_uri:          `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/twitter/callback`,
    scope:                 'tweet.read tweet.write users.read offline.access',
    state:                 encodeURIComponent(redirect),
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  })

  // Store code verifier in a cookie for the callback
  const response = NextResponse.redirect(
    `https://twitter.com/i/oauth2/authorize?${params}`
  )
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   600,
    path:     '/',
  })

  return response
}