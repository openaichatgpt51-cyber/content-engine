import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Triggered by Vercel Cron — runs frequently (every 2-3 min recommended,
// since videos finish in 1-5 min and posts sitting at 'generating' aren't
// reviewable yet). Add to vercel.json alongside the existing cron entries:
//   { "path": "/api/cron/check-video-status", "schedule": "*/3 * * * *" }
//
// PLACEHOLDER: the status-check endpoint/response shape below needs
// confirming against your actual aggregator's real API docs — same
// caveat as the n8n Submit Video Generation node.
export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: pending, error } = await supabaseAdmin
    .from('posts')
    .select('id, video_job_id')
    .eq('video_status', 'generating')
    .not('video_job_id', 'is', null)
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const post of pending || []) {
    try {
      const res = await fetch(
        `https://api.REPLACE_WITH_YOUR_AGGREGATOR.com/v1/jobs/${post.video_job_id}`,
        { headers: { Authorization: `Bearer ${process.env.VIDEO_AGGREGATOR_API_KEY}` } }
      )
      const body = await res.json()

      if (body.status === 'completed' && body.video_url) {
        await supabaseAdmin.from('posts').update({
          video_status: 'ready',
          video_url:    body.video_url,
        }).eq('id', post.id)
        results.push({ post_id: post.id, status: 'ready' })
      } else if (body.status === 'failed') {
        await supabaseAdmin.from('posts').update({ video_status: 'failed' }).eq('id', post.id)
        results.push({ post_id: post.id, status: 'failed' })
      } else {
        results.push({ post_id: post.id, status: 'still_generating' })
      }
    } catch (err) {
      results.push({ post_id: post.id, status: 'error', error: err.message })
    }
  }

  return NextResponse.json({ checked: pending?.length || 0, results })
}
