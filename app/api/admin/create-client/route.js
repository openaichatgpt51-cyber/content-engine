import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { rateLimit } from '../../../../lib/rate-limit'

// Admin-only: provision a client account with a temporary password.
// Admin status is checked here on every call. The client must change the
// password on first sign-in (middleware enforces must_change_password).
function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(14)
  let out = ''
  for (const b of bytes) out += chars[b % chars.length]
  return out
}

export async function POST(request) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: me } = await supabase.from('clients').select('is_admin').eq('id', session.user.id).maybeSingle()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(session.user.id, 'create-client', 30)
  if (limited) return limited

  const { email } = await request.json().catch(() => ({}))
  const clean = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const password = tempPassword()
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: clean,
    password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })
  if (error || !data?.user) {
    const msg = /already|registered|exists/i.test(error?.message || '') ? 'An account with this email already exists.' : 'Could not create the account.'
    if (!/already|registered|exists/i.test(error?.message || '')) console.error('create-client failed:', error?.message)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Make sure the clients row exists (harmless if a database trigger already made it).
  const { error: rowErr } = await supabaseAdmin
    .from('clients').upsert({ id: data.user.id, email: clean }, { onConflict: 'id', ignoreDuplicates: true })
  if (rowErr) console.error('create-client clients row:', rowErr.message)

  return NextResponse.json({ success: true, email: clean, temp_password: password })
}
