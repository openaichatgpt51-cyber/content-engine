import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Triggered by Vercel Cron, daily. Fetches engagement data for posts that
// went DONE roughly 24h+ ago (giving LinkedIn's algorithm time to actually
// distribute the post before measuring it) and don't have analytics yet.
export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: duePosts, error } = await supabaseAdmin
    .from('posts')
    .select('id, client_id, linkedin_post_urn, linkedin_posted_at')
    .eq('posting_status', 'DONE')
    .eq('linkedin_posted', 'YES')
    .not('linkedin_post_urn', 'is', null)
    .lte('linkedin_posted_at', oneDayAgo)
    .limit(50) // batch size per run — avoid one cron invocation running too long

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const post of duePosts || []) {
    // Skip posts we already have analytics for (idempotent — safe to
    // re-run this job without duplicating work).
    const { data: existing } = await supabaseAdmin
      .from('post_analytics')
      .select('id')
      .eq('post_id', post.id)
      .eq('platform', 'linkedin')
      .maybeSingle()
    if (existing) continue

    try {
      const { data: account } = await supabaseAdmin
        .from('platform_accounts')
        .select('access_token')
        .eq('client_id', post.client_id)
        .eq('platform', 'linkedin')
        .maybeSingle()
      if (!account?.access_token) { results.push({ post_id: post.id, status: 'no_token' }); continue }

      const params = new URLSearchParams({
        q:      'entity',
        entity: post.linkedin_post_urn,
      })
      const res = await fetch(`https://api.linkedin.com/rest/memberCreatorPostAnalytics?${params}`, {
        headers: {
          Authorization:      `Bearer ${account.access_token}`,
          'LinkedIn-Version': '202506',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      })

      if (!res.ok) { results.push({ post_id: post.id, status: 'api_error', code: res.status }); continue }
      const body = await res.json()

      // Response shape: an array of metric entries — map the ones we
      // actually store. Field names per LinkedIn's current documentation;
      // worth re-checking if this ever comes back empty for everyone at
      // once, since this is exactly the kind of thing that shifts.
      const metrics = {}
      for (const entry of body.elements || []) {
        if (entry.type === 'IMPRESSION')      metrics.impressions     = entry.value
        if (entry.type === 'UNIQUE_IMPRESSION') metrics.members_reached = entry.value
        if (entry.type === 'REACTION')        metrics.reactions       = entry.value
        if (entry.type === 'COMMENT')         metrics.comments        = entry.value
        if (entry.type === 'REPOST' || entry.type === 'SHARE') metrics.reposts = entry.value
        if (entry.type === 'LINK_CLICKS')     metrics.clicks          = entry.value
      }

      await supabaseAdmin.from('post_analytics').insert({
        post_id:   post.id,
        client_id: post.client_id,
        platform:  'linkedin',
        ...metrics,
      })
      results.push({ post_id: post.id, status: 'fetched' })

    } catch (err) {
      results.push({ post_id: post.id, status: 'error', error: err.message })
    }
  }

  return NextResponse.json({ checked: duePosts?.length || 0, results })
}
