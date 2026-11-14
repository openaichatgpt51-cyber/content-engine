import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { signInLink, appOrigin } from '../../../../lib/admin/clientOps'
import { isRole } from '../../../../lib/admin/permissions'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Make someone an admin: promote an existing user, or invite a new one.
// Owner (super admin) only. Returns a sign-in link for new users.
export async function POST(request) {
  const { error: authErr, admin, audit } = await requireAdminApi('admins.manage')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const email = String(body.email || '').trim().toLowerCase()
  const role = body.role
  const fullName = String(body.full_name || '').trim().slice(0, 120) || null
  if (!EMAIL.test(email)) return badRequest('Enter a valid email.')
  if (!isRole(role)) return badRequest('Choose Owner or Support.')

  let userId = null
  let link = null
  const { data: existing } = await supabaseAdmin.from('clients').select('id').ilike('email', email).maybeSingle()
  if (existing) {
    userId = existing.id
  } else {
    try {
      ({ userId, link } = await signInLink({ email, origin: appOrigin(request), isNew: true, data: { admin_invite: true } }))
    } catch (e) { return badRequest(e.message, 502) }
  }
  if (!userId) return badRequest('Could not find or create that user.', 500)

  const { data: already } = await supabaseAdmin.from('admin_users').select('role').eq('user_id', userId).maybeSingle()
  if (already) return badRequest(`That person is already an admin (${already.role}).`, 409)
  const { error: insErr } = await supabaseAdmin.from('admin_users').insert({ user_id: userId, role, full_name: fullName, created_by: admin.id })
  if (insErr) return badRequest('Could not add the admin: ' + insErr.message, 500)
  await audit('admin.add', { after: { user_id: userId, email, role }, reason: body.reason })
  return NextResponse.json({ success: true, link, message: link ? 'Admin invited. Copy the sign-in link to send.' : 'Existing user is now an admin.' })
}
