import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import {
  riskFlags, ageLabel, formatNaira, invoiceIsOverdue, STUCK_MINUTES, STALE_APPROVAL_HOURS,
  LEAD_RESPONSE_HOURS, unpublishedPlatforms, LIVE_PLATFORMS,
} from './rules'

export const POST_COLS = 'id, client_id, brand_id, topic, posting_status, platforms, reject_reason, created_at, updated_at, linkedin_scheduled_time, instagram_scheduled_time, twitter_scheduled_time, linkedin_posted, instagram_posted, twitter_posted, linkedin_posted_at, linkedin_body_clean, insta_caption_clean, twitter_hook_clean'

// Names for clients and brands, so no screen shows a bare UUID.
export async function loadDirectory(clientIds = null) {
  let cq = supabaseAdmin.from('clients').select('id, email, company_name, lifecycle')
  let bq = supabaseAdmin.from('brands').select('id, client_id, name, is_default')
  if (clientIds && clientIds.length) { cq = cq.in('id', clientIds); bq = bq.in('client_id', clientIds) }
  const [{ data: clients }, { data: brands }] = await Promise.all([cq, bq])
  const clientName = {}
  for (const c of clients || []) clientName[c.id] = c.company_name || c.email || 'Unnamed client'
  const brandName = {}
  for (const b of brands || []) brandName[b.id] = b.name
  return { clients: clients || [], brands: brands || [], clientName, brandName }
}

export function whoLine(dir, clientId, brandId, extra) {
  return [dir.clientName[clientId] || 'Unknown client', brandId ? dir.brandName[brandId] : null, extra].filter(Boolean).join(' · ')
}

