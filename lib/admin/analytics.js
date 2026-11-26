import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { median, monthlyRecurring, invoiceIsOverdue } from './rules'
import { lagosDayStart, lagosMonthBounds } from '../usageRules'

const LANG = { en: 'English', fr: 'French', pcm: 'Nigerian Pidgin', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', pt: 'Portuguese', sw: 'Swahili', ar: 'Arabic' }

function group(list, keyFn) {
  const out = {}
  for (const x of list) { const k = keyFn(x); if (k) out[k] = (out[k] || 0) + 1 }
  return Object.entries(out).sort((a, b) => b[1] - a[1])
}

// Supabase returns at most 1,000 rows per request, so page through.
async function fetchAll(build, max = 50000) {
  const out = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function countRows(table, apply) {
  let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true })
  q = apply(q)
  const { count } = await q
  return count || 0
}

// Exact, real-time counts of posts generated (rows in `posts`) and of
// generation requests the app sent to n8n (generation_events).
export async function loadGenerationCounts({ clientId = null, now = new Date() } = {}) {
  const dayStart = lagosDayStart(now).toISOString()
  const { start: monthStart } = lagosMonthBounds(now)
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const scope = q => (clientId ? q.eq('client_id', clientId) : q)
  const [postsToday, posts7d, postsMonth, postsTotal, reqToday, reqMonth, failedToday, blockedMonth] = await Promise.all([
    countRows('posts', q => scope(q).gte('created_at', dayStart)),
    countRows('posts', q => scope(q).gte('created_at', week)),
    countRows('posts', q => scope(q).gte('created_at', monthStart.toISOString())),
    countRows('posts', q => scope(q)),
    countRows('generation_events', q => scope(q).eq('status', 'accepted').gte('created_at', dayStart)),
    countRows('generation_events', q => scope(q).eq('status', 'accepted').gte('created_at', monthStart.toISOString())),
    countRows('generation_events', q => scope(q).eq('status', 'failed').gte('created_at', dayStart)),
    countRows('generation_events', q => scope(q).eq('status', 'blocked').gte('created_at', monthStart.toISOString())),
  ])
  return { postsToday, posts7d, postsMonth, postsTotal, reqToday, reqMonth, failedToday, blockedMonth }
}

