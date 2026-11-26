import { NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { USAGE_LIMITS_ENABLED } from '../../../lib/featureFlags'
import { waitUntil } from '@vercel/functions'
import { buildItems } from '../../../lib/campaign-jobs-rules'
import { kickAdvance } from '../../../lib/campaign-jobs-server'
import { resolveActiveBrandId } from '../../../lib/brand'
import { getMeter, checkMeter, logGenerations } from '../../../lib/usage'

// Only validates and queues now; generation runs in /api/campaign-jobs/[id]/advance.
export const maxDuration = 60

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'campaign', 10)
    if (limited) return limited
    const userId = session.user.id

    // groups: [{ topic, platforms: ['LinkedIn','Instagram'], tone, isCarousel, slideCount }]
    // Built client-side by campaign/page.jsx — each group is one post,
    // already resolved for which platforms share which topic.
    const { groups } = await request.json()
    const cleanGroups = (groups || []).filter(g => g.topic?.trim() && g.platforms?.length)

    if (!cleanGroups.length) return NextResponse.json({ error: 'At least one topic is required' }, { status: 400 })
    if (cleanGroups.length > 20) return NextResponse.json({ error: 'Campaigns are limited to 20 posts at a time' }, { status: 400 })

    // ── Brand profile completeness check ────────────────────────────────
    const brandId = await resolveActiveBrandId(supabase, userId)
    const { data: profile } = await supabaseAdmin
      .from('brand_profiles')
      .select('company_description, target_audience, topics_to_avoid, example_posts')
      .eq('brand_id', brandId)
      .maybeSingle()

    if (!profile?.company_description?.trim() || !profile?.target_audience?.trim()) {
      return NextResponse.json({
        error: 'Complete your Brand Voice settings before generating a campaign.',
        code:  'BRAND_PROFILE_INCOMPLETE',
      }, { status: 400 })
    }

    // ── Batch usage limit check ─────────────────────────────────────────
    const { data: subRow } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status')
      .eq('client_id', userId)
      .maybeSingle()
    const sub = subRow || { posts_used: 0, posts_limit: 5, status: 'trialing' }

    if (sub.status === 'canceled') {
      return NextResponse.json({ error: 'Your subscription has been cancelled.', code: 'SUBSCRIPTION_CANCELED' }, { status: 403 })
    }
    const remaining = sub.posts_limit - sub.posts_used
    // Monthly limit: switched off for now (see lib/featureFlags.js).
    if (USAGE_LIMITS_ENABLED && cleanGroups.length > remaining) {
      return NextResponse.json({
        error: `This campaign needs ${cleanGroups.length} posts, but you only have ${remaining} remaining this month.`,
        code:  'LIMIT_REACHED',
      }, { status: 429 })
    }

    // Per-client monthly cap (switched on per client in the admin panel).
    const { data: campAdmin } = await supabaseAdmin.from('admin_users').select('role').eq('user_id', userId).maybeSingle()
    if (!campAdmin?.role) {
      const over = checkMeter(await getMeter(userId), cleanGroups.length)
      if (over) {
        await logGenerations(cleanGroups.map(g => ({ client_id: userId, brand_id: brandId, source: 'campaign', platforms: g.platforms, status: 'blocked', error: 'monthly limit' })))
        return NextResponse.json(over, { status: 429 })
      }
    }

    // ── Queue the campaign and return straight away ─────────────────────
    // Posts are still made one after another (collision-aware scheduling needs
    // each slot committed before the next), but in the background: see
    // /api/campaign-jobs/[id]/advance. The page shows live progress.
    const { data: job, error: jobErr } = await supabaseAdmin.from('campaign_jobs')
      .insert({ client_id: userId, brand_id: brandId, client_email: session.user.email, total: cleanGroups.length })
      .select('id').single()
    if (jobErr) throw new Error('Could not start the campaign')
    const { error: itemsErr } = await supabaseAdmin.from('campaign_job_items').insert(buildItems(cleanGroups, job.id))
    if (itemsErr) {
      await supabaseAdmin.from('campaign_jobs').delete().eq('id', job.id)
      throw new Error('Could not start the campaign')
    }
    waitUntil(kickAdvance(new URL(request.url).origin, job.id))
    return NextResponse.json({ success: true, jobId: job.id, total: cleanGroups.length })

  } catch (err) {
    console.error('Campaign generation error:', err)
    return NextResponse.json({ error: err.message || 'Campaign generation failed' }, { status: 500 })
  }
}
