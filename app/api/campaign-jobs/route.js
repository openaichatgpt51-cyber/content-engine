import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

// The signed-in client's most recent running campaign (so the page can pick
// up where it left off after a refresh or a visit from another device).
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin.from('campaign_jobs').select('id')
    .eq('client_id', session.user.id).eq('status', 'running').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ jobId: data?.id || null })
}
