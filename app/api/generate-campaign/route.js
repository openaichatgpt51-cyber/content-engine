import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

const N8N_WEBHOOK_URL    = process.env.N8N_WEBHOOK_URL
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const userId = session.user.id

    const { topics, tone, platforms } = await request.json()
    const cleanTopics = (topics || []).map(t => t.trim()).filter(Boolean)

    if (!cleanTopics.length) {
      return NextResponse.json({ error: 'At least one topic is required' }, { status: 400 })
    }
    if (cleanTopics.length > 20) {
      return NextResponse.json({ error: 'Campaigns are limited to 20 posts at a time' }, { status: 400 })
    }

    // ── Brand profile completeness check ────────────────────────────────
    // Prompt to complete Settings rather than generate generic, unpersonalized
    // content for what's meant to be a coordinated brand campaign.
    const { data: profile } = await supabaseAdmin
      .from('brand_profiles')
      .select('company_description, target_audience, topics_to_avoid, example_posts')
      .eq('client_id', userId)
      .maybeSingle()

    if (!profile?.company_description?.trim() || !profile?.target_audience?.trim()) {
      return NextResponse.json({
        error: 'Complete your Brand Voice settings before generating a campaign — a campaign needs a defined company description and target audience to stay on-brand across every post.',
        code:  'BRAND_PROFILE_INCOMPLETE',
      }, { status: 400 })
    }

    const brandVoiceParts = []
    brandVoiceParts.push(`Company: ${profile.company_description}`)
    brandVoiceParts.push(`Audience: ${profile.target_audience}`)
    if (profile.topics_to_avoid) brandVoiceParts.push(`Avoid discussing: ${profile.topics_to_avoid}`)
    if (profile.example_posts?.filter(Boolean).length) {
      brandVoiceParts.push(`Match the style of these examples:\n${profile.example_posts.filter(Boolean).join('\n---\n')}`)
    }
    const brandVoice = brandVoiceParts.join('\n\n')

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
    if (cleanTopics.length > remaining) {
      return NextResponse.json({
        error: `This campaign needs ${cleanTopics.length} posts, but you only have ${remaining} remaining this month.`,
        code:  'LIMIT_REACHED',
        posts_used: sub.posts_used,
        posts_limit: sub.posts_limit,
      }, { status: 429 })
    }

    // ── Sequential generation — see note above on why this can't be Promise.all ──
    const results = []
    for (const topic of cleanTopics) {
      try {
        const headers = { 'Content-Type': 'application/json' }
        if (N8N_WEBHOOK_SECRET) headers['x-webhook-secret'] = N8N_WEBHOOK_SECRET

        const n8nRes = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            topic,
            platforms:    Array.isArray(platforms) ? platforms.join(',') : (platforms || 'LinkedIn,Instagram,Twitter'),
            tone:         tone || 'Professional',
            brand_voice:  brandVoice,
            is_carousel:  false,
            slide_count:  null,
            is_campaign:  true,   // tells n8n to use the collision-aware scheduler
            client_id:    userId,
            client_email: session.user.email,
          }),
        })

        if (n8nRes.ok) {
          results.push({ topic, status: 'generated' })
          await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })
        } else {
          const text = await n8nRes.text().catch(() => '')
          results.push({ topic, status: 'failed', error: `${n8nRes.status} ${text}` })
        }
      } catch (err) {
        results.push({ topic, status: 'failed', error: err.message })
      }
    }

    const succeeded = results.filter(r => r.status === 'generated').length
    return NextResponse.json({
      success: true,
      generated: succeeded,
      failed: results.length - succeeded,
      results,
    })

  } catch (err) {
    console.error('Campaign generation error:', err)
    return NextResponse.json({ error: err.message || 'Campaign generation failed' }, { status: 500 })
  }
}
