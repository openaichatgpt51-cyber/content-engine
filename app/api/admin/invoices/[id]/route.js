import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'

// Change an invoice's status (sent, paid, overdue, void). Owner only.
export async function PATCH(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('billing.edit')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  if (!['sent', 'paid', 'overdue', 'void'].includes(body.status)) return badRequest('Unknown status.')

  const { data: before } = await supabaseAdmin.from('invoices').select('*').eq('id', params.id).maybeSingle()
  if (!before) return badRequest('Invoice not found.', 404)
  if (['paid', 'void'].includes(before.status)) return badRequest(`This invoice is already ${before.status}.`)

  const now = new Date().toISOString()
  const changes = { status: body.status, ...(body.status === 'paid' ? { paid_at: now } : {}), ...(body.status === 'sent' && !before.sent_at ? { sent_at: now } : {}) }
  const { error: uErr } = await supabaseAdmin.from('invoices').update(changes).eq('id', params.id)
  if (uErr) return badRequest('Could not update the invoice: ' + uErr.message, 500)
  await audit(`invoice.${body.status}`, { client_id: before.client_id, before: { status: before.status }, after: changes, reason: body.reason })
  return NextResponse.json({ success: true, message: `Invoice ${before.number} marked ${body.status}.` })
}
