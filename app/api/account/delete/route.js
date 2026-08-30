import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

// Full account deletion, triggered by the user themselves from Settings.
// Uses supabaseAdmin (service role) deliberately — relying on per-table
// RLS delete policies here would mean a single missing policy silently
// leaves orphaned data behind. This route is the single source of truth
// for "what does deleting an account actually mean."
//
// Order matters: delete child records referencing client_id before the
// auth user itself, so nothing is left pointing at a user that no longer
// exists.
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const userId = session.user.id

    // Require explicit confirmation text from the client, not just a click —
    // this is irreversible and the API shouldn't rely solely on frontend
    // guard rails (a stray automated retry, browser extension, etc. could
    // otherwise trigger a real deletion with no confirmation at all).
    const { confirm } = await request.json().catch(() => ({}))
    if (confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation text did not match' }, { status: 400 })
    }

    const tables = ['error_logs', 'posts', 'platform_accounts', 'subscriptions', 'onboarding']
    const results = {}

    for (const table of tables) {
      const { error, count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .eq('client_id', userId)
      results[table] = error ? `error: ${error.message}` : `${count ?? 0} rows deleted`
      // Deliberately continue even if one table errors — partial cleanup
      // is still better than none, and we log per-table results so a
      // failure here is visible rather than silently swallowed.
    }

    // Auth user last, after all referencing rows are gone.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    results.auth_user = authError ? `error: ${authError.message}` : 'deleted'

    return NextResponse.json({ success: true, results })

  } catch (err) {
    console.error('Account deletion error:', err)
    return NextResponse.json({ error: err.message || 'Deletion failed' }, { status: 500 })
  }
}
