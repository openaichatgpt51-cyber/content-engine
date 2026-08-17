import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'

// Landing point for Supabase's password-reset email link (PKCE flow sends
// ?code=... here). Exchanges it for a real session/cookie server-side,
// then hands off to /reset-password — which requires a session and would
// otherwise be blocked by middleware before this exchange ever happens.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/reset-password'

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
