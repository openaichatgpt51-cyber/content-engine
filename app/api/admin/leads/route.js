import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const s = (v, n) => String(v ?? '').trim().slice(0, n)

// Add a lead by hand (phone call, email to hello@, referral). Owner and Support.
export async function POST(request) {
  const { error: authErr, admin, audit } = await requireAdminApi('leads.edit')
  if (authErr) return authErr
  const b = await request.json().catch(() => null)
  if (!b) return badRequest('Send a JSON body.')
  const lead = { name: s(b.name, 120), email: s(b.email, 200).toLowerCase(), company: s(b.company, 160), brands: s(b.brands, 20), message: s(b.message, 1000), source: s(b.source, 80) || 'manual', page: null, status: 'new', assigned_to: admin.id }
  if (!lead.name || !lead.company) return badRequest('Name and company are required.')
  if (lead.email && !EMAIL.test(lead.email)) return badRequest('That email doesn’t look right.')
  const { data, error } = await supabaseAdmin.from('leads').insert(lead).select('id').single()
  if (error) return badRequest('Could not add the lead: ' + error.message, 500)
  await supabaseAdmin.from('lead_events').insert({ lead_id: String(data.id), admin_id: admin.id, kind: 'created', body: `Added by hand (${lead.source})` })
  await audit('lead.create', { lead_id: data.id, after: lead, reason: 'Lead added by hand' })
  return NextResponse.json({ success: true, id: data.id, message: 'Lead added.' })
}
