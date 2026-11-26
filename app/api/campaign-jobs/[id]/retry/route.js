import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseServerClient } from '../../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'
import { loadOwnedJob, kickAdvance } from '../../../../../lib/campaign-jobs-server'

// Puts a failed topic back in the queue and restarts the job.
export async function POST(request, { params }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const job = await loadOwnedJob(params.id, session.user.id)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { itemId } = await request.json().catch(() => ({}))
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  const { data } = await supabaseAdmin.from('campaign_job_items')
    .update({ status: 'queued', error: null, started_at: null, finished_at: null })
    .eq('id', itemId).eq('job_id', job.id).eq('status', 'failed').select('id')
  if (!data?.length) return NextResponse.json({ error: 'That topic is not in a failed state' }, { status: 409 })
  await supabaseAdmin.from('campaign_jobs').update({ status: 'running', finished_at: null }).eq('id', job.id)
  waitUntil(kickAdvance(new URL(request.url).origin, job.id))
  return NextResponse.json({ ok: true })
}
