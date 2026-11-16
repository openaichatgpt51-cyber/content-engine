import { NextResponse } from 'next/server'
import { requireAdminApi, readBodyWithReason, badRequest } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { parseNaira } from '../../../../lib/admin/rules'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Create or replace a client's contract. Replacing ends the old one so the
// history is kept. Owner only.
export async function POST(request) {
  const { error: authErr, audit } = await requireAdminApi('billing.edit')
  if (authErr) return authErr
  const { body, error } = await readBodyWithReason(request)
  if (error) return error
  const amount = parseNaira(body.amount)
  const plan = String(body.plan_name || '').trim().slice(0, 80)
  if (!body.client_id || !plan) return badRequest('Client and plan are required.')
  if (amount == null) return badRequest('Enter the amount in whole naira.')
  if (!DATE.test(body.start_date || '')) return badRequest('Enter a start date.')
  if (body.renewal_date && !DATE.test(body.renewal_date)) return badRequest('Renewal date is not a valid date.')

  const { data: before } = await supabaseAdmin.from('contracts').select('*').eq('client_id', body.client_id).eq('status', 'active').maybeSingle()
  if (before) {
    const { error: endErr } = await supabaseAdmin.from('contracts').update({ status: 'ended' }).eq('id', before.id)
    if (endErr) return badRequest('Could not end the current contract: ' + endErr.message, 500)
  }
  const row = { client_id: body.client_id, plan_name: plan, amount_ngn: amount, cycle: body.cycle === 'annual' ? 'annual' : 'monthly', start_date: body.start_date, renewal_date: body.renewal_date || null }
  const { error: insErr } = await supabaseAdmin.from('contracts').insert(row)
  if (insErr) {
    if (before) await supabaseAdmin.from('contracts').update({ status: 'active' }).eq('id', before.id)
    return badRequest('Could not save the contract: ' + insErr.message, 500)
  }
  await audit(before ? 'contract.replace' : 'contract.create', { client_id: body.client_id, before, after: row, reason: body.reason })
  return NextResponse.json({ success: true, message: 'Contract saved.' })
}
