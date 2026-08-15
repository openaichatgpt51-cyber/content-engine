import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const redirect = searchParams.get('redirect') || '/dashboard/settings'

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
    scope:         'instagram_basic,instagram_content_publish,pages_read_engagement',
    response_type: 'code',
    state:         encodeURIComponent(redirect),
  })

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  )
}