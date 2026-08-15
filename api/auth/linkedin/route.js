import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const redirect = searchParams.get('redirect') || '/dashboard/settings'

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`,
    state:         encodeURIComponent(redirect),
    scope:         'openid profile email w_member_social',
  })

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params}`
  )
}