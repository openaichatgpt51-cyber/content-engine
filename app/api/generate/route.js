import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const userId = session.user.id

    const body = await request.json()
    const brandVoice = body.brand_voice || ''

    // ── Normalize into a list of "generation groups" ────────────────────
    // Each group = one n8n webhook call = one post row. Platforms with
    // identical (topic, tone, format) content share a group — this is
    // what lets LinkedIn+Instagram share one post while Twitter, with its
    // own different topic, becomes a second independent post, all without
    // any change to how n8n itself works.
    let groups = []

    if (body.content && typeof body.content === 'object') {
      // New per-platform shape from the redesigned New Post / Campaign pages
      const platformKeys = Object.keys(body.content)
      const bySignature = new Map()
      for (const key of platformKeys) {
        const c = body.content[key]
        if (!c?.topic?.trim()) continue
        const sig = JSON.stringify({
          topic: c.topic.trim(), tone: c.tone, is_carousel: !!c.is_carousel,
          slide_count: c.is_carousel ? c.slideCount ?? c.slide_count : null,
          is_video: !!c.is_video,
        })
        if (!bySignature.has(sig)) bySignature.set(sig, { content: c, platforms: [] })
        bySignature.get(sig).platforms.push(key)
      }
      groups = [...bySignature.values()].map(g => ({
        topic: g.content.topic.trim(),
        tone: g.content.tone || 'Professional',
        is_carousel: !!g.content.is_carousel,
        slide_count: g.content.is_carousel ? Math.max(2, Math.min(10, Number(g.content.slideCount ?? g.content.slide_count) || 5)) : null,
        is_video: !!g.content.is_video,
        platforms: g.platforms,
      }))
    } else {
      // Legacy single-topic shape — still supported, unchanged behavior
      if (!body.topic?.trim()) return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
      groups = [{
        topic: body.topic.trim(),
        tone: body.tone || 'Professional',
        is_carousel: !!body.is_carousel,
        slide_count: body.is_carousel ? Math.max(2, Math.min(10, Number(body.slide_count) || 5)) : null,
        is_video: !!body.is_video,
        platforms: Array.isArray(body.platforms) ? body.platforms : (body.platforms || 'LinkedIn,Instagram,Twitter').split(','),
      }]
    }

    if (!groups.length) {
      return NextResponse.json({ error: 'At least one platform needs a topic' }, { status: 400 })
    }

    // ── Batch usage limit check — each group counts as one post ─────────
    const { data: subRow } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status')
      .eq('client_id', userId)
      .maybeSingle()
    const sub = subRow || { posts_used: 0, posts_limit: 5, status: 'trialing' }

    if (sub.status === 'canceled') {
      return NextResponse.json({ error: 'Your subscription has been cancelled. Please resubscribe to continue.', code: 'SUBSCRIPTION_CANCELED' }, { status: 403 })
    }
    if (sub.posts_used + groups.length > sub.posts_limit) {
      return NextResponse.json({
        error: `This needs ${groups.length} post${groups.length === 1 ? '' : 's'}, but you only have ${sub.posts_limit - sub.posts_used} remaining this month.`,
        code:  'LIMIT_REACHED',
        posts_used:  sub.posts_used,
        posts_limit: sub.posts_limit,
      }, { status: 429 })
    }

    // ── Fire one n8n call per group ───────────────────────────────────
    const n8nUrl    = process.env.N8N_WEBHOOK_URL
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET
    if (!n8nUrl) return NextResponse.json({ error: 'n8n webhook URL not configured' }, { status: 500 })

    const results = []
    for (const g of groups) {
      try {
        const n8nRes = await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(n8nSecret ? { 'x-webhook-secret': n8nSecret } : {}) },
          body: JSON.stringify({
            topic:        g.topic,
            platforms:    g.platforms.join(','),
            tone:         g.tone,
            brand_voice:  brandVoice,
            is_carousel:  g.is_carousel,
            slide_count:  g.slide_count,
            is_video:     g.is_video,
            is_campaign:  false,
            client_id:    userId,
            client_email: session.user.email,
          }),
          signal: AbortSignal.timeout(120_000),
        })

        if (n8nRes.ok) {
          results.push({ platforms: g.platforms, status: 'generated' })
          if (subRow) await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })
        } else {
          const text = await n8nRes.text().catch(() => '')
          results.push({ platforms: g.platforms, status: 'failed', error: `${n8nRes.status} ${text}` })
        }
      } catch (err) {
        results.push({ platforms: g.platforms, status: err.name === 'TimeoutError' ? 'timeout' : 'failed', error: err.message })
      }
    }

    const succeeded = results.filter(r => r.status === 'generated').length
    if (succeeded === 0) {
      return NextResponse.json({ error: 'Generation failed for all posts — check n8n logs.', results }, { status: 502 })
    }

    return NextResponse.json({ success: true, generated: succeeded, failed: results.length - succeeded, results })

  } catch (err) {
    console.error('Generate API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
