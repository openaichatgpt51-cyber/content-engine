import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Full account deletion, triggered by the user themselves from Settings.
// Uses supabaseAdmin (service role) deliberately: relying on per-table RLS
// delete policies here would mean one missing policy silently leaves data
// behind. This route is the single source of truth for what "delete my
// account" means.
//
// Order matters. Children first, then brands, then the clients row, then the
// auth user last. brand_profiles points at auth.users, so it must go before
// the auth user or the auth delete is refused. The clients row must go too:
// otherwise its unique email blocks the same person signing up again.
//
// The response only says success when the auth user is actually gone, and
// reports per-table results either way so a partial failure is visible.
const TABLES_BY_CLIENT = [
  'voice_edits',
  'approved_examples',
  'used_images',
  'platform_post_counts',
  'error_logs',
  'posts',              // post_analytics cascades from posts
  'platform_accounts',
  'brand_profiles',
  'brand_schedules',
  'brands',
  'onboarding',
  'subscriptions',
  'account_settings',
  'client_settings',
]

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const userId = session.user.id

    // Explicit confirmation text, not just a click: irreversible, so the API
    // must not rely on the frontend alone.
    const { confirm } = await request.json().catch(() => ({}))
    if (confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation text did not match' }, { status: 400 })
    }

    const results = {}
    let childFailure = false

    for (const table of TABLES_BY_CLIENT) {
      const { error, count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .eq('client_id', userId)
      if (error) {
        childFailure = true
        results[table] = `error: ${error.message}`
      } else {
        results[table] = `${count ?? 0} rows deleted`
      }
      // keep going: partial cleanup beats none, and the result shows what failed
    }

    // clients row (its email is unique; leaving it blocks re-signup)
    {
      const { error } = await supabaseAdmin.from('clients').delete().eq('id', userId)
      if (error) childFailure = true
      results.clients = error ? `error: ${error.message}` : 'deleted'
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    results.auth_user = authError ? `error: ${authError.message}` : 'deleted'

    if (authError) {
      console.error('Account deletion incomplete:', results)
      return NextResponse.json(
        { success: false, error: 'Your account could not be fully deleted. Please contact support.', results },
        { status: 500 }
      )
    }
    if (childFailure) console.error('Account deleted but some data may remain:', results)

    return NextResponse.json({ success: true, results })

  } catch (err) {
    console.error('Account deletion error:', err)
    return NextResponse.json({ error: err.message || 'Deletion failed' }, { status: 500 })
  }
}
