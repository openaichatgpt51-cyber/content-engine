import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'

const s = (v, n) => String(v ?? '').trim().slice(0, n)

// Work an email sent to hello@. Owner and Support.
// action: handled | spam | reopen | lead | note
export async function PATCH(request, { params }) {
  const { error: authErr, admin, audit } = await requireAdminApi('inbox.work')
  if (authErr) return authErr
  const b = await request.json().catch(() => null)
  if (!b) return badRequest('Send a JSON body.')

  const { data: msg } = await supabaseAdmin.from('inbox_messages')
    .select('id, status, from_email, from_name, subject, text_body, lead_id, note').eq('id', params.id).maybeSingle()
  if (!msg) return badRequest('Message not found.', 404)

  const now = new Date().toISOString()
  const note = s(b.note, 1000)
  let changes = {}
  let message = 'Done.'

  switch (b.action) {
    case 'handled':
      changes = { status: 'handled', handled_by: admin.id, handled_at: now }
      message = 'Marked handled.'
      break
    case 'spam':
      changes = { status: 'spam', handled_by: admin.id, handled_at: now }
      message = 'Marked as spam.'
      break
    case 'reopen':
      changes = { status: 'new', handled_by: null, handled_at: null }
      message = 'Moved back to New.'
      break
    case 'note':
      if (!note) return badRequest('Write a note.')
      changes = { note: [msg.note, `${admin.name}: ${note}`].filter(Boolean).join('\n') }
      message = 'Note saved.'
      break
    case 'lead': {
      if (msg.lead_id) return badRequest('This email is already a lead.')
      const company = s(b.company, 160)
      const name = s(b.name, 120) || s(msg.from_name, 120) || msg.from_email
      if (!company) return badRequest('Company is required.')
      const lead = {
        name, company, email: s(msg.from_email, 200).toLowerCase(), brands: s(b.brands, 20),
        message: s(`${msg.subject || ''}\n\n${msg.text_body || ''}`, 1000), source: 'email', page: null,
        status: 'new', assigned_to: admin.id,
      }
      const { data, error } = await supabaseAdmin.from('leads').insert(lead).select('id').single()
      if (error) return badRequest('Could not create the lead: ' + error.message, 500)
      await supabaseAdmin.from('lead_events').insert({ lead_id: String(data.id), admin_id: admin.id, kind: 'email', body: `Created from email to hello@: “${s(msg.subject, 120) || 'no subject'}”` })
      changes = { status: 'lead', lead_id: String(data.id), handled_by: admin.id, handled_at: now }
      message = 'Lead created.'
      break
    }
    default:
      return badRequest('Unknown action.')
  }

  const { error } = await supabaseAdmin.from('inbox_messages').update(changes).eq('id', params.id)
  if (error) return badRequest('Could not update the message: ' + error.message, 500)
  await audit(`inbox.${b.action}`, {
    lead_id: changes.lead_id || null,
    before: { status: msg.status, inbox_message_id: msg.id },
    after: changes,
    reason: note || `${b.action}: ${msg.from_email} · ${s(msg.subject, 120)}`,
  })
  return NextResponse.json({ success: true, message, lead_id: changes.lead_id || null })
}
