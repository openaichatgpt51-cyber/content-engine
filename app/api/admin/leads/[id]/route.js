import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'

const STATUSES = ['new', 'contacted', 'demo', 'won', 'lost']

// Work a lead: change status, assign, set next step, add a note. Owner and
// Support. Converting to a client happens in POST /api/admin/clients (Owner).
export async function PATCH(request, { params }) {
  const { error: authErr, admin, audit } = await requireAdminApi('leads.edit')
  if (authErr) return authErr
  const b = await request.json().catch(() => null)
  if (!b) return badRequest('Send a JSON body.')
  const { data: before } = await supabaseAdmin.from('leads').select('id, status, assigned_to, next_step, next_step_at, first_contacted_at').eq('id', params.id).maybeSingle()
  if (!before) return badRequest('Lead not found.', 404)

  const now = new Date().toISOString()
  const changes = {}
  const events = []
  if (b.status) {
    if (!STATUSES.includes(b.status)) return badRequest('Unknown status.')
    // Support may mark a lead won (hand-over); only an Owner converts it into a client.
    if (b.status === 'lost' && !String(b.lost_reason || b.note || '').trim()) return badRequest('Say why the lead was lost.')
    changes.status = b.status
    if (b.status === 'lost') changes.lost_reason = String(b.lost_reason || b.note).trim().slice(0, 300)
    if (b.status !== 'new' && !before.first_contacted_at) changes.first_contacted_at = now
    events.push({ kind: 'status_change', body: `${before.status} → ${b.status}` })
  }
  if (b.assign === 'me') { changes.assigned_to = admin.id; events.push({ kind: 'assigned', body: `Assigned to ${admin.name}` }) }
  if (b.assign === 'none') { changes.assigned_to = null; events.push({ kind: 'assigned', body: 'Unassigned' }) }
  if (typeof b.next_step === 'string') changes.next_step = b.next_step.trim().slice(0, 200) || null
  if (b.next_step_at) changes.next_step_at = new Date(b.next_step_at).toISOString()
  const note = String(b.note || '').trim().slice(0, 1000)
  if (note) events.push({ kind: 'note', body: note })
  if (!Object.keys(changes).length && !events.length) return badRequest('Nothing to change.')

  if (Object.keys(changes).length) {
    const { error } = await supabaseAdmin.from('leads').update({ ...changes, updated_at: now }).eq('id', params.id)
    if (error) return badRequest('Could not update the lead: ' + error.message, 500)
  }
  if (events.length) await supabaseAdmin.from('lead_events').insert(events.map(e => ({ ...e, lead_id: String(params.id), admin_id: admin.id })))
  await audit('lead.update', { lead_id: params.id, before, after: changes, reason: note || events.map(e => e.body).join('; ') })
  return NextResponse.json({ success: true, message: 'Lead updated.' })
}
