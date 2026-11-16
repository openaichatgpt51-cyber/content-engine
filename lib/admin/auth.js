import 'server-only'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '../supabase-server'
import { supabaseAdmin } from '../supabase-admin'
import { can, isRole } from './permissions'
import { cleanReason } from './rules'

// Who is calling, and are they an admin? Uses getUser() (verified with
// Supabase Auth) rather than getSession() (trusts the cookie), and reads
// admin_users with the service role so RLS can't hide the row.
export async function getAdminContext() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, admin: null }
  const { data: row } = await supabaseAdmin
    .from('admin_users')
    .select('user_id, role, full_name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row || !isRole(row.role)) return { user, admin: null }
  return { user, admin: { id: user.id, email: user.email, role: row.role, name: row.full_name || user.email } }
}

// For server components under /admin. Redirects instead of erroring.
export async function requireAdminPage(action = 'admin.view') {
  const { user, admin } = await getAdminContext()
  if (!user) redirect('/login')
  if (!admin) redirect('/dashboard')
  if (!can(admin.role, action)) redirect('/admin')
  return admin
}

// For route handlers. Returns { error } (a NextResponse to return) or
// { admin, audit }. audit() writes one append-only row; routes that change
// data must call it, and pass the operator's reason.
export async function requireAdminApi(action) {
  const { user, admin } = await getAdminContext()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!admin || !can(admin.role, action)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || null
  const userAgent = (h.get('user-agent') || '').slice(0, 300) || null

  async function audit(action, { client_id = null, brand_id = null, post_id = null, lead_id = null, before = null, after = null, reason = null } = {}) {
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: admin.id, action, client_id, brand_id, post_id,
      lead_id: lead_id == null ? null : String(lead_id),
      before, after, reason, ip, user_agent: userAgent,
    })
    if (error) console.error('Audit write failed:', action, error.message)
    return !error
  }
  return { admin, audit }
}

// Reads JSON and requires a reason (3–500 chars). Returns { body } or { error }.
export async function readBodyWithReason(request, { reasonRequired = true } = {}) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return { error: badRequest('Send a JSON body.') }
  const reason = cleanReason(body.reason)
  if (reasonRequired && !reason) return { error: badRequest('Give a reason (3 to 500 characters). It is saved to the audit log.') }
  return { body: { ...body, reason } }
}

export function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
