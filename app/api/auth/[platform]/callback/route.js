import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { NextResponse } from 'next/server'

// Validation endpoints per platform
const VALIDATION = {
  linkedin:  { url: 'https://api.linkedin.com/v2/userinfo', authHeader: true },
  instagram: { url: 'https://graph.facebook.com/me?fields=id,name', authHeader: true },
  twitter:   { url: 'https://api.twitter.com/2/users/me', authHeader: true },
}

export async function GET(request, { params }) {
  const platform = params.platform
  const supabase = await createSupabaseServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url))

  // In a real OAuth flow you'd exchange the code for a token here.
  // This assumes the token is already stored — we validate it.
  const { data: account } = await supabase
    .from('platform_accounts')
    .select('access_token')
    .eq('client_id', session.user.id)
    .eq('platform', platform)
    .single()

  if (!account?.access_token) {
    return NextResponse.redirect(
      new URL(`/onboarding?step=${platformStep(platform)}&error=no_token`, request.url)
    )
  }

  // Validate token
  const valid = await validateToken(platform, account.access_token)

  await supabase
    .from('platform_accounts')
    .update({ token_valid: valid, updated_at: new Date().toISOString() })
    .eq('client_id', session.user.id)
    .eq('platform', platform)

  const step = platformStep(platform)
  return NextResponse.redirect(
    new URL(`/onboarding?step=${step + 1}&connected=${platform}`, request.url)
  )
}

async function validateToken(platform, token) {
  try {
    const v   = VALIDATION[platform]
    const res = await fetch(v.url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return res.ok
  } catch {
    return false
  }
}

function platformStep(platform) {
  return { linkedin: 2, instagram: 3, twitter: 4 }[platform] || 2
}