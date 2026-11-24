import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { createState, setStateCookie } from '../../../../lib/oauth-state'

export async function GET(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url))

  const { searchParams } = new URL(request.url)
  const { nonce, state } = createState(searchParams.get('redirect'))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`,
    state,
    scope:         'openid profile email w_member_social',
  })

  const response = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`)
  setStateCookie(response, 'linkedin', nonce)
  return response
}
