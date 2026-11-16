import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'
import { isRole } from '../../../../../lib/admin/permissions'

async function ownerCount() {
  const { count } = await supabaseAdmin.from('admin_users').select('user_id', { count: 'exact', head: true }).eq('role', 'owner')
  return count || 0
}

// Change an admin's role, or disable / enable their sign-in. Owner only.
export async function PATCH(request, { params }) {
  const { error: authErr, admin, audit } = await requireAdminApi('admins.manage')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const { data: target } = await supabaseAdmin.from('admin_users').select('user_id, role').eq('user_id', params.id).maybeSingle()
  if (!target) return badRequest('Admin not found.', 404)

  if (body.role !== undefined) {
    if (!isRole(body.role)) return badRequest('Choose Owner or Support.')
    if (target.role === 'owner' && body.role !== 'owner' && (await ownerCount()) <= 1) return badRequest('At least one Owner must remain.')
    const { error: uErr } = await supabaseAdmin.from('admin_users').update({ role: body.role }).eq('user_id', params.id)
    if (uErr) return badRequest('Could not change the role: ' + uErr.message, 500)
    await audit('admin.role', { before: { user_id: params.id, role: target.role }, after: { role: body.role }, reason: body.reason })
    return NextResponse.json({ success: true, message: 'Role changed.' })
  }
  if (body.action === 'disable' || body.action === 'enable') {
    if (params.id === admin.id) return badRequest('You can’t disable yourself.')
    if (body.action === 'disable' && target.role === 'owner' && (await ownerCount()) <= 1) return badRequest('The last Owner can’t be disabled.')
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(params.id, { ban_duration: body.action === 'disable' ? '876000h' : 'none' })
    if (banErr) return badRequest('Could not change sign-in: ' + banErr.message, 500)
    await audit(`admin.${body.action}`, { after: { user_id: params.id }, reason: body.reason })
    return NextResponse.json({ success: true, message: body.action === 'disable' ? 'Admin disabled.' : 'Admin enabled.' })
  }
  return badRequest('Nothing to change.')
}

// Remove admin access (the person's account itself stays). Owner only.
export async function DELETE(request, { params }) {
  const { error: authErr, admin, audit } = await requireAdminApi('admins.manage')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  if (params.id === admin.id) return badRequest('You can’t remove yourself. Ask another Owner.')
  const { data: target } = await supabaseAdmin.from('admin_users').select('user_id, role').eq('user_id', params.id).maybeSingle()
  if (!target) return badRequest('Admin not found.', 404)
  if (target.role === 'owner' && (await ownerCount()) <= 1) return badRequest('At least one Owner must remain.')
  const { error: dErr } = await supabaseAdmin.from('admin_users').delete().eq('user_id', params.id)
  if (dErr) return badRequest('Could not remove admin access: ' + dErr.message, 500)
  await audit('admin.remove', { before: target, reason: body.reason })
  return NextResponse.json({ success: true, message: 'Admin access removed.' })
}
