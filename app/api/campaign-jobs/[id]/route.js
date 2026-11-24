import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { loadOwnedJob } from '../../../../lib/campaign-jobs-server'
import { friendlyError, summarise, estimateMinutes } from '../../../../lib/campaign-jobs-rules'

export async function GET(_req, { params }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const job = await loadOwnedJob(params.id, session.user.id)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await supabaseAdmin.from('campaign_job_items')
    .select('id, position, topic, platforms, status, error, started_at, finished_at')
    .eq('job_id', job.id).order('position')
  const items = (data || []).map(i => ({ ...i, error: friendlyError(i) }))
  return NextResponse.json({
    job: { id: job.id, status: job.status, total: job.total },
    items, summary: summarise(items), etaMinutes: estimateMinutes(items),
  })
}
