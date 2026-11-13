import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { rateLimit } from '../../../lib/rate-limit'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { USAGE_LIMITS_ENABLED } from '../../../lib/featureFlags'
import { loadLocaleContext } from '../../../lib/locale-context'
import { resolveActiveBrandId } from '../../../lib/brand'

// How long to wait for n8n before treating the job as "accepted and running".
// A full generation takes ~2-3 minutes, so n8n does not answer within this
// window; what we need from it is only (a) it received the request and
// (b) any immediate rejection (bad secret, wrong URL, n8n down) is reported
// here instead of being lost. n8n keeps running after we stop listening.
const ACCEPT_WINDOW_MS = 10_000

// Usage is NOT counted here. n8n counts it (Record Usage node) right after the
// post row is saved, so a run that errors out is never charged to the user.
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'generate', 30)
    if (limited) return limited
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
          skip_media: !!c.skip_media, provided_image_url: c.provided_image_url || '',
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
        // Text-only, or the user supplied their own image: n8n skips image work.
        skip_media: !!g.content.skip_media,
        provided_image_url: g.content.provided_image_url || '',
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

    // A user-supplied image must be one this user uploaded to their own folder.
    const ownImagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/${userId}/`
    for (const g of groups) {
      if (g.provided_image_url && !String(g.provided_image_url).startsWith(ownImagePrefix)) {
        return NextResponse.json({ error: 'That image was not uploaded through the dashboard' }, { status: 400 })
      }
      // Carousels and videos build their own media, so ignore a supplied image there.
      if (g.is_carousel || g.is_video) { g.skip_media = false; g.provided_image_url = '' }
    }

    // ── Batch usage limit check — each group counts as one post ─────────
    // Admins are exempt: they're testing/operating the system, not a
    // metered customer, and shouldn't be able to lock themselves out.
    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    const isAdmin = !!clientRow?.is_admin

    const { data: subRow } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status')
      .eq('client_id', userId)
      .maybeSingle()
    const sub = subRow || { posts_used: 0, posts_limit: 5, status: 'trialing' }

    if (!isAdmin) {
      if (sub.status === 'canceled') {
        return NextResponse.json({ error: 'Your subscription has been cancelled. Please resubscribe to continue.', code: 'SUBSCRIPTION_CANCELED' }, { status: 403 })
      }
      // Monthly limit: switched off for now (see lib/featureFlags.js).
      if (USAGE_LIMITS_ENABLED && sub.posts_used + groups.length > sub.posts_limit) {
        return NextResponse.json({
          error: `This needs ${groups.length} post${groups.length === 1 ? '' : 's'}, but you only have ${sub.posts_limit - sub.posts_used} remaining this month.`,
          code:  'LIMIT_REACHED',
          posts_used:  sub.posts_used,
          posts_limit: sub.posts_limit,
        }, { status: 429 })
      }
    }

    // ── Fire one n8n call per group, in parallel ─────────────────────────
    // We do not wait for the generation to finish (it takes 2-3 minutes and
    // used to hit the old 120s limit, reporting "failed" for runs that then
    // succeeded in n8n). Each call returns as soon as n8n has either rejected
    // the request or had ACCEPT_WINDOW_MS to start working on it. The Review
    // Queue shows a "Generating..." banner and picks the post up when it lands.
    const brandId   = await resolveActiveBrandId(supabase, userId)
    const locale    = await loadLocaleContext(userId, brandId)
    const n8nUrl    = process.env.N8N_WEBHOOK_URL
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET
    if (!n8nUrl) return NextResponse.json({ error: 'n8n webhook URL not configured' }, { status: 500 })

    const results = await Promise.all(groups.map(async (g) => {
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
            skip_media:   !!g.skip_media,
            provided_image_url: g.provided_image_url || '',
            is_campaign:  false,
            ...locale,
            client_id:    userId,
            brand_id:     brandId,
            client_email: session.user.email,
          }),
          signal: AbortSignal.timeout(ACCEPT_WINDOW_MS),
        })

        if (n8nRes.ok) {
          return { platforms: g.platforms, status: 'started' }
        }
        const text = await n8nRes.text().catch(() => '')
        return { platforms: g.platforms, status: 'failed', error: `${n8nRes.status} ${text}` }
      } catch (err) {
        // No answer inside the window = accepted and still running.
        if (err.name === 'TimeoutError') return { platforms: g.platforms, status: 'started' }
        return { platforms: g.platforms, status: 'failed', error: err.message }
      }
    }))

    const started = results.filter(r => r.status === 'started').length
    if (started === 0) {
      return NextResponse.json({ error: 'Could not start generation — check the n8n webhook URL and secret.', results }, { status: 502 })
    }

    // `generated` keeps its old name for existing clients; it now means
    // "started" (the posts arrive in the Review Queue in about 2-3 minutes).
    return NextResponse.json({ success: true, processing: true, generated: started, failed: results.length - started, results })

  } catch (err) {
    console.error('Generate API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
