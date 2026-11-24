import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { advanceJob } from '../../../../../lib/campaign-jobs'
import { serverDeps, validInternal, kickAdvance, loadOwnedJob } from '../../../../../lib/campaign-jobs-server'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'

// Starts the next queued post in the background (about 2 minutes each).
export const maxDuration = 300

export async function POST(request, { params }) {
  let job
  if (validInternal(request)) {
    const { data } = await supabaseAdmin.from('campaign_jobs')
      .select('id, client_id, brand_id, client_email, status').eq('id', params.id).maybeSingle()
    job = data
  } else {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    job = await loadOwnedJob(params.id, session.user.id)
  }
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (job.status === 'done') return NextResponse.json({ advanced: false, more: false })

  // Answer at once and do the work in the background (waitUntil keeps the
  // function alive for up to maxDuration), then hand on to the next post.
  const origin = new URL(request.url).origin
  waitUntil((async () => {
    try {
      const out = await advanceJob(serverDeps(job), job.id)
      if (out.more) await kickAdvance(origin, job.id)
    } catch (err) {
      console.error('Campaign advance error:', err)
    }
  })())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
