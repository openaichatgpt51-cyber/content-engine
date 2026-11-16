import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { handleRender } from '../../../lib/render-handler'

export const runtime = 'nodejs'
export const maxDuration = 30

// Dashboard use: re-render a post image after the user edits the headline or layout.
export async function POST(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const r = await handleRender(session.user.id, body)
  return NextResponse.json(r.json, { status: r.status })
}
