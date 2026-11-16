import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'

const OTP_TYPES = ['invite', 'recovery', 'magiclink', 'signup', 'email', 'email_change']

// Landing point for Supabase email links.
//  - ?code=...                       PKCE flow (password-reset email)
//  - ?token_hash=...&type=invite     admin invite / sign-in links made in the
//                                    admin panel (verifyOtp, works server-side)
// Both exchange for a session cookie, then hand off to `next` (default
// /reset-password, where the user sets their password).
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const rawNext = searchParams.get('next') || '/reset-password'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/reset-password'

  const supabase = await createSupabaseServerClient()
  if (tokenHash && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return NextResponse.redirect(`${origin}/login?link=expired`)
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
