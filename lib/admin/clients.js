import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { invoiceIsOverdue, monthlyRecurring } from './rules'

export function riskOf(c, now = new Date()) {
  const last = c.last_post_at ? new Date(c.last_post_at).getTime() : 0
  if (c.lifecycle !== 'active') return 'low'
  if (!last || now.getTime() - last > 14 * 86_400_000 || (c.scheduled_7d === 0 && !c.posting_paused)) return 'high'
  if (c.posts_30d <= 1 || c.stale_approvals > 0) return 'medium'
  return 'low'
}

export function statusOf(c) {
  if (c.lifecycle === 'suspended') return { key: 'disabled', label: 'Disabled', tone: '' }
  if (c.lifecycle === 'offboarded') return { key: 'offboarded', label: 'Offboarded', tone: '' }
  if (c.posting_paused) return { key: 'paused', label: 'Paused', tone: 'warn' }
  return { key: 'active', label: 'Active', tone: 'good' }
}

// The Clients list, joined with contract and invoice state.
export async function loadClientRows(now = new Date()) {
  const [{ data: summary, error }, { data: contracts }, { data: invoices }] = await Promise.all([
    supabaseAdmin.from('admin_client_summary').select('*'),
    supabaseAdmin.from('contracts').select('client_id, plan_name, amount_ngn, cycle, status').eq('status', 'active'),
    supabaseAdmin.from('invoices').select('client_id, number, status, due_date, amount_ngn').in('status', ['sent', 'overdue', 'paid']).order('due_date', { ascending: false }),
  ])
  if (error) throw new Error('Could not load clients: ' + error.message)
  const contractBy = Object.fromEntries((contracts || []).map(c => [c.client_id, c]))
  const invoicesBy = {}
  for (const inv of invoices || []) (invoicesBy[inv.client_id] ||= []).push(inv)

  const rows = (summary || []).map(c => {
    const invs = invoicesBy[c.client_id] || []
    const overdue = invs.filter(i => invoiceIsOverdue(i, now))
    const latest = invs[0]
    const invoiceState = overdue.length ? 'overdue' : latest ? (latest.status === 'paid' ? 'paid' : 'sent') : 'none'
    return { ...c, contract: contractBy[c.client_id] || null, overdue, invoiceState, status: statusOf(c), risk: riskOf(c, now) }
  })
  const riskRank = { high: 0, medium: 1, low: 2 }
  rows.sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || (a.company_name || a.email || '').localeCompare(b.company_name || b.email || ''))
  return { rows, mrr: monthlyRecurring(contracts || []) }
}