// Everything the Today page lists, ranked by urgency.
export async function loadTodayItems(admin, now = new Date()) {
  const owner = admin.role === 'owner'
  const stuckBefore = new Date(now.getTime() - STUCK_MINUTES * 60_000).toISOString()
  const staleBefore = new Date(now.getTime() - STALE_APPROVAL_HOURS * 3_600_000).toISOString()
  const soon = new Date(now.getTime() + 7 * 86_400_000).toISOString()

  const [failed, stuck, stale, queued, tokens, summary, invoices, leads] = await Promise.all([
    supabaseAdmin.from('posts').select(POST_COLS).in('posting_status', ['FAILED', 'PARTIAL']).order('updated_at', { ascending: false }).limit(50),
    supabaseAdmin.from('posts').select(POST_COLS).eq('posting_status', 'IN_PROGRESS').lt('updated_at', stuckBefore).limit(50),
    supabaseAdmin.from('posts').select('id, client_id, brand_id, created_at').eq('posting_status', 'AWAITING_APPROVAL').lt('created_at', staleBefore).limit(500),
    supabaseAdmin.from('posts').select(POST_COLS).in('posting_status', ['PENDING', 'HALTED']).limit(500),
    supabaseAdmin.from('platform_accounts').select('client_id, brand_id, platform, token_valid, expires_at, handle').or(`token_valid.eq.false,expires_at.lte.${soon}`),
    supabaseAdmin.from('admin_client_summary').select('client_id, lifecycle, scheduled_7d, last_post_at, posting_paused'),
    owner ? supabaseAdmin.from('invoices').select('id, client_id, number, amount_ngn, due_date, status').in('status', ['sent', 'overdue']) : supabaseAdmin.from('invoices').select('id, client_id, due_date, status').in('status', ['sent', 'overdue']),
    supabaseAdmin.from('leads').select('id, company, name, brands, created_at, status').eq('status', 'new').order('created_at', { ascending: true }).limit(50),
  ])

  const dir = await loadDirectory()
  const items = []
  const push = (it) => items.push(it)

  // Leads first among the "good news": both roles work them.
  const newLeads = leads.data || []
  if (newLeads.length) {
    const late = newLeads.filter(l => now.getTime() - new Date(l.created_at).getTime() > LEAD_RESPONSE_HOURS * 3_600_000)
    push({
      id: 'leads', kind: 'leads', severity: late.length ? 'warn' : 'good', badge: late.length ? 'Reply late' : 'New lead', rank: late.length ? 2 : 5,
      title: `${newLeads.length} new demo request${newLeads.length > 1 ? 's' : ''} from the website${late.length ? ` (${late.length} waiting over ${LEAD_RESPONSE_HOURS} h)` : ''}`,
      meta: newLeads.slice(0, 3).map(l => `${l.company}${l.brands ? ` (${l.brands} brands)` : ''}`).join(' · '),
      age: `Oldest ${ageLabel(newLeads[0].created_at, now)}`, href: '/admin/leads?status=new', cta: 'Open leads',
    })
  }

  for (const p of failed.data || []) {
    const remaining = unpublishedPlatforms(p).map(x => x.label).join(', ')
    push({
      id: `post-${p.id}`, kind: 'failed', severity: 'bad', badge: p.posting_status === 'FAILED' ? 'Failed' : 'Partial', rank: 1,
      title: `“${p.topic || 'Untitled post'}” ${p.posting_status === 'FAILED' ? 'didn’t publish' : 'only partly published'}`,
      meta: whoLine(dir, p.client_id, p.brand_id, remaining ? `not out on ${remaining}` : null),
      age: ageLabel(p.updated_at, now), href: `/admin/posts/${p.id}`, cta: 'Open post',
    })
  }
  for (const p of stuck.data || []) {
    push({
      id: `stuck-${p.id}`, kind: 'stuck', severity: 'bad', badge: 'Stuck', rank: 1,
      title: `Post stuck “in progress” for ${ageLabel(p.updated_at, now)}`,
      meta: whoLine(dir, p.client_id, p.brand_id, p.topic), age: ageLabel(p.updated_at, now), href: `/admin/posts/${p.id}`, cta: 'Open post',
    })
  }
  for (const t of tokens.data || []) {
    const invalid = t.token_valid === false
    const expired = t.expires_at && new Date(t.expires_at) <= now
    push({
      id: `tok-${t.client_id}-${t.brand_id}-${t.platform}`, kind: 'connections', severity: invalid || expired ? 'bad' : 'warn', badge: 'Reconnect', rank: invalid || expired ? 2 : 3,
      title: invalid || expired
        ? `${t.platform} connection ${expired ? 'expired' : 'invalid'}`
        : `${t.platform} connection expires in ${Math.max(1, Math.ceil((new Date(t.expires_at) - now) / 86_400_000))} day(s)`,
      meta: whoLine(dir, t.client_id, t.brand_id, t.handle ? '@' + t.handle : null), age: '', href: `/admin/clients/${t.client_id}?tab=connections`, cta: 'Open client',
    })
  }
  // Stale approvals grouped per client
  const staleBy = {}
  for (const p of stale.data || []) (staleBy[p.client_id] ||= []).push(p)
  for (const [cid, list] of Object.entries(staleBy)) {
    const oldest = list.reduce((a, b) => (a.created_at < b.created_at ? a : b))
    push({
      id: `stale-${cid}`, kind: 'waiting', severity: 'warn', badge: 'Waiting', rank: 3,
      title: `${list.length} post${list.length > 1 ? 's' : ''} waiting for approval for more than ${STALE_APPROVAL_HOURS} hours`,
      meta: whoLine(dir, cid, null), age: ageLabel(oldest.created_at, now), href: `/admin/clients/${cid}?tab=posts`, cta: 'Open client',
    })
  }
  for (const p of queued.data || []) {
    const flags = riskFlags(p, now)
    if (flags.includes('past_due') && p.posting_status === 'PENDING') {
      push({ id: `due-${p.id}`, kind: 'waiting', severity: 'warn', badge: 'Past due', rank: 2, title: `Approved post is past its scheduled time`, meta: whoLine(dir, p.client_id, p.brand_id, p.topic), age: '', href: `/admin/posts/${p.id}`, cta: 'Open post' })
    }
    if (flags.includes('over_limit')) {
      push({ id: `long-${p.id}`, kind: 'waiting', severity: 'warn', badge: 'Too long', rank: 3, title: `Approved post is over a platform’s character limit`, meta: whoLine(dir, p.client_id, p.brand_id, p.topic), age: '', href: `/admin/posts/${p.id}`, cta: 'Open post' })
    }
  }
  for (const c of summary.data || []) {
    if (c.lifecycle === 'active' && !c.posting_paused && c.scheduled_7d === 0) {
      push({ id: `quiet-${c.client_id}`, kind: 'quiet', severity: 'info', badge: 'Quiet', rank: 4, title: 'Nothing scheduled for the next 7 days', meta: whoLine(dir, c.client_id, null, c.last_post_at ? `last post ${ageLabel(c.last_post_at, now)} ago` : 'never posted'), age: '', href: `/admin/clients/${c.client_id}`, cta: 'Open client' })
    }
  }
  const overdue = (invoices.data || []).filter(i => invoiceIsOverdue(i, now))
  for (const inv of overdue) {
    push({
      id: `inv-${inv.id}`, kind: 'money', severity: 'warn', badge: 'Overdue', rank: 3,
      title: owner ? `Invoice ${inv.number} is overdue · ${formatNaira(inv.amount_ngn)}` : 'Invoice overdue',
      meta: whoLine(dir, inv.client_id, null, owner ? null : 'an Owner follows up'),
      age: ageLabel(inv.due_date + 'T23:59:59Z', now), href: `/admin/clients/${inv.client_id}?tab=${owner ? 'billing' : 'overview'}`, cta: 'Open client',
    })
  }

  items.sort((a, b) => a.rank - b.rank)
  const stats = {
    clientsLive: (summary.data || []).filter(c => c.lifecycle === 'active').length,
    paused: (summary.data || []).filter(c => c.posting_paused).length,
    disabled: (summary.data || []).filter(c => c.lifecycle !== 'active').length,
    failures: (failed.data || []).length + (stuck.data || []).length,
    overdueCount: new Set(overdue.map(i => i.client_id)).size,
    overdueAmount: owner ? overdue.reduce((s, i) => s + Number(i.amount_ngn || 0), 0) : null,
    queued: (queued.data || []).filter(p => p.posting_status === 'PENDING').length,
    liveOnly: LIVE_PLATFORMS,
  }
  return { items, stats }
}

export async function loadNavCounts() {
  const [{ count: failed }, { count: leads }] = await Promise.all([
    supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).in('posting_status', ['FAILED', 'PARTIAL']),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ])
  return { posts: failed || 0, leads: leads || 0 }
}
