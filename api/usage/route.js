import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

// GET — return current usage for the logged-in user
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, posts_used, posts_limit, status, current_period_end')
      .eq('client_id', session.user.id)
      .single()

    if (!sub) {
      // No subscription yet — return trial defaults
      return NextResponse.json({
        plan:               'trial',
        posts_used:         0,
        posts_limit:        5,
        status:             'trial',
        current_period_end: null,
        can_generate:       true,
        posts_remaining:    5,
      })
    }

    const posts_remaining = Math.max(0, sub.posts_limit - sub.posts_used)
    const can_generate    = sub.status !== 'canceled' && posts_remaining > 0

    return NextResponse.json({
      ...sub,
      posts_remaining,
      can_generate,
    })

  } catch (err) {
    console.error('Usage GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 })
  }
}

// POST — increment post count (called after successful generation)
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const userId = session.user.id

    // Check current usage first
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status')
      .eq('client_id', userId)
      .single()

    if (!sub) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    if (sub.status === 'canceled') {
      return NextResponse.json({ error: 'Subscription cancelled' }, { status: 403 })
    }

    if (sub.posts_used >= sub.posts_limit) {
      return NextResponse.json({
        error:       'Monthly post limit reached',
        posts_used:  sub.posts_used,
        posts_limit: sub.posts_limit,
      }, { status: 429 })
    }

    // Increment
    await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })

    return NextResponse.json({
      success:         true,
      posts_used:      sub.posts_used + 1,
      posts_remaining: sub.posts_limit - sub.posts_used - 1,
    })

  } catch (err) {
    console.error('Usage POST error:', err)
    return NextResponse.json({ error: 'Failed to increment usage' }, { status: 500 })
  }
}
