import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

export const runtime = 'nodejs'
export const maxDuration = 30

// n8n calls this right before it posts to X. X access tokens last about two
// hours, so the stored one is usually stale by the time a post is due. This
// swaps the stored refresh token for a fresh access token, saves both new
// tokens (X rotates the refresh token on every use) and returns the access
// token. Authenticated with the same RENDER_SECRET header as the render webhook.
export async function POST(request) {
  const secret = process.env.RENDER_SECRET || ''
  const given  = request.headers.get('x-render-secret') || ''
  const ok = secret.length >= 16 && given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  if (!ok) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const { client_id, brand_id } = await request.json().catch(() => ({}))
    if (!client_id || !brand_id) return NextResponse.json({ error: 'client_id and brand_id are required' }, { status: 400 })

    const { data: acct, error } = await supabaseAdmin
      .from('platform_accounts')
      .select('id, access_token, refresh_token')
      .eq('client_id', client_id).eq('brand_id', brand_id).eq('platform', 'twitter')
      .maybeSingle()
    if (error || !acct) return NextResponse.json({ error: 'X account not connected for this brand' }, { status: 404 })
    if (!acct.refresh_token) {
      return NextResponse.json({ error: 'No refresh token stored — reconnect X in Settings' }, { status: 409 })
    }

    const basic = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')
    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: acct.refresh_token }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.access_token) {
      console.error('X token refresh failed:', res.status, JSON.stringify(data).slice(0, 300))
      // A rejected refresh token cannot recover on its own — flag it so the dashboard can ask the user to reconnect.
      if (res.status === 400 || res.status === 401) {
        await supabaseAdmin.from('platform_accounts').update({ token_valid: false, updated_at: new Date().toISOString() }).eq('id', acct.id)
      }
      return NextResponse.json({ error: 'X refused the token refresh — reconnect X in Settings' }, { status: 502 })
    }

    await supabaseAdmin.from('platform_accounts').update({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || acct.refresh_token,
      token_valid:   true,
      updated_at:    new Date().toISOString(),
    }).eq('id', acct.id)

    return NextResponse.json({ access_token: data.access_token })
  } catch (err) {
    console.error('twitter-token error:', err)
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 })
  }
}