export async function loadAnalytics({ days = 30, clientId = null, includeBusiness = false }) {
  const now = new Date()
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const postsQ = () => {
    let q = supabaseAdmin.from('posts').select('id, client_id, brand_id, posting_status, platforms, reject_reason, created_at, linkedin_posted, linkedin_posted_at, linkedin_scheduled_time').gte('created_at', since).order('created_at', { ascending: false })
    return clientId ? q.eq('client_id', clientId) : q
  }
  const errorsQ = () => {
    let q = supabaseAdmin.from('error_logs').select('node_name, platform, error_message, created_at').gte('created_at', since).order('created_at', { ascending: false })
    return clientId ? q.eq('client_id', clientId) : q
  }
  const [posts, errors, { data: profiles }, { data: clients }] = await Promise.all([
    fetchAll(postsQ), fetchAll(errorsQ, 5000),
    supabaseAdmin.from('brand_profiles').select('brand_id, language'),
    supabaseAdmin.from('admin_client_summary').select('client_id, lifecycle, created_at'),
  ])
  const P = posts || []
  const ids = P.map(p => p.id)
  let events = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabaseAdmin.from('post_status_events').select('post_id, to_status, at').in('post_id', ids.slice(i, i + 500))
    events = events.concat(data || [])
  }
  const firstAwait = {}, firstApproved = {}
  for (const e of events) {
    if (e.to_status === 'AWAITING_APPROVAL' && (!firstAwait[e.post_id] || e.at < firstAwait[e.post_id])) firstAwait[e.post_id] = e.at
    if (['PENDING', 'HALTED'].includes(e.to_status) && (!firstApproved[e.post_id] || e.at < firstApproved[e.post_id])) firstApproved[e.post_id] = e.at
  }

  const approvedStatuses = ['PENDING', 'HALTED', 'IN_PROGRESS', 'DONE', 'PARTIAL', 'FAILED']
  const generated = P.length
  const approved = P.filter(p => approvedStatuses.includes(p.posting_status) || firstApproved[p.id]).length
  const published = P.filter(p => ['DONE', 'PARTIAL'].includes(p.posting_status) || p.linkedin_posted === 'YES').length
  const rejected = P.filter(p => p.posting_status === 'REJECTED')
  const decided = approved + rejected.length

  const weekAgo = now.getTime() - 7 * 86_400_000
  const activeClients = new Set([
    ...P.filter(p => new Date(p.created_at).getTime() > weekAgo).map(p => p.client_id),
    ...events.filter(e => new Date(e.at).getTime() > weekAgo && ['PENDING', 'HALTED'].includes(e.to_status)).map(e => P.find(p => p.id === e.post_id)?.client_id).filter(Boolean),
  ])
  const liveClients = (clients || []).filter(c => c.lifecycle === 'active')

  let signIns = null
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const clientIds = new Set((clients || []).map(c => c.client_id))
    signIns = (data?.users || []).filter(u => clientIds.has(u.id) && u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > weekAgo).length
  } catch { signIns = null }

  const liPosts = P.filter(p => String(p.platforms || '').includes('LinkedIn'))
  const liOk = liPosts.filter(p => p.linkedin_posted === 'YES').length
  const liFailed = liPosts.filter(p => p.posting_status === 'FAILED' && p.linkedin_posted !== 'YES').length
  const delayMin = median(liPosts.filter(p => p.linkedin_posted_at && p.linkedin_scheduled_time).map(p => (new Date(p.linkedin_posted_at) - new Date(p.linkedin_scheduled_time)) / 60_000))
  const langBy = Object.fromEntries((profiles || []).map(x => [x.brand_id, x.language]))

  const result = {
    days,
    usage: {
      activeClients: activeClients.size, liveClients: liveClients.length, signIns,
      funnel: [['Generated', generated], ['Approved', approved], ['Published', published]],
      medianApproveHours: median(Object.keys(firstApproved).filter(k => firstAwait[k]).map(k => (new Date(firstApproved[k]) - new Date(firstAwait[k])) / 3_600_000)),
    },
    reliability: {
      linkedin: { ok: liOk, failed: liFailed, rate: liOk + liFailed ? liOk / (liOk + liFailed) : null },
      causes: group(errors || [], e => (e.node_name || 'Unknown step') + (e.platform ? ` (${e.platform})` : '')).slice(0, 6),
      delayMinutes: delayMin,
    },
    content: {
      approvalRate: decided ? approved / decided : null, rejected: rejected.length, decided,
      reasons: group(rejected, p => (p.reject_reason || '').trim().slice(0, 80) || 'No reason given').slice(0, 6),
      languages: group(P.filter(p => ['DONE', 'PARTIAL'].includes(p.posting_status) || p.linkedin_posted === 'YES'), p => LANG[langBy[p.brand_id]] || langBy[p.brand_id] || 'Not set').slice(0, 6),
    },
  }

  if (includeBusiness) {
    const [{ data: contracts }, { data: invoices }] = await Promise.all([
      supabaseAdmin.from('contracts').select('client_id, amount_ngn, cycle, status, start_date'),
      supabaseAdmin.from('invoices').select('amount_ngn, status, due_date, paid_at, sent_at, created_at'),
    ])
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const key = d.toISOString().slice(0, 7)
      const invoiced = (invoices || []).filter(x => x.status !== 'void' && x.status !== 'draft' && (x.sent_at || x.created_at || '').slice(0, 7) === key).reduce((s, x) => s + Number(x.amount_ngn), 0)
      const collected = (invoices || []).filter(x => x.status === 'paid' && (x.paid_at || '').slice(0, 7) === key).reduce((s, x) => s + Number(x.amount_ngn), 0)
      months.push({ key, label: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }), invoiced, collected })
    }
    const overdue = (invoices || []).filter(x => invoiceIsOverdue(x, now))
    result.business = {
      mrr: monthlyRecurring(contracts || []),
      activeContracts: (contracts || []).filter(c => c.status === 'active').length,
      overdueAmount: overdue.reduce((s, x) => s + Number(x.amount_ngn), 0), overdueCount: overdue.length,
      months,
      byLifecycle: group(clients || [], c => c.lifecycle),
      newClients: (clients || []).filter(c => new Date(c.created_at).getTime() > now.getTime() - days * 86_400_000).length,
    }
  }
  return result
}
