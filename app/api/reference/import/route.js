import { NextResponse } from 'next/server'
import { rateLimit } from '../../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { resolveActiveBrandId } from '../../../../lib/brand'
import { mirrorImage } from '../../../../lib/reference-store'

// Imports the signed-in client's OWN recent posts from a platform they have
// connected, using the official API and the token we already hold. Nothing is
// scraped. Posts are saved as brand reference material for the active brand.
//
// X bills reads per request on its API plan, so one import reads at most 20
// posts and runs only when the user presses the button.
export const runtime = 'nodejs'
export const maxDuration = 60

const LIMIT = 20

// X bills reads to our developer account, so imports are capped per CLIENT
// (all of their brands together) over a rolling 24 hours. Instagram reads are
// free and uncapped.
const X_IMPORTS_PER_DAY = 2

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'ref-import', 30)
    if (limited) return limited
    const userId = session.user.id

    const { platform } = await request.json().catch(() => ({}))
    if (!['instagram', 'twitter'].includes(platform)) {
      return NextResponse.json({ error: 'Importing is available for Instagram and X.' }, { status: 400 })
    }

    const brandId = await resolveActiveBrandId(supabase, userId)
    const { data: acct } = await supabaseAdmin
      .from('platform_accounts')
      .select('account_id, access_token, token_valid')
      .eq('client_id', userId).eq('brand_id', brandId).eq('platform', platform)
      .maybeSingle()
    if (!acct?.access_token) {
      return NextResponse.json({ error: `Connect ${platform === 'twitter' ? 'X' : 'Instagram'} for this brand in Settings → Connections first.` }, { status: 400 })
    }

    if (platform === 'twitter') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recent, error: logErr } = await supabaseAdmin
        .from('reference_import_log').select('created_at')
        .eq('client_id', userId).eq('platform', 'twitter').gte('created_at', since)
        .order('created_at', { ascending: true })
      if (logErr) {
        console.error('Import limit check failed:', logErr.message)
        return NextResponse.json({ error: "Couldn't check your import allowance, so nothing was imported. Try again in a moment." }, { status: 500 })
      }
      if ((recent?.length || 0) >= X_IMPORTS_PER_DAY) {
        const next = new Date(new Date(recent[0].created_at).getTime() + 24 * 60 * 60 * 1000)
        return NextResponse.json({
          error: `X imports are limited to ${X_IMPORTS_PER_DAY} per day. You can import again after ${next.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (Lagos time). Posts you already imported are still saved.`,
        }, { status: 429 })
      }
    }

    let rows = []
    if (platform === 'instagram') {
      const url = `https://graph.facebook.com/v21.0/${acct.account_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${LIMIT}&access_token=${encodeURIComponent(acct.access_token)}`
      const res = await fetch(url)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Instagram import failed:', res.status, JSON.stringify(body).slice(0, 300))
        return NextResponse.json({ error: `Instagram refused the request (${body?.error?.message || 'HTTP ' + res.status}). Reconnect Instagram and make sure it is a Business or Creator account linked to a Facebook Page.` }, { status: 502 })
      }
      for (const m of body.data || []) {
        const img = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url
        const stored = img ? await mirrorImage(img, userId, `ig-${m.id}`) : null
        rows.push({
          source_post_id: m.id,
          source_url: m.permalink || null,
          body: m.caption || null,
          media: stored ? [{ url: stored, kind: m.media_type === 'VIDEO' ? 'frame' : 'image' }] : [],
          metadata: { likes: m.like_count ?? null, comments: m.comments_count ?? null, type: m.media_type, posted_at: m.timestamp },
        })
      }
    } else {
      const url = `https://api.twitter.com/2/users/${acct.account_id}/tweets?max_results=${LIMIT}&exclude=retweets,replies&tweet.fields=created_at,public_metrics&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${acct.access_token}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('X import failed:', res.status, JSON.stringify(body).slice(0, 300))
        const msg = res.status === 401
          ? 'X access tokens expire after about 2 hours. Reconnect X in Settings → Connections, then import straight away.'
          : res.status === 402 || res.status === 403
            ? 'Your X developer plan does not allow reading posts (or has no credits). Check the plan and credits on the X developer console.'
            : `X refused the request (HTTP ${res.status}).`
        return NextResponse.json({ error: msg }, { status: 502 })
      }
      // X answered, so this read was billed: count it against the allowance.
      await supabaseAdmin.from('reference_import_log').insert({ client_id: userId, brand_id: brandId, platform: 'twitter' })
      const mediaByKey = Object.fromEntries((body.includes?.media || []).map(m => [m.media_key, m]))
      for (const t of body.data || []) {
        const keys = t.attachments?.media_keys || []
        const media = []
        for (const k of keys.slice(0, 2)) {
          const m = mediaByKey[k]
          const src = m?.type === 'photo' ? m.url : m?.preview_image_url
          const stored = src ? await mirrorImage(src, userId, `x-${t.id}-${k}`) : null
          if (stored) media.push({ url: stored, kind: m.type === 'photo' ? 'image' : 'frame' })
        }
        rows.push({
          source_post_id: t.id,
          source_url: null,
          body: t.text || null,
          media,
          metadata: { likes: t.public_metrics?.like_count ?? null, reposts: t.public_metrics?.retweet_count ?? null, posted_at: t.created_at },
        })
      }
    }

    rows = rows.filter(r => r.body || r.media.length)
    if (!rows.length) return NextResponse.json({ imported: 0, message: 'No posts were found to import.' })

    const { error } = await supabaseAdmin.from('brand_reference_posts').upsert(
      rows.map(r => ({ ...r, client_id: userId, brand_id: brandId, platform, source: 'imported' })),
      { onConflict: 'brand_id,platform,source_post_id' }
    )
    if (error) {
      console.error('Reference import save failed:', error.message)
      return NextResponse.json({ error: "Posts were read but couldn't be saved: " + error.message }, { status: 500 })
    }
    return NextResponse.json({ imported: rows.length })
  } catch (err) {
    console.error('Reference import error:', err)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
