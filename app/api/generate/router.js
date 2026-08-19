import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { topic, tone, platforms, brand_voice } = await request.json()
    if (!topic?.trim()) return NextResponse.json({ error: 'Topic is required' }, { status: 400 })

    const userId = session.user.id

    // ── Check usage limit before generating ───────────────────
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status, plan')
      .eq('client_id', userId)
      .single()

    // Allow if no subscription yet (treat as trial with limit 5)
    if (sub) {
      if (sub.status === 'canceled') {
        return NextResponse.json({
          error: 'Your subscription has been cancelled. Please resubscribe to continue.',
          code:  'SUBSCRIPTION_CANCELED',
        }, { status: 403 })
      }

      if (sub.posts_used >= sub.posts_limit) {
        return NextResponse.json({
          error: `You've used all ${sub.posts_limit} posts for this month. Upgrade your plan or wait for your next billing cycle.`,
          code:  'LIMIT_REACHED',
          posts_used:  sub.posts_used,
          posts_limit: sub.posts_limit,
        }, { status: 429 })
      }
    }

    // ── Call n8n webhook ───────────────────────────────────────
    // NOTE: the workflow's old Form Trigger node is disabled — the live
    // entry point is "Web App Webhook Trigger", which reads fields from
    // $json.body as parsed JSON (see "Structure Webhook Input"). It must
    // receive an actual JSON body, not form-encoded data.
    const n8nUrl    = process.env.N8N_WEBHOOK_URL
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET
    if (!n8nUrl) return NextResponse.json({ error: 'n8n webhook URL not configured' }, { status: 500 })

    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(n8nSecret ? { 'x-webhook-secret': n8nSecret } : {}),
      },
      body: JSON.stringify({
        topic:        topic.trim(),
        platforms:    Array.isArray(platforms) ? platforms.join(',') : (platforms || 'LinkedIn,Instagram,Twitter'),
        tone:         tone || 'Professional',
        brand_voice:  brand_voice || '',
        client_id:    userId,
        client_email: session.user.email,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => '')
      console.error('n8n error:', n8nRes.status, text)
      return NextResponse.json(
        { error: `Content generation failed (${n8nRes.status}). Check n8n logs.` },
        { status: 502 }
      )
    }

    // ── Increment usage counter on success ─────────────────────
    if (sub) {
      await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Generation timed out — check the Review Queue in a few minutes.' },
        { status: 504 }
      )
    }
    console.error('Generate API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
