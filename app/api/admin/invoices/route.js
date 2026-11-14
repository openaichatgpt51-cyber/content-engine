import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { parseNaira, cleanReason } from '../../../../lib/admin/rules'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Record an invoice raised outside the app (no payment processing). Owner only.
export async function POST(request) {
  const { error: authErr, audit } = await requireAdminApi('billing.edit')
  if (authErr) return authErr
  const b = await request.json().catch(() => null)
  if (!b) return badRequest('Send a JSON body.')
  const number = String(b.number || '').trim().slice(0, 40)
  const amount = parseNaira(b.amount)
  if (!b.client_id || !number) return badRequest('Client and invoice number are required.')
  if (amount == null) return badRequest('Enter the amount in whole naira.')
  for (const k of ['period_start', 'period_end', 'due_date']) if (!DATE.test(b[k] || '')) return badRequest('Fill in the period and due date.')
  if (b.period_end < b.period_start) return badRequest('The period ends before it starts.')
  const status = ['draft', 'sent', 'paid'].includes(b.status) ? b.status : 'sent'

  const { data: contract } = await supabaseAdmin.from('contracts').select('id').eq('client_id', b.client_id).eq('status', 'active').maybeSingle()
  const now = new Date().toISOString()
  const row = {
    client_id: b.client_id, contract_id: contract?.id || null, number, amount_ngn: amount,
    period_start: b.period_start, period_end: b.period_end, due_date: b.due_date, status,
    sent_at: status !== 'draft' ? now : null, paid_at: status === 'paid' ? now : null,
  }
  const { data, error } = await supabaseAdmin.from('invoices').insert(row).select('id').single()
  if (error) return badRequest(error.code === '23505' ? 'That invoice number is already used.' : 'Could not record the invoice: ' + error.message, error.code === '23505' ? 409 : 500)
  await audit('invoice.create', { client_id: b.client_id, after: { ...row, id: data.id }, reason: cleanReason(b.reason) || `Invoice ${number} recorded` })
  return NextResponse.json({ success: true, message: `Invoice ${number} recorded.` })
}
