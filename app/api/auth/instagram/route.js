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
    client_id:     process.env.INSTAGRAM_APP_ID,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
    scope:         'instagram_basic,instagram_content_publish,pages_read_engagement',
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params}`)
  setStateCookie(response, 'instagram', nonce)
  return response
}
