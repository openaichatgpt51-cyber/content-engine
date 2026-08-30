import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Triggered by Vercel Cron (see vercel.json) — daily. Meta's long-lived
// token refresh is standard and ungated (unlike LinkedIn, which requires
// MDP approval for any programmatic refresh — see the roadmap correction).
// A long-lived Instagram token can be refreshed any time after it's at
// least 24h old and before it expires; refreshing resets the 60-day clock.
export async function GET(request) {
  // Vercel Cron sends this header automatically — confirms the request is
  // actually from Vercel's scheduler, not a public hit on a guessable URL.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: accounts, error } = await supabaseAdmin
    .from('platform_accounts')
    .select('client_id, access_token, expires_at')
    .eq('platform', 'instagram')
    .eq('token_valid', true)
    .lte('expires_at', sevenDaysFromNow)

  if (error) {
    console.error('Token refresh query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  for (const account of accounts || []) {
    try {
      const params = new URLSearchParams({
        grant_type:          'fb_exchange_token',
        client_id:            process.env.META_APP_ID,
        client_secret:        process.env.META_APP_SECRET,
        fb_exchange_token:    account.access_token,
      })
      const res  = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`)
      const body = await res.json()

      if (!res.ok || !body.access_token) {
        results.push({ client_id: account.client_id, status: 'failed', error: body.error?.message || 'Unknown error' })
        // Don't flip token_valid to false here — a refresh failing once
        // isn't the same signal as the token itself being confirmed dead.
        // Let the existing expiring/expired Notification logic handle the
        // user-facing warning as the actual expiry date approaches.
        continue
      }

      const newExpiresAt = new Date(Date.now() + (body.expires_in || 5184000) * 1000).toISOString() // fb default ~60 days
      await supabaseAdmin
        .from('platform_accounts')
        .update({ access_token: body.access_token, expires_at: newExpiresAt })
        .eq('client_id', account.client_id)
        .eq('platform', 'instagram')

      results.push({ client_id: account.client_id, status: 'refreshed', new_expires_at: newExpiresAt })
    } catch (err) {
      results.push({ client_id: account.client_id, status: 'failed', error: err.message })
    }
  }

  return NextResponse.json({ checked: accounts?.length || 0, results })
}
